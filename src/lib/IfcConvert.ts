import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import { temporaryFile } from "tempy";
import { join } from "path";
import os from "os";

const execFileAsync = promisify(execFile);

/**
 * Converts an IFC file buffer by writing it to a temporary file,
 * invoking IfcConvert.exe, and returning the converted output as a Buffer.
 * Cleans up temporary files in all cases (success or error).
 *
 * @param inputBuffer - Buffer containing the contents of the IFC file to convert.
 * @param outputExtension - The desired extension for the converted file (e.g., 'obj', 'stl').
 * @returns A Promise that resolves to a Buffer containing the converted file.
 * @throws If writing, conversion, or reading fails.
 */
export async function convertIfcBuffer(
  inputBuffer: Buffer,
  outputExtension: string
): Promise<Buffer> {
  // Create temporary file paths
  const tempInputPath = temporaryFile({ extension: "ifc" });
  const tempOutputPath = temporaryFile({ extension: outputExtension });

  let outputBuffer: Buffer;

  try {
    // Write the IFC buffer to a temp file
    await fs.writeFile(tempInputPath, inputBuffer);

    const platform = os.platform();
    const arch = os.arch();

    let path: string;

    switch (platform) {
      case "win32":
        path = join(
          import.meta.dirname,
          "../../bin/ifcConvert/ifc-win-x64.exe"
        );
        break;
      case "linux":
        path = join(import.meta.dirname, "../../bin/ifcConvert/ifc-lin-x64");
        break;
      case "darwin":
        switch (arch) {
          case "x64":
            path = join(
              import.meta.dirname,
              "../../bin/ifcConvert/ifc-mac-x64"
            );
            break;
          case "arm64":
            path = join(
              import.meta.dirname,
              "../../bin/ifcConvert/ifc-mac-m1-x64"
            );
            break;
        }
      default:
        throw new Error(`Did not find distributable for ${platform}/${arch}!`);
    }

    // Call IfcConvert.exe on the temporary input, writing to temporary output
    await execFileAsync(path, [tempInputPath, tempOutputPath]);

    // Read the converted file back into a Buffer
    outputBuffer = await fs.readFile(tempOutputPath);
  } catch (err) {
    // On any error, rethrow after cleanup in finally block
    throw new Error(
      `Conversion failed:\n` +
        `  Input Temp: ${tempInputPath}\n` +
        `  Output Temp: ${tempOutputPath}\n` +
        `  ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    // Clean up both temp files. Ignore errors if files do not exist or cannot be deleted.
    try {
      await fs.unlink(tempInputPath);
    } catch {
      /* ignore */
    }
    try {
      await fs.unlink(tempOutputPath);
    } catch {
      /* ignore */
    }
  }

  return outputBuffer;
}
