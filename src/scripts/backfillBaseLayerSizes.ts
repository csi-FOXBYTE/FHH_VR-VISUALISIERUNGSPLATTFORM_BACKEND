import { BlobServiceClient } from "@azure/storage-blob";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { calculateContainerSizeBytes } from "../blobStorage/containerSize.js";

const MAX_PARALLEL_CONTAINERS = 4;
const BYTES_PER_GB = 1_000_000_000;

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!connectionString) {
  throw new Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
}

const prisma = new PrismaClient();
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

const baseLayers = await prisma.baseLayer.findMany({
  where: {
    containerName: { not: null },
    sizeGB: 0,
    status: "COMPLETED",
  },
  select: {
    containerName: true,
    id: true,
    name: true,
  },
});

let nextIndex = 0;
const failures: string[] = [];

async function processNextBaseLayer() {
  while (nextIndex < baseLayers.length) {
    const baseLayer = baseLayers[nextIndex++];

    if (!baseLayer?.containerName) continue;

    try {
      const sizeBytes = await calculateContainerSizeBytes(
        blobServiceClient,
        baseLayer.containerName,
      );

      await prisma.baseLayer.update({
        where: { id: baseLayer.id },
        data: { sizeGB: sizeBytes / BYTES_PER_GB },
      });

      console.log(
        `Updated ${baseLayer.name} (${baseLayer.id}): ${sizeBytes} bytes.`,
      );
    } catch (error) {
      failures.push(baseLayer.id);
      console.error(
        `Failed to update ${baseLayer.name} (${baseLayer.id}).`,
        error,
      );
    }
  }
}

try {
  await Promise.all(
    Array.from(
      {
        length: Math.min(MAX_PARALLEL_CONTAINERS, baseLayers.length),
      },
      () => processNextBaseLayer(),
    ),
  );
} finally {
  await prisma.$disconnect();
}

console.log(
  `Backfill finished: ${baseLayers.length - failures.length} updated, ${failures.length} failed.`,
);

if (failures.length > 0) process.exitCode = 1;
