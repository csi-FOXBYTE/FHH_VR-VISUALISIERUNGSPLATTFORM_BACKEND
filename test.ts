import { spawn } from "node:child_process";
import path from "node:path";

const p = spawn("python3", [
  path.join(process.cwd(), "python/convertWMSWMTSToTMS.py"),
  "-u",
  "https://geodienste.leipzig.de/l2/Portal/Luftbild_2024_mit_Beschriftung/MapServer/WMTS/1.0.0/WMTSCapabilities.xml",
  "-l",
  "Portal_Luftbild_2024_mit_Beschriftung",
  "-z",
  "10-10",
]);
p.stdout.on("data", (data) => {
  console.log(`Python Output: ${data.toString()}`);
});

p.stderr.on("data", (data) => {
  console.error(`Python Error: ${data.toString()}`);
});

p.on("close", (code) => {
  console.log(`Python script exited with code ${code}`);
});
