import { build, context } from "esbuild";
import glob from "tiny-glob";

let lastGlobbedFiles: string = "";

let ctx: Awaited<ReturnType<typeof context>>;

export async function startDev() {
  const entryPoints = await glob("src/**/*.ts");

  const newGlobbedFiles = entryPoints.join("_");

  console.time("Building took");

  if (newGlobbedFiles !== lastGlobbedFiles || !ctx)
    if (ctx) await ctx.dispose();
  ctx = await context({
    entryPoints,
    logLevel: "silent",
    outdir: ".dev",
    bundle: false,
    minify: false,
    platform: "node",
    splitting: false,
    treeShaking: true,
    format: "esm",
    sourcemap: "inline",
  });

  lastGlobbedFiles = newGlobbedFiles;

  await ctx.rebuild();

  console.timeEnd("Building took");
}

export async function startBuild() {
  const entryPoints = await glob("src/**/*.ts");

  await build({
    entryPoints,
    logLevel: "silent",
    outdir: ".dev",
    bundle: false,
    minify: false,
    platform: "node",
    splitting: false,
    treeShaking: true,
    format: "esm",
    sourcemap: "inline",
  });
}
