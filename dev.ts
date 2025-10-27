import chokidar from "chokidar";
import { startDev } from "./esbuild.js";
import { ChildProcess, spawn } from "node:child_process";

let serverProcess: ChildProcess | null = null;

// Launch (or relaunch) the built server
async function startServer() {
  // if there’s already a running server, kill it and wait for it to exit
  if (serverProcess && serverProcess.exitCode === null) {
    await new Promise<void>((resolve) => {
      // attach exit handler before killing
      serverProcess!.once("exit", resolve);
      serverProcess!.kill();
    });
  }

  // spawn a new one
  serverProcess = spawn("node", ["--enable-source-maps",".dev/index.js"], { stdio: "inherit" });

  // clear reference on exit
  serverProcess.on("exit", () => {
    serverProcess = null;
  });

  // handle spawn errors
  serverProcess.on("error", (err) => {
    console.error("Failed to start server process:", err);
    serverProcess = null;
  });
}

async function safeBuild(retries = 1) {
  try {
    await startDev();
  } catch (err: any) {
    // EBUSY or sharing violation on Windows
    if (retries > 0 && /EBUSY|EPERM/i.test(err.message)) {
      console.warn("File busy, retrying build in 200ms…");
      await new Promise((r) => setTimeout(r, 200));
      return safeBuild(retries - 1);
    }
    throw err;
  }
}

(async function () {
  // 1) Do an initial build
  await safeBuild(5);

  // 2) Start server after initial build
  await startServer();

  // 3) Watch your source tree
  const watcher = chokidar.watch("src", {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
    ignored: ["src/**/*.map"], // ignore sourcemaps or other artifacts
  });

  // Debounce rapid file changes into one rebuild + restart
  let rebuildTimeout: ReturnType<typeof setTimeout> | null = null;
  watcher.on("all", (event, path) => {
    console.log(`${path} changed (${event}), scheduling rebuild...`);

    if (rebuildTimeout) {
      clearTimeout(rebuildTimeout);
    }

    rebuildTimeout = setTimeout(async () => {
      // reset before running so future clears work correctly
      rebuildTimeout = null;

      console.log("Rebuilding...");
      try {
        await safeBuild(5);
        console.log("Build succeeded, restarting server...");
        await startServer();
      } catch (err) {
        console.error("Build failed:", err);
      }
    }, 1000);
  });
})();
