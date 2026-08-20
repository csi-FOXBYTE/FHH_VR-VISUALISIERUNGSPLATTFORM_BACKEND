import { BlobServiceClient } from "@azure/storage-blob";

export async function calculateContainerSizeBytes(
  blobServiceClient: BlobServiceClient,
  containerName: string,
) {
  const containerClient = blobServiceClient.getContainerClient(containerName);

  if (!(await containerClient.exists())) {
    throw new Error(`Container ${containerName} does not exist.`);
  }

  let sizeBytes = 0;

  for await (const blob of containerClient.listBlobsFlat()) {
    const contentLength = blob.properties.contentLength;

    if (typeof contentLength !== "number") {
      throw new Error(
        `Blob ${containerName}/${blob.name} has no content length.`,
      );
    }

    sizeBytes += contentLength;
  }

  return sizeBytes;
}
