import { describe, expect, it } from "vitest";
import { encodeIco, icoByteLength, type IcoImage } from "./ico";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function fakePng(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  buf.set(PNG_MAGIC, 0);
  return buf;
}

function entry(buf: Uint8Array, index: number): DataView {
  return new DataView(buf.buffer, buf.byteOffset + 6 + index * 16, 16);
}

describe("encodeIco", () => {
  it("writes a 6-byte ICONDIR header", () => {
    const out = encodeIco([{ size: 32, data: fakePng(4) }]);
    const view = new DataView(out.buffer);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(1);
  });

  it("describes each image and places payloads after the directory", () => {
    const a = fakePng(10);
    const b = fakePng(20);
    const out = encodeIco([
      { size: 16, data: a },
      { size: 48, data: b },
    ]);

    const e0 = entry(out, 0);
    expect(e0.getUint8(0)).toBe(16);
    expect(e0.getUint8(1)).toBe(16);
    expect(e0.getUint16(4, true)).toBe(1);
    expect(e0.getUint16(6, true)).toBe(32);
    expect(e0.getUint32(8, true)).toBe(10);
    expect(e0.getUint32(12, true)).toBe(6 + 16 * 2);

    const e1 = entry(out, 1);
    expect(e1.getUint8(0)).toBe(48);
    expect(e1.getUint32(12, true)).toBe(6 + 16 * 2 + 10);

    expect([...out.slice(38, 42)]).toEqual(PNG_MAGIC);
    expect(out.slice(48, 52)).toEqual(b.slice(0, 4));
  });

  it("stores 256px images with a zero width byte", () => {
    const out = encodeIco([{ size: 256, data: fakePng(4) }]);
    expect(entry(out, 0).getUint8(0)).toBe(0);
    expect(entry(out, 0).getUint8(1)).toBe(0);
  });

  it("reports the exact byte length it emits", () => {
    const images: IcoImage[] = [
      { size: 32, data: fakePng(100) },
      { size: 64, data: fakePng(250) },
      { size: 256, data: fakePng(900) },
    ];
    expect(encodeIco(images).length).toBe(icoByteLength(images));
    expect(icoByteLength(images)).toBe(6 + 16 * 3 + 1250);
  });

  it("round-trips every payload byte", () => {
    const images: IcoImage[] = [
      { size: 16, data: fakePng(64) },
      { size: 32, data: fakePng(128) },
    ];
    const out = encodeIco(images);
    let offset = 6 + 16 * 2;
    for (const img of images) {
      expect(out.slice(offset, offset + img.data.length)).toEqual(img.data);
      offset += img.data.length;
    }
  });

  it("rejects invalid input", () => {
    expect(() => encodeIco([])).toThrow(/no images/);
    expect(() => encodeIco([{ size: 0, data: fakePng(4) }])).toThrow(
      /invalid size/,
    );
    expect(() => encodeIco([{ size: 512, data: fakePng(4) }])).toThrow(
      /invalid size/,
    );
    expect(() =>
      encodeIco([
        { size: 32, data: fakePng(4) },
        { size: 32, data: fakePng(4) },
      ]),
    ).toThrow(/duplicate size/);
  });
});
