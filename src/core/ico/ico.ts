import { readPngSize } from "../imaging/metadata";

export interface IcoImage {
  size: number;
  png: Uint8Array;
}

export interface IcoEntry {
  width: number;
  height: number;
  bytesInRes: number;
  imageOffset: number;
  pngWidth: number;
  pngHeight: number;
}

export interface IcoValidation {
  valid: boolean;
  errors: string[];
  entries: IcoEntry[];
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

export function encodeIco(images: IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error("ICO needs at least one image.");
  if (images.length > 255) throw new Error("ICO supports at most 255 images.");

  const sorted = [...images].sort((left, right) => left.size - right.size);
  const seen = new Set<number>();
  for (const image of sorted) {
    if (!Number.isInteger(image.size) || image.size < 1 || image.size > 256) {
      throw new Error(`ICO image size must be an integer from 1 to 256; got ${image.size}.`);
    }
    if (seen.has(image.size)) throw new Error(`Duplicate ICO size: ${image.size}.`);
    seen.add(image.size);
    const pngSize = readPngSize(image.png);
    if (!pngSize) throw new Error(`ICO ${image.size}px payload is not a PNG.`);
    if (pngSize.width !== image.size || pngSize.height !== image.size) {
      throw new Error(
        `ICO ${image.size}px payload is ${pngSize.width}×${pngSize.height}; expected a square.`,
      );
    }
  }

  const headerSize = 6 + sorted.length * 16;
  const totalBytes = sorted.reduce((sum, image) => sum + image.png.length, headerSize);
  const output = new Uint8Array(totalBytes);
  const view = new DataView(output.buffer);

  writeU16(view, 0, 0);
  writeU16(view, 2, 1);
  writeU16(view, 4, sorted.length);

  let offset = headerSize;
  sorted.forEach((image, index) => {
    const entryOffset = 6 + index * 16;
    output[entryOffset] = image.size === 256 ? 0 : image.size;
    output[entryOffset + 1] = image.size === 256 ? 0 : image.size;
    output[entryOffset + 2] = 0;
    output[entryOffset + 3] = 0;
    writeU16(view, entryOffset + 4, 1);
    writeU16(view, entryOffset + 6, 32);
    writeU32(view, entryOffset + 8, image.png.length);
    writeU32(view, entryOffset + 12, offset);
    output.set(image.png, offset);
    offset += image.png.length;
  });

  return output;
}

export function validateIco(bytes: Uint8Array): IcoValidation {
  const errors: string[] = [];
  const entries: IcoEntry[] = [];
  if (bytes.length < 6) {
    return { valid: false, errors: ["ICO is shorter than its 6-byte header."], entries };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);

  if (reserved !== 0) errors.push(`ICO reserved field is ${reserved}; expected 0.`);
  if (type !== 1) errors.push(`ICO type is ${type}; expected 1.`);
  if (count === 0) errors.push("ICO contains no entries.");
  if (bytes.length < 6 + count * 16) {
    errors.push("ICO directory is truncated.");
    return { valid: false, errors, entries };
  }

  const seenOffsets = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = bytes[entryOffset] === 0 ? 256 : (bytes[entryOffset] ?? 0);
    const height = bytes[entryOffset + 1] === 0 ? 256 : (bytes[entryOffset + 1] ?? 0);
    const planes = view.getUint16(entryOffset + 4, true);
    const bitCount = view.getUint16(entryOffset + 6, true);
    const bytesInRes = view.getUint32(entryOffset + 8, true);
    const imageOffset = view.getUint32(entryOffset + 12, true);

    if (width !== height) errors.push(`ICO entry ${index} is not square.`);
    if (planes !== 1) errors.push(`ICO entry ${index} has ${planes} planes.`);
    if (bitCount !== 32) errors.push(`ICO entry ${index} has ${bitCount} bits per pixel.`);
    if (bytesInRes === 0) errors.push(`ICO entry ${index} has an empty payload.`);
    if (imageOffset + bytesInRes > bytes.length) {
      errors.push(`ICO entry ${index} extends past the end of the file.`);
      continue;
    }
    if (seenOffsets.has(imageOffset)) errors.push(`ICO entry ${index} shares an image offset.`);
    seenOffsets.add(imageOffset);

    const payload = bytes.subarray(imageOffset, imageOffset + bytesInRes);
    const pngSize = readPngSize(payload);
    if (!pngSize) {
      errors.push(`ICO entry ${index} is not a PNG payload.`);
      continue;
    }
    if (pngSize.width !== width || pngSize.height !== height) {
      errors.push(
        `ICO entry ${index} says ${width}×${height} but its PNG is ${pngSize.width}×${pngSize.height}.`,
      );
    }
    entries.push({
      width,
      height,
      bytesInRes,
      imageOffset,
      pngWidth: pngSize.width,
      pngHeight: pngSize.height,
    });
  }

  return { valid: errors.length === 0, errors, entries };
}
