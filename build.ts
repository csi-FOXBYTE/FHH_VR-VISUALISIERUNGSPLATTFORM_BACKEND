import { startBuild } from "./esbuild.js";

(async () => {
  try {
    await startBuild();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
