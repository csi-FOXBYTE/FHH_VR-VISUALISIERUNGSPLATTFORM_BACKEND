import { TableClient, TableEntity } from "@azure/data-tables";
import { Service } from "@tganzhorn/fastify-modular";

@Service([])
export class DataTableService {
  private readonly _connectionString: string;

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      throw Error("Please set AZURE_STORAGE_CONNECTION_STRING in your .env");
    }

    this._connectionString = connectionString;
  }

  private async _getClient(tableName: string) {
    const client = TableClient.fromConnectionString(
      this._connectionString,
      tableName
    );

    await client.createTable();

    return client;
  }

  async createEntity<T extends Record<string, unknown>>(
    tableName: string,
    entity: TableEntity<T>
  ) {
    const client = await this._getClient(tableName);

    return await client.createEntity<T>(entity);
  }

  async getEntity<T extends Record<string, unknown>>(
    tableName: string,
    partitionKey: string,
    rowKey: string
  ) {
    const client = await this._getClient(tableName);

    return await client.getEntity<T>(partitionKey, rowKey);
  }

  async updateEntity<T extends Record<string, unknown>>(
    tableName: string,
    entity: TableEntity<Partial<T>>
  ) {
    const client = await this._getClient(tableName);

    return await client.updateEntity(entity, "Merge");
  }
}
