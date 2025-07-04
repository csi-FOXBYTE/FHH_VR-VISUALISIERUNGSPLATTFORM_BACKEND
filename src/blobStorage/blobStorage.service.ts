import { BlobServiceClient } from "@azure/storage-blob";
import { Service } from "@tganzhorn/fastify-modular";

@Service([])
export class BlobStorageService {
  private readonly _blobServiceClient: BlobServiceClient;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      throw Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
    }

    this._blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
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

  async downloadToBuffer(containerName: string, blobName: string) {
    const client = await this._getClient(containerName, blobName);

    return await client.downloadToBuffer();
  }

  async delete(containerName: string, blobName: string) {
    const client = await this._getClient(containerName, blobName);

    return await client.delete();
  }
}
