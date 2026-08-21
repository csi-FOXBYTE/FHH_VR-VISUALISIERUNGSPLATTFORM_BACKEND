import { PrismaClient } from "@prisma/client";
import { getOwnershipPreflightWithQuery } from "../user/ownership.js";

const prisma = new PrismaClient();

try {
  const result = await getOwnershipPreflightWithQuery((statement) =>
    prisma.$queryRaw(statement),
  );
  console.info(JSON.stringify(result));
  if (!result.readyForReleaseB) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
