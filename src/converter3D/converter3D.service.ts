import { Service } from "@tganzhorn/fastify-modular";
import { FileTaskService } from "../task/task.service.js";
import { Piscina } from "piscina";
@Service([FileTaskService])
export class Converter3DService {
  private _maxConcurrentConversions = 2;
  private _activeConversions = 0;
  private readonly _convertPool: Piscina<
    { file: Buffer; fileName: string },
    {
      serializedDocument: Uint8Array;
      modelMatrix: number[];
    }
  >;

  constructor(private fileTaskService: FileTaskService) {
    this._convertPool = new Piscina({
      filename: new URL(
        "./workers/convert.worker.js",
        import.meta.url
      ).toString(),
      maxThreads: this._maxConcurrentConversions,
    });
  }

  async upload(file: Buffer, fileName: string, srcSRS: string) {
    const { blobName } = await this.fileTaskService.createFileTask(
      file,
      "converter3D",
      {
        fileName,
        srcSRS,
      }
    );

    return { blobName };
  }

  async collect(blobName: string) {
    const task = await this.fileTaskService.getFileTaskStatus<{
      modelMatrix: number[];
    }>(blobName);

    if (task.status !== "success") return { status: task.status };

    const file = await this.fileTaskService.getFileFromSucceededTask<{
      modelMatrix: number[];
    }>(task);

    return {
      status: task.status,
      buffer64: file.toString("base64"),
      modelMatrix: task.returnPayload!.modelMatrix,
    };
  }

  async checkForConvertable() {
    if (this._activeConversions++ >= this._maxConcurrentConversions) return;

    const task = await this.fileTaskService.popPendingFileTask<{
      fileName: string;
      srcSRS: string;
    }>();

    if (!task) {
      this._activeConversions--;
      return;
    }

    try {
      const converted = await this._convertPool.run({
        file: task.file,
        fileName: task.message.payload.fileName,
      });

      await this.fileTaskService.finishTask(
        task.message.taskId,
        Buffer.from(converted.serializedDocument),
        {
          modelMatrix: converted.modelMatrix,
        }
      );
    } catch (e) {
      await this.fileTaskService.failTask(task.message.taskId, String(e));
    }

    this._activeConversions--;

    this.checkForConvertable();
  }
}
