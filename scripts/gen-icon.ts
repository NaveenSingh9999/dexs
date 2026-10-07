#!/usr/bin/env node
/**
 * Generates resources/icon.svg (authored geometry) and rasterises it into
 * build/icon-<size>.png + build/icon.ico via rsvg-convert.
 *
 *   node scripts/gen-icon.mjs
 *
 * The tile is a full-bleed square: Windows masks icons itself, so baked-in
 * rounded corners would double up with the shell's own shape.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeIco, type IcoImage } from "./ico.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1024;
const SIZES = [1024, 512, 256, 128, 64, 48, 32, 16];

// three dots read off the user's mockup: big glowing white, then two
// progressively dimmer, smaller satellites.
interface Dot {
  cx: number;
  r: number;
  op: number;
}

const DOTS: Dot[] = [
  { cx: 297, r: 176, op: 1 },
  { cx: 630, r: 105, op: 0.62 },
  { cx: 853, r: 85, op: 0.42 },
];
const CY_DOT = 512;

function dot(d: Dot, i: number): string {
  const glow =
    i === 0
      ? `  <circle cx="${d.cx}" cy="${CY_DOT}" r="${d.r * 1.75}" fill="url(#glow)" />\n`
      : "";
  const shade =
    i === 0
      ? `  <circle cx="${d.cx}" cy="${CY_DOT}" r="${d.r}" fill="url(#pearl)" />\n` +
        `  <circle cx="${d.cx}" cy="${CY_DOT}" r="${d.r}" fill="url(#rim)" />\n`
      : `  <circle cx="${d.cx}" cy="${CY_DOT}" r="${d.r}" fill="#ffffff" fill-opacity="${d.op}" />\n` +
        `  <circle cx="${d.cx - d.r * 0.3}" cy="${CY_DOT - d.r * 0.34}" r="${d.r * 0.55}" fill="url(#sheen)" />\n`;
  return glow + shade;
}

function svg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Dexs">
  <title>Dexs</title>
  <defs>
    <linearGradient id="tile" x1="0.08" y1="0.02" x2="0.9" y2="1">
      <stop offset="0" stop-color="#545b64" />
      <stop offset="0.45" stop-color="#3a4047" />
      <stop offset="1" stop-color="#22262b" />
    </linearGradient>
    <linearGradient id="spec" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.04" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <radialGradient id="pearl" cx="0.36" cy="0.3" r="0.78">
      <stop offset="0" stop-color="#ffffff" />
      <stop offset="0.62" stop-color="#f4f7fa" />
      <stop offset="1" stop-color="#dbe1e8" />
    </radialGradient>
    <radialGradient id="rim" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.72" stop-color="#ffffff" stop-opacity="0" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.55" />
    </radialGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.34" />
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.12" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="sheen" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.45" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#tile)" />
  <rect width="${SIZE}" height="${SIZE}" fill="url(#spec)" />
  <rect x="1.5" y="1.5" width="${SIZE - 3}" height="${SIZE - 3}" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="3" />
${DOTS.map(dot).join("")}
</svg>
`;
}

function must(images: IcoImage[], size: number): IcoImage {
  const found = images.find((i) => i.size === size);
  if (!found) throw new Error(`icon: missing ${size}px render`);
  return found;
}

const pngs: IcoImage[] = [];
mkdirSync(join(root, "resources"), { recursive: true });
mkdirSync(join(root, "build"), { recursive: true });

const svgPath = join(root, "resources", "icon.svg");
writeFileSync(svgPath, svg());
console.log(`icon.svg written (${SIZE}x${SIZE}, square tile)`);

for (const size of SIZES) {
  const out = join(root, "build", `icon-${size}.png`);
  execFileSync("rsvg-convert", [
    "-w",
    String(size),
    "-h",
    String(size),
    "-b",
    "none",
    "-o",
    out,
    svgPath,
  ]);
  pngs.push({ size, data: new Uint8Array(readFileSync(out)) });
  console.log(`  icon-${size}.png`);
}

const main = must(pngs, 512);
writeFileSync(join(root, "build", "icon.png"), Buffer.from(main.data));
console.log("  icon.png (512)");

// runtime asset: shipped inside resources/ for the tray and window icon
const runtime = must(pngs, 256);
writeFileSync(join(root, "resources", "icon.png"), Buffer.from(runtime.data));
console.log("  resources/icon.png (256)");

// tab icon for the renderer bundle
const fav = must(pngs, 64);
mkdirSync(join(root, "src", "renderer", "public"), { recursive: true });
writeFileSync(
  join(root, "src", "renderer", "public", "favicon.png"),
  Buffer.from(fav.data),
);
console.log("  src/renderer/public/favicon.png (64)");

const icoSizes = pngs.filter((p) => p.size <= 256);
writeFileSync(
  join(root, "build", "icon.ico"),
  Buffer.from(encodeIco(icoSizes)),
);
console.log(`  icon.ico (${icoSizes.map((p) => p.size).join(", ")})`);
