import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const localDirectory = resolve("zmodel");
const peerDirectory = process.env.ZMODEL_PEER_DIR
  ? resolve(process.env.ZMODEL_PEER_DIR)
  : undefined;

if (!peerDirectory) {
  throw new Error("ZMODEL_PEER_DIR must point to the peer repository's zmodel directory.");
}

const listModels = async (directory) =>
  (await readdir(directory))
    .filter((name) => name.endsWith(".zmodel"))
    .sort();

const [localFiles, peerFiles] = await Promise.all([
  listModels(localDirectory),
  listModels(peerDirectory),
]);

if (JSON.stringify(localFiles) !== JSON.stringify(peerFiles)) {
  throw new Error(
    `ZenStack model file sets differ: local=[${localFiles.join(", ")}], peer=[${peerFiles.join(", ")}]`,
  );
}

const drifted = [];
for (const file of localFiles) {
  const [local, peer] = await Promise.all([
    readFile(resolve(localDirectory, file)),
    readFile(resolve(peerDirectory, file)),
  ]);
  if (!local.equals(peer)) drifted.push(file);
}

if (drifted.length > 0) {
  throw new Error(
    `ZenStack model drift detected in: ${drifted.join(", ")}`,
  );
}

console.info(`Verified byte-identical ZenStack models (${localFiles.length} files).`);
