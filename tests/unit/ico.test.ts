import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { encodeIco, validateIco } from "../../src/core/ico/ico";

function squarePng(size: number): Uint8Array {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      png.data[index] = 217;
      png.data[index + 1] = 72;
      png.data[index + 2] = 47;
      png.data[index + 3] = 255;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

describe("ICO encoder", () => {
  it("encodes 16/32/48/64px PNG payloads into a valid ICO", () => {
    const ico = encodeIco([
      { size: 64, png: squarePng(64) },
      { size: 16, png: squarePng(16) },
      { size: 48, png: squarePng(48) },
      { size: 32, png: squarePng(32) },
    ]);
    const result = validateIco(ico);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.entries.map((entry) => entry.width)).toEqual([16, 32, 48, 64]);
    expect(result.entries.every((entry) => entry.pngWidth === entry.width)).toBe(true);
  });

  it("writes 256 as zero in the directory", () => {
    const ico = encodeIco([{ size: 256, png: squarePng(256) }]);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
    expect(validateIco(ico).valid).toBe(true);
  });

  it("rejects duplicate sizes", () => {
    expect(() =>
      encodeIco([
        { size: 32, png: squarePng(32) },
        { size: 32, png: squarePng(32) },
      ]),
    ).toThrow(/Duplicate ICO size/);
  });

  it("rejects a payload whose dimensions do not match", () => {
    expect(() => encodeIco([{ size: 32, png: squarePng(16) }])).toThrow(/expected a square/i);
  });

  it("rejects a corrupt image offset", () => {
    const ico = encodeIco([
      { size: 16, png: squarePng(16) },
      { size: 32, png: squarePng(32) },
    ]);
    const corrupted = ico.slice();
    corrupted[18] = 0xff;
    corrupted[19] = 0xff;
    corrupted[20] = 0xff;
    corrupted[21] = 0xff;
    const result = validateIco(corrupted);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => /past the end/.test(error))).toBe(true);
  });

  it("rejects a truncated directory", () => {
    const ico = encodeIco([{ size: 16, png: squarePng(16) }]);
    const result = validateIco(ico.slice(0, 10));
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => /truncated/.test(error))).toBe(true);
  });
});
