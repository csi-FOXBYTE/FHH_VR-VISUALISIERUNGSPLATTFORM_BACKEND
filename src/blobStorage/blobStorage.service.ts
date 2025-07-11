import {
  BlobServiceClient,
  BlockBlobUploadStreamOptions,
} from "@azure/storage-blob";
import { Service } from "@tganzhorn/fastify-modular";
import { Readable } from "node:stream";

@Service([])
export class BlobStorageService {
  private readonly _blobServiceClient: BlobServiceClient;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      throw Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
    }

    this._blobServiceClient = BlobServiceClient.fromConnectionString(
      connectionString,
      {}
    );
  }

  private async _getClient(containerName: string, blobName: string) {
    const containerClient =
      this._blobServiceClient.getContainerClient(containerName);

    await containerClient.createIfNotExists();

    return containerClient.getBlockBlobClient(blobName);
  }

  private async _createBlobName(containerName: string) {
    const containerClient =
      this._blobServiceClient.getContainerClient(containerName);

    for (let i = 0; i < 512; i++) {
      const blobName = crypto.randomUUID();

      if (!(await containerClient.getBlockBlobClient(blobName).exists()))
        return blobName;
    }

    throw new Error("Could not find a free blob name!");
  }

  async uploadData(
    data: Buffer | Blob,
    containerName: string,
    blobName?: string
  ) {
    if (!blobName) blobName = await this._createBlobName(containerName);

    const client = await this._getClient(containerName, blobName);

    const response = await client.uploadData(data);

    return { blobName, ...response };
  }

  async uploadStream(
    data: Readable,
    containerName: string,
    blobName?: string,
    onProgress?: BlockBlobUploadStreamOptions["onProgress"]
  ) {
    if (!blobName) blobName = await this._createBlobName(containerName);

    const client = await this._getClient(containerName, blobName);

    const response = await client.uploadStream(data, 4 * 1024 * 1024, 1, {
      onProgress,
    });

    return { blobName, ...response };
  }

  async downloadToBuffer(containerName: string, blobName: string) {
    console.log({ containerName, blobName });
    const client = await this._getClient(containerName, blobName);

    return await client.downloadToBuffer();
  }

  async downloadToStream(containerName: string, blobName: string) {
    const client = await this._getClient(containerName, blobName);

    return await client.download();
  }

  async downloadToFile(
    containerName: string,
    blobName: string,
    filePath: string
  ) {
    const client = await this._getClient(containerName, blobName);

    return await client.downloadToFile(filePath);
  }

  async delete(containerName: string, blobName: string) {
    const client = await this._getClient(containerName, blobName);

    return await client.delete();
  }
}
