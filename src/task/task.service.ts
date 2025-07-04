import { Service } from "@tganzhorn/fastify-modular";
import { BlobStorageService } from "../blobStorage/blobStorage.service.js";
import { StorageQueueService } from "../storageQueue/storageQueue.service.js";
import { DataTableService } from "../dataTable/dataTable.service.js";

import SuperJSON from "superjson";

export type FileTaskSerialized = {
  status: "pending" | "active" | "success" | "error";
  type: string;
  collectableBlobName: null | string;
  returnPayload: null | string;
};

export type FileTaskDeserialized<P extends Record<string, unknown>> = {
  status: "pending" | "active" | "success" | "error";
  type: string;
  collectableBlobName: null | string;
  returnPayload: null | P;
};

export type FileTaskMessageSerialized = {
  taskId: string;
  type: string;
  payload: string;
};

export type FileTaskMessageDeserialized<P extends Record<string, unknown>> = {
  taskId: string;
  type: string;
  payload: P;
};

@Service([BlobStorageService, StorageQueueService, DataTableService])
export class FileTaskService {
  constructor(
    private blobStorageService: BlobStorageService,
    private storageQueueService: StorageQueueService,
    private dataTableService: DataTableService
  ) {}

  private readonly _blobStorageContainerName = "tasks";
  private readonly _storageQueueName = "tasks";
  private readonly _dataTableTableName = "tasks";
  private readonly _dataTableTablePartitionName = "files";

  async createFileTask<P extends Record<string, unknown>>(
    file: Buffer,
    type: string,
    payload: P
  ) {
    const { blobName } = await this.blobStorageService.uploadData(
      file,
      this._blobStorageContainerName
    );

    await this.storageQueueService.sendMessage<FileTaskMessageSerialized>(
      this._storageQueueName,
      {
        taskId: blobName,
        type,
        payload: SuperJSON.stringify(payload),
      }
    );

    await this.dataTableService.createEntity<FileTaskDeserialized<P>>(
      this._dataTableTableName,
      {
        partitionKey: this._dataTableTablePartitionName,
        rowKey: blobName,
        type,
        status: "pending",
        collectableBlobName: null,
        returnPayload: null,
      }
    );

    return { blobName };
  }

  async getFileTaskStatus<P extends Record<string, unknown>>(
    blobName: string
  ): Promise<FileTaskDeserialized<P>> {
    const task = await this.dataTableService.getEntity<FileTaskSerialized>(
      this._dataTableTableName,
      this._dataTableTablePartitionName,
      blobName
    );

    return {
      ...task,
      returnPayload: !task.returnPayload
        ? null
        : SuperJSON.parse(task.returnPayload),
    };
  }

  async finishTask<P extends Record<string, unknown>>(
    taskId: string,
    file: Buffer,
    returnPayload: P
  ) {
    const { blobName: collectableBlobName } =
      await this.blobStorageService.uploadData(
        file,
        this._blobStorageContainerName
      );

    await this.dataTableService.updateEntity<FileTaskSerialized>(
      this._dataTableTableName,
      {
        partitionKey: this._dataTableTablePartitionName,
        rowKey: taskId,
        status: "success",
        collectableBlobName,
        returnPayload: SuperJSON.stringify(returnPayload),
      }
    );

    await this.blobStorageService.delete(
      this._blobStorageContainerName,
      taskId
    );
  }

  async failTask(taskId: string, errorMessage: string) {
    await this.dataTableService.updateEntity(this._dataTableTableName, {
      partitionKey: this._dataTableTablePartitionName,
      rowKey: taskId,
      status: "error",
      returnPayload: SuperJSON.stringify({ message: errorMessage }),
      collectableBlobName: null,
    });
  }

  async popPendingFileTask<P extends Record<string, unknown>>(): Promise<{
    file: Buffer;
    message: FileTaskMessageDeserialized<P>;
  } | null> {
    const message =
      await this.storageQueueService.popMessage<FileTaskMessageSerialized>(
        this._storageQueueName
      );

    if (!message) return null;

    await this.dataTableService.updateEntity<FileTaskSerialized>(
      this._dataTableTableName,
      {
        partitionKey: this._dataTableTablePartitionName,
        rowKey: message.taskId,
        status: "active",
        collectableBlobName: null,
        returnPayload: null,
      }
    );

    const file = await this.blobStorageService.downloadToBuffer(
      this._blobStorageContainerName,
      message.taskId
    );

    return {
      file,
      message: {
        ...message,
        payload: SuperJSON.parse(message.payload),
      },
    };
  }

  async getFileFromSucceededTask<P extends Record<string, unknown>>(
    task: FileTaskDeserialized<P>
  ): Promise<Buffer> {
    if (task.status !== "success") throw new Error("Task has not suceeded!");

    if (!task.collectableBlobName) throw new Error("Task has no collectable!");

    const file = await this.blobStorageService.downloadToBuffer(
      this._blobStorageContainerName,
      task.collectableBlobName
    );

    await this.blobStorageService.delete(
      this._blobStorageContainerName,
      task.collectableBlobName
    );

    return file;
  }
}
