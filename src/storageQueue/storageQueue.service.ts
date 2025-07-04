import { QueueServiceClient } from "@azure/storage-queue";
import { Service } from "@tganzhorn/fastify-modular";

@Service([])
export class StorageQueueService {
  private readonly _queueServiceClient: QueueServiceClient;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      throw Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
    }

    this._queueServiceClient =
      QueueServiceClient.fromConnectionString(connectionString);
  }

  private async _getClient(queueName: string) {
    const queueClient = this._queueServiceClient.getQueueClient(queueName);
    await queueClient.createIfNotExists();

    return queueClient;
  }

  async sendMessage<T extends Record<string, unknown>>(
    queueName: string,
    message: T
  ) {
    const client = await this._getClient(queueName);

    return client.sendMessage(JSON.stringify(message));
  }

  async receiveMessage<T extends Record<string, unknown>>(
    queueName: string
  ): Promise<T | null> {
    const client = await this._getClient(queueName);

    const response = await client.receiveMessages({
      numberOfMessages: 1,
    });

    if (response.receivedMessageItems.length === 0) return null;

    return JSON.parse(response.receivedMessageItems[0].messageText);
  }

  async popMessage<T extends Record<string, unknown>>(
    queueName: string
  ): Promise<T | null> {
    const client = await this._getClient(queueName);

    const response = await client.receiveMessages({
      numberOfMessages: 1,
    });

    if (response.receivedMessageItems.length === 0) return null;

    await client.deleteMessage(
      response.receivedMessageItems[0].messageId,
      response.receivedMessageItems[0].popReceipt
    );

    return JSON.parse(response.receivedMessageItems[0].messageText);
  }
}
