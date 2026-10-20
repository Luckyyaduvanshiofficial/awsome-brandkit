import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parseImageMetadata, readPngSize } from "../../src/core/imaging/metadata";
import { animatedWebp, insertPngChunk, jpegWithOrientation } from "./png-utils";

function makePng(width = 4, height = 2): Uint8Array {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      png.data[index] = 217;
      png.data[index + 1] = 72;
      png.data[index + 2] = 47;
      png.data[index + 3] = x === 0 ? 0 : 255;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

describe("PNG metadata", () => {
  it("reads dimensions and alpha", () => {
    const bytes = makePng();
    const meta = parseImageMetadata(bytes);
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(4);
    expect(meta.height).toBe(2);
    expect(meta.hasAlpha).toBe(true);
    expect(meta.animated).toBe(false);
    expect(meta.truncated).toBe(false);
    expect(meta.png?.crcErrors).toBe(0);
    expect(readPngSize(bytes)).toEqual({ width: 4, height: 2 });
  });

  it("detects APNG animation", () => {
    const acTL = new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]);
    const meta = parseImageMetadata(insertPngChunk(makePng(), "acTL", acTL));
    expect(meta.animated).toBe(true);
    expect(meta.png?.apng).toBe(true);
  });

  it("detects an ICC profile chunk", () => {
    const iccp = new Uint8Array([...new TextEncoder().encode("Display P3\u0000\u0000"), 0, 1, 2]);
    const meta = parseImageMetadata(insertPngChunk(makePng(), "iCCP", iccp));
    expect(meta.iccProfile).toBe(true);
  });

  it("reports a CRC error without throwing", () => {
    const bytes = makePng();
    // Flip a byte inside the IDAT payload.
    const corrupted = bytes.slice();
    corrupted[corrupted.length - 20] = (corrupted[corrupted.length - 20] ?? 0) ^ 0xff;
    const meta = parseImageMetadata(corrupted);
    expect(meta.png?.crcErrors).toBeGreaterThan(0);
  });

  it("marks a truncated PNG", () => {
    const meta = parseImageMetadata(makePng().slice(0, 30));
    expect(meta.truncated).toBe(true);
  });
});

describe("JPEG metadata", () => {
  function makeJpeg(): Uint8Array {
    const width = 4;
    const height = 2;
    const data = Buffer.alloc(width * height * 4, 255);
    return new Uint8Array(encodeJpeg({ width, height, data }, 90).data);
  }

  it("reads dimensions and EXIF orientation", () => {
    const base = parseImageMetadata(makeJpeg());
    expect(base.format).toBe("jpeg");
    expect(base.width).toBe(4);
    expect(base.height).toBe(2);
    expect(base.orientation).toBe(1);

    const exif = parseImageMetadata(jpegWithOrientation(makeJpeg(), 6));
    expect(exif.orientation).toBe(6);
    expect(exif.displayWidth).toBe(2);
    expect(exif.displayHeight).toBe(4);
    expect(exif.truncated).toBe(false);
  });
});

describe("WebP metadata", () => {
  it("reads the VP8X animation flag and canvas dimensions", () => {
    const meta = parseImageMetadata(animatedWebp(64, 28));
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(28);
    expect(meta.animated).toBe(true);
  });
});

describe("Unknown metadata", () => {
  it("returns a safe unknown record", () => {
    const meta = parseImageMetadata(new Uint8Array([1, 2, 3, 4]));
    expect(meta.format).toBe("unknown");
    expect(meta.width).toBe(0);
    expect(meta.notes.length).toBeGreaterThan(0);
  });
});
