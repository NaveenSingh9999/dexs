import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { MODELS } from "./models";

/**
 * The installer only knows it must ship what this manifest lists. The
 * recogniser only loads what the catalog lists. If the two drift, an install
 * can be missing exactly the file the engine needs, so pin them together.
 */
const manifest = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "scripts", "model-manifest.json"), "utf8"),
) as { models: { id: string; role: string; files: string[] }[] };

describe("installer manifest", () => {
  it("lists the models the app can use", () => {
    expect(manifest.models.map((m) => m.id).sort()).toEqual(
      MODELS.map((m) => m.id).sort(),
    );
  });

  it("lists every file the recogniser opens", () => {
    for (const model of manifest.models) {
      const spec = MODELS.find((m) => m.id === model.id)!;
      expect(model.files.sort()).toEqual(spec.files.map((f) => f.name).sort());
    }
  });

  it("keeps the role the picker groups by", () => {
    for (const model of manifest.models) {
      const spec = MODELS.find((m) => m.id === model.id)!;
      expect(model.role).toBe(spec.role);
    }
  });
});
