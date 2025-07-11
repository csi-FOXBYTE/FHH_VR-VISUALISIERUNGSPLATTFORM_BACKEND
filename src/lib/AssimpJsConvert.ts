// @ts-expect-error has no types
import assimpjs from "assimpjs";
import { rm, writeFile } from "fs/promises";
import { temporaryFile } from "tempy";

export async function convertWithAssimpJs(
  extension: string,
  buffer: Buffer
): Promise<Buffer> {
  const inputFilePath = temporaryFile({ extension });

  await writeFile(inputFilePath, buffer);
  try {
    const ajs = await assimpjs();

    let fileList = new ajs.FileList();

    fileList.AddFile(inputFilePath, buffer);

    let result = ajs.ConvertFileList(fileList, "glb2");

    if (!result.IsSuccess() || result.FileCount() == 0) {
      throw new Error(String(result));
    }

    await rm(inputFilePath);

    console.log(result.GetFile(0).GetContent());

    return result.GetFile(0).GetContent();
  } catch (e) {
    await rm(inputFilePath);
    throw e;
  }
}
