import { crc32Of } from "../../src/core/crc32";

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crc = crc32Of([typeBytes, data]);
  const length = new Uint8Array([
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff,
  ]);
  const crcBytes = new Uint8Array([
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ]);
  return concat([length, typeBytes, data, crcBytes]);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function insertPngChunk(png: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrLength = view.getUint32(8);
  const insertAt = 8 + 12 + ihdrLength;
  return concat([png.slice(0, insertAt), pngChunk(type, data), png.slice(insertAt)]);
}

export function jpegWithOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = new Uint8Array([
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x12,
    0x01,
    0x03,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const exif = concat([new TextEncoder().encode("Exif\u0000\u0000"), tiff]);
  const payloadLength = exif.length + 2;
  const app1 = concat([
    new Uint8Array([0xff, 0xe1]),
    new Uint8Array([(payloadLength >>> 8) & 0xff, payloadLength & 0xff]),
    exif,
  ]);
  return concat([jpeg.slice(0, 2), app1, jpeg.slice(2)]);
}

export function animatedWebp(width = 64, height = 28): Uint8Array {
  const output = new Uint8Array(30);
  output.set(new TextEncoder().encode("RIFF"), 0);
  output.set([22, 0, 0, 0], 4);
  output.set(new TextEncoder().encode("WEBP"), 8);
  output.set(new TextEncoder().encode("VP8X"), 12);
  output.set([10, 0, 0, 0], 16);
  output[20] = 0x02;
  const w = width - 1;
  const h = height - 1;
  output[24] = w & 0xff;
  output[25] = (w >>> 8) & 0xff;
  output[26] = (w >>> 16) & 0xff;
  output[27] = h & 0xff;
  output[28] = (h >>> 8) & 0xff;
  output[29] = (h >>> 16) & 0xff;
  return output;
}
