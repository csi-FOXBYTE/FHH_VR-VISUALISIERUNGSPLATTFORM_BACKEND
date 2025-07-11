import chokidar from "chokidar";
import startBuild from "./esbuild.js";
import { ChildProcess, spawn } from "node:child_process";

let serverProcess: ChildProcess | null = null;

// Launch (or relaunch) the built server
function startServer() {
  // if there’s already a running server, kill it
  if (serverProcess) {
    serverProcess.kill();
  }

  // spawn a new one
  serverProcess = spawn("node", ["build/index.js"], { stdio: "inherit" });

  serverProcess.on("exit", (code, signal) => {
    if (signal) {
      console.log(`Server was killed by signal: ${signal}`);
    } else {
      console.log(`Server exited with code: ${code}`);
    }
  });
}

(async function () {
  // 1) Do an initial build
  await startBuild();

  // 2) Start server after initial build
  startServer();

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
    console.log(`File ${path} changed (${event}), scheduling rebuild…`);
    if (rebuildTimeout) clearTimeout(rebuildTimeout);
    rebuildTimeout = setTimeout(async () => {
      console.log("Rebuilding…");
      try {
        await startBuild();
        console.log("Build succeeded, restarting server…");
        startServer();
      } catch (err) {
        console.error("Build failed:", err);
      }
    }, 250);
  });
})();
