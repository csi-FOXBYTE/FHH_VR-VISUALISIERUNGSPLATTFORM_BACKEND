import { execFile } from "child_process";
import os from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function cityGMLToCityJSON(folder: string) {
  const platform = os.platform();

  let path: string;

  switch (platform) {
    case "win32":
      path = join(
        import.meta.dirname,
        "../../bin/citygml-tools-2.4.0/citygml-tools.bat"
      );
      break;
    case "linux":
    case "darwin":
      path = join(
        import.meta.dirname,
        "../../bin/citygml-tools-2.4.0/citygml-tools"
      );
      break;
    default:
      throw new Error(`Did not find redistributable for ${platform}!`);
  }

  await execFileAsync(path, ["to-cityjson", folder], {
    shell: true,
  });
}
