import {
  BlobSASPermissions,
  BlobServiceClient,
  BlockBlobUploadStreamOptions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import {
  createService,
  InferService,
  ServiceContainer,
} from "@csi-foxbyte/fastify-toab";
import dayjs from "dayjs";
import { Readable } from "stream";
import { getDeleteBlobWorkerQueue } from "./workers/deleteBlob.worker.js";

const blobStorageService = createService("blobStorage", async ({ queues }) => {
  const deleteBlobQueue = getDeleteBlobWorkerQueue(queues);

  async function deleteLater(
    containerName: string,
    blobName: string,
    delayMs: number
  ) {
    await deleteBlobQueue.add(
      `${containerName}/${blobName}`,
      { blobName, containerName },
      {
        delay: delayMs,
      }
    );
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!connectionString) {
    throw Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    connectionString,
    {}
  );

  async function _getClient(containerName: string, blobName: string) {
    const containerClient = blobServiceClient.getContainerClient(containerName);

    await containerClient.createIfNotExists();

    return containerClient.getBlockBlobClient(blobName);
  }

  async function _createBlobName(containerName: string) {
    const containerClient = blobServiceClient.getContainerClient(containerName);

    for (let i = 0; i < 512; i++) {
      const blobName = crypto.randomUUID();

      if (!(await containerClient.getBlockBlobClient(blobName).exists()))
        return blobName;
    }

    throw new Error("Could not find a free blob name!");
  }

  return {
    async uploadData(
      data: Buffer | Blob,
      containerName: string,
      blobName?: string
    ) {
      if (!blobName) blobName = await _createBlobName(containerName);

      const client = await _getClient(containerName, blobName);

      const response = await client.uploadData(data);

      return { blobName, href: client.url.toString(), ...response };
    },

    async getUploadSASUrl(containerName: string) {
      const blobName = await _createBlobName(containerName);

      const client = await _getClient(containerName, blobName);

      const permissions = new BlobSASPermissions();
      permissions.create = true;
      permissions.write = true;
      permissions.add = true;
      permissions.read = true;

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions,
          expiresOn: dayjs().add(1, "day").toDate(),
        },
        blobServiceClient.credential as StorageSharedKeyCredential
      );

      await deleteLater(containerName, blobName, 24 * 60 * 60 * 1000); // Delete after 1 day

      return `${client.url}?${sasToken.toString()}`;
    },

    getContainerSASToken(
      containerName: string,
      permissions: BlobSASPermissions
    ) {
      return generateBlobSASQueryParameters(
        { containerName, permissions, expiresOn: dayjs().add(1, "day").toDate() },
        blobServiceClient.credential as StorageSharedKeyCredential,
        
      );
    },

    getContainerReadSASUrl(containerName: string) {
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      const permissions = new BlobSASPermissions();
      permissions.read = true;

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          permissions,
          expiresOn: dayjs().add(1, "day").toDate(),
        },
        blobServiceClient.credential as StorageSharedKeyCredential
      );

      return `${containerClient.url}?${sasToken.toString()}`;
    },

    async uploadStream(
      data: Readable,
      containerName: string,
      blobName?: string,
      onProgress?: BlockBlobUploadStreamOptions["onProgress"]
    ) {
      if (!blobName) blobName = await _createBlobName(containerName);

      const client = await _getClient(containerName, blobName);

      const response = await client.uploadStream(data, 4 * 1024 * 1024, 1, {
        onProgress,
      });

      return { blobName, href: client.url.toString(), ...response };
    },

    async downloadToBuffer(containerName: string, blobName: string) {
      console.log({ containerName, blobName });
      const client = await _getClient(containerName, blobName);

      return await client.downloadToBuffer();
    },

    async downloadToStream(containerName: string, blobName: string) {
      const client = await _getClient(containerName, blobName);

      return await client.download();
    },

    async downloadToFile(
      containerName: string,
      blobName: string,
      filePath: string
    ) {
      const client = await _getClient(containerName, blobName);

      return await client.downloadToFile(filePath);
    },

    async delete(containerName: string, blobName: string) {
      const client = await _getClient(containerName, blobName);

      return await client.delete();
    },

    deleteLater,
  };
});

/*
AUTOGENERATED!
*/

export { blobStorageService };
export type BlobStorageService = InferService<typeof blobStorageService>;
export function getBlobStorageService(deps: ServiceContainer) {
  return deps.get<BlobStorageService>(blobStorageService.name);
}
