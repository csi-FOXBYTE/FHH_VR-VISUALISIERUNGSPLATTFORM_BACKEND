import {
  BlobSASPermissions,
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import {
  createService,
} from "@csi-foxbyte/fastify-toab";
import dayjs from "dayjs";
import { Readable } from "stream";
import { getBlobStorageDeleteBlobWorkerQueue, getTokenService } from "../@internals/index.js";
import { calculateContainerSizeBytes } from "./containerSize.js";

const blobStorageService = createService(
  "blobStorage",
  async ({ queues, services }) => {
    const tokenService = await getTokenService(services);

    async function deleteLater(
      containerName: string,
      blobName: string,
      delayMs: number
    ) {
      // Sandboxed converter processes intentionally initialize services without
      // worker queues. Resolve this queue only in the API/worker process that
      // actually schedules deferred deletion.
      const deleteBlobQueue = getBlobStorageDeleteBlobWorkerQueue(queues);

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
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      await containerClient.createIfNotExists();

      return containerClient.getBlockBlobClient(blobName);
    }

    async function _createBlobName(containerName: string) {
      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      for (let i = 0; i < 512; i++) {
        const blobName = crypto.randomUUID();

        if (!(await containerClient.getBlockBlobClient(blobName).exists()))
          return blobName;
      }

      throw new Error("Could not find a free blob name!");
    }

    async function verifyUploadToken(token: string) {
      const {
        payload: { blobName, containerName },
      } = await tokenService.verifyToken<{
        blobName: string;
        containerName: string;
      }>(token);

      return { blobName, containerName };
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

      getContainerSASToken(
        containerName: string,
        permissions: BlobSASPermissions
      ) {
        return generateBlobSASQueryParameters(
          {
            containerName,
            permissions,
            expiresOn: dayjs().add(1, "day").toDate(),
          },
          blobServiceClient.credential as StorageSharedKeyCredential
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
        blobName?: string
      ) {
        if (!blobName) blobName = await _createBlobName(containerName);

        const client = await _getClient(containerName, blobName);

        const response = await client.uploadStream(data, 1 * 1024 * 1024, 1);

        return { blobName, href: client.url.toString(), ...response };
      },

      async stageBlock(data: Buffer, token: string, blockId: string) {
        const { blobName, containerName } = await verifyUploadToken(token);

        const client = await _getClient(containerName, blobName);

        await client.stageBlock(blockId, data, data.length);
      },

      async createUploadToken(containerName: string) {
        const blobName = await _createBlobName(containerName);

        const token = await tokenService.createToken(
          { containerName, blobName },
          "1d"
        );

        await deleteLater(containerName, blobName, 7 * 24 * 60 * 60 * 1000); // Delete after 7 days

        return token;
      },

      verifyUploadToken,

      async commitBlock(token: string) {
        const { blobName, containerName } = await verifyUploadToken(token);

        const client = await _getClient(containerName, blobName);

        const blockListResponse = await client.getBlockList("uncommitted");
        const blocks = blockListResponse.uncommittedBlocks ?? [];

        // commitBlockList assembles the blob in the order given here, NOT in
        // block-id order. The list returned by the service reflects upload
        // order, and the client uploads blocks concurrently, so committing it
        // as-is scrambles every file larger than one block.
        //
        // The index is encoded in the block id (see /uploadBlock: base64 of
        // the zero-padded index), so sort by it explicitly.
        // Committing an empty list would replace an already committed blob
        // with a zero-byte one, which is what a repeated /commitUpload does.
        if (blocks.length === 0) {
          throw new Error(
            `No staged blocks for this upload; refusing to commit an empty blob.`
          );
        }

        const indexed = blocks.map((block) => {
          const decoded = Buffer.from(block.name, "base64").toString("utf8");
          const index = Number.parseInt(decoded, 10);
          if (!Number.isFinite(index)) {
            throw new Error(
              `Block id "${block.name}" does not carry a usable index; ` +
                `refusing to commit an upload whose order cannot be determined.`
            );
          }
          return { index, name: block.name };
        });

        indexed.sort((a, b) => a.index - b.index);

        // A missing block would silently produce a truncated file that still
        // parses far enough to look plausible.
        indexed.forEach(({ index }, position) => {
          if (index !== position) {
            throw new Error(
              `Upload is incomplete: expected block ${position}, found ${index}. ` +
                `${indexed.length} of at least ${index + 1} blocks were staged.`
            );
          }
        });

        await client.commitBlockList(indexed.map(({ name }) => name));
      },

      async deleteContainer(containerName: string) {
        const containerClient =
          blobServiceClient.getContainerClient(containerName);

        containerClient.deleteIfExists({});
      },

      async getContainerSizeBytes(containerName: string) {
        return await calculateContainerSizeBytes(
          blobServiceClient,
          containerName,
        );
      },

      async downloadToBuffer(containerName: string, blobName: string) {
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
  }
);

export default blobStorageService;
