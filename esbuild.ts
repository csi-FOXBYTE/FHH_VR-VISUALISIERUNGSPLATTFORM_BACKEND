import { build } from "esbuild";
import glob from "tiny-glob";

export default async function startBuild() {
  const entryPoints = await glob("src/**/*.ts");

  await build({
    entryPoints,
    logLevel: "silent",
    outdir: "build",
    bundle: false,
    minify: true,
    platform: "node",
    splitting: true,
    treeShaking: true,
    format: "esm",
    sourcemap: true,
  });
}

startBuild();
