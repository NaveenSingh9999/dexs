/**
 * Minimal ICO encoder: a 6-byte ICONDIR, one 16-byte ICONDIRENTRY per image,
 * then the raw PNG payloads. PNG-compressed entries (Vista+) keep the icon
 * crisp at every size without a second image codec.
 */

export interface IcoImage {
  size: number;
  data: Uint8Array;
}

const HEADER = 6;
const ENTRY = 16;

/** Returns the byte length an ICO built from `images` will occupy. */
export function icoByteLength(images: IcoImage[]): number {
  return (
    HEADER +
    ENTRY * images.length +
    images.reduce((n, i) => n + i.data.length, 0)
  );
}

/** Serialises `images` (already square, <=256px) into a single .ico file. */
export function encodeIco(images: IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error("ico: no images");
  if (images.length > 255) throw new Error("ico: too many images");

  const seen = new Set<number>();
  for (const img of images) {
    if (!Number.isInteger(img.size) || img.size < 1 || img.size > 256)
      throw new Error(`ico: invalid size ${img.size}`);
    if (img.size > 255 && img.size !== 256)
      throw new Error(`ico: unsupported size ${img.size}`);
    if (img.data.length > 0xffff_ffff) throw new Error("ico: image too large");
    if (seen.has(img.size)) throw new Error(`ico: duplicate size ${img.size}`);
    seen.add(img.size);
  }

  const out = new Uint8Array(icoByteLength(images));
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = HEADER + ENTRY * images.length;
  images.forEach((img, i) => {
    const at = HEADER + ENTRY * i;
    view.setUint8(at, img.size === 256 ? 0 : img.size); // width, 0 = 256
    view.setUint8(at + 1, img.size === 256 ? 0 : img.size); // height
    view.setUint8(at + 2, 0); // palette size (none)
    view.setUint8(at + 3, 0); // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, img.data.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(img.data, offset);
    offset += img.data.length;
  });

  return out;
}
