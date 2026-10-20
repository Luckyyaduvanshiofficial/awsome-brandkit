import { crc32Of } from "../core/crc32";

export interface RasterFixtures {
  png: Uint8Array;
  jpeg: Uint8Array;
  webp?: Uint8Array;
  exifJpeg: Uint8Array;
  apng: Uint8Array;
  iccPng: Uint8Array;
  animatedWebp: Uint8Array;
  transparentBounds: { x: number; y: number; width: number; height: number };
  canvasSize: { width: number; height: number };
}

function drawLogo(context: OffscreenCanvasRenderingContext2D, background: string | null): void {
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, 64, 28);
  }
  context.fillStyle = "#d9482f";
  context.fillRect(10, 6, 20, 10);
  context.fillStyle = "#181613";
  context.beginPath();
  context.moveTo(38, 5);
  context.lineTo(60, 23);
  context.lineTo(38, 23);
  context.closePath();
  context.fill();
  context.strokeStyle = "#181613";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(52, 8, 3.5, 0, Math.PI * 2);
  context.stroke();
}

function toBytes(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function encode(
  type: "image/png" | "image/jpeg" | "image/webp",
  background: string | null,
  quality?: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(64, 28);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  drawLogo(context, background);
  const blob = await canvas.convertToBlob({ type, quality });
  return toBytes(await blob.arrayBuffer());
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crc = crc32Of([typeBytes, data]);
  const crcBytes = new Uint8Array([
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
  ]);
  const length = new Uint8Array([
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff,
  ]);
  return concat([length, typeBytes, data, crcBytes]);
}

function insertPngChunk(png: Uint8Array, type: string, data: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const ihdrLength = view.getUint32(8);
  const insertAt = 8 + 12 + ihdrLength;
  return concat([png.slice(0, insertAt), pngChunk(type, data), png.slice(insertAt)]);
}

function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
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

function makeAnimatedWebp(): Uint8Array {
  const output = new Uint8Array(30);
  output.set(new TextEncoder().encode("RIFF"), 0);
  output.set(u32(22), 4);
  output.set(new TextEncoder().encode("WEBP"), 8);
  output.set(new TextEncoder().encode("VP8X"), 12);
  output.set(u32(10), 16);
  output[20] = 0x02;
  output[24] = 63;
  output[27] = 27;
  return output;
}

export async function makeRasterFixtures(): Promise<RasterFixtures> {
  const png = await encode("image/png", null);
  const jpeg = await encode("image/jpeg", "#f5f2ea", 0.9);
  let webp: Uint8Array | undefined;
  try {
    webp = await encode("image/webp", null, 0.9);
  } catch {
    webp = undefined;
  }

  const acTL = new Uint8Array([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const iccp = new Uint8Array([
    ...new TextEncoder().encode("Display P3\u0000\u0000"),
    0x00,
    0x01,
    0x02,
    0x03,
  ]);

  return {
    png,
    jpeg,
    webp,
    exifJpeg: withExifOrientation(jpeg, 6),
    apng: insertPngChunk(png, "acTL", acTL),
    iccPng: insertPngChunk(png, "iCCP", iccp),
    animatedWebp: makeAnimatedWebp(),
    transparentBounds: { x: 10, y: 5, width: 50, height: 19 },
    canvasSize: { width: 64, height: 28 },
  };
}
