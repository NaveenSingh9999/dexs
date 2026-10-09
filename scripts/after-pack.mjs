// electron-builder afterPack hook.
//
// sherpa-onnx ships its .node without an RPATH, so the dynamic linker cannot
// find libonnxruntime.so that sits right next to it, and every launch needs
// LD_LIBRARY_PATH set by hand. Point the binary at its own directory instead.
// No-op on Windows (PE has no RPATH) and when the file is already patched.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {import("electron-builder").AfterPackContext} context
 * @returns {Promise<void>}
 */
export default async function afterPack(context) {
  if (context.electronPlatformName === "win32") return;

  const root = context.appOutDir;
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
