// electron-builder afterPack hook.
//
// Two jobs:
//
//  1. sherpa-onnx ships its .node without an RPATH, so the dynamic linker
//     cannot find libonnxruntime.so that sits right next to it. Point the
//     binary at its own directory instead. No-op on Windows (PE has no RPATH)
//     and when the file is already patched.
//
//  2. Download the speech models into `<app>/resources/models`, so an install
//     dictates immediately with nothing to fetch. Set DEXS_SKIP_MODELS=1 to
//     leave them out (faster builds, app downloads on first run instead).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The models the installer must ship. Shared with the app's catalog. */
const MANIFEST = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(
      new URL("./model-manifest.json", import.meta.url),
      "utf8",
    ),
  ),
);
const MODELS = MANIFEST.models;

const SEP =
  "https://huggingface.co/csukuangfj/sherpa-onnx/{id}/resolve/main/{file}";

/**
 * @param {import("electron-builder").AfterPackContext} context
 * @returns {Promise<void>}
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") patchRpaths(context.appOutDir);
  if (process.env.DEXS_SKIP_MODELS !== "1") await bundleModels(context);
}

function patchRpaths(root) {
  const modules = join(root, "app.asar.unpacked", "node_modules");
  if (!existsSync(modules)) return;

  for (const entry of readdirSync(modules)) {
    if (!entry.startsWith("sherpa-onnx-")) continue;
    const node = join(modules, entry, "sherpa-onnx.node");
    if (!existsSync(node)) continue;
    try {
      execFileSync("patchelf", ["--set-rpath", "$ORIGIN", node], {
        stdio: "ignore",
      });
      console.log(`[afterPack] rpath $ORIGIN -> ${entry}`);
    } catch (e) {
      console.warn(
        `[afterPack] could not patch ${entry} (${e.message}). ` +
          "Install patchelf on the build host, or launch with " +
          `LD_LIBRARY_PATH pointing at ${join(modules, entry)}.`,
      );
    }
  }
}

/**
 * Copy models that are already present in the user's home folder, and download
 * anything that is missing. Nothing is hard-coded to one host: the same logic
 * runs on the CI runners, which is what makes the installers self-sufficient.
 */
async function bundleModels(context) {
  const target = join(context.appOutDir, "resources", "models");
  const local = join(homedir(), ".dexs", "models");
  mkdirSync(target, { recursive: true });

  for (const model of MODELS) {
    const done = model.files.every((f) =>
      existsSync(join(target, model.id, f)),
    );
    if (done) continue;

    for (const file of model.files) {
      const dest = join(target, model.id, file);
      if (existsSync(dest) && statSync(dest).size > 0) continue;
      const cached = join(local, model.id, file);
      mkdirSync(join(target, model.id), { recursive: true });
      if (existsSync(cached) && statSync(cached).size > 0) {
        copyFileSync(cached, dest);
        console.log(`[afterPack] model cached: ${model.id}/${file}`);
        continue;
      }
      const url = SEP.replace("{id}", model.id).replace("{file}", file);
      process.stdout.write(`[afterPack] downloading ${model.id}/${file}\n`);
      try {
        await download(url, dest);
      } catch (e) {
        console.warn(
          `[afterPack] could not fetch ${file} (${e.message}). ` +
            "The app will download it on first run.",
        );
      }
    }
  }
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error("empty response");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(dest, buffer);
}
