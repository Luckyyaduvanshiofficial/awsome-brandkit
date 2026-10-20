import { crc32Of } from "../crc32";
import type { ImageMetadata } from "../types";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}

function startsWith(bytes: Uint8Array, signature: number[] | string): boolean {
  const expected =
    typeof signature === "string"
      ? Array.from(signature, (character) => character.charCodeAt(0))
      : signature;
  if (bytes.length < expected.length) return false;
  return expected.every((value, index) => bytes[index] === value);
}

function baseMetadata(bytes: Uint8Array): ImageMetadata {
  return {
    format: "unknown",
    bytes: bytes.length,
    width: 0,
    height: 0,
    displayWidth: 0,
    displayHeight: 0,
    orientation: 1,
    hasAlpha: false,
    animated: false,
    iccProfile: false,
    truncated: false,
    notes: [],
  };
}

export function detectImageFormat(bytes: Uint8Array): ImageMetadata["format"] {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (startsWith(bytes, "RIFF") && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return "ico";
  }
  return "unknown";
}

export function parseImageMetadata(bytes: Uint8Array): ImageMetadata {
  const format = detectImageFormat(bytes);
  switch (format) {
    case "png":
      return parsePng(bytes);
    case "jpeg":
      return parseJpeg(bytes);
    case "webp":
      return parseWebp(bytes);
    case "ico":
      return parseIco(bytes);
    default:
      return {
        ...baseMetadata(bytes),
        notes: ["Unrecognized image format."],
      };
  }
}

function parsePng(bytes: Uint8Array): ImageMetadata {
  const meta = baseMetadata(bytes);
  meta.format = "png";
  const view = dataView(bytes);
  const png = {
    bitDepth: 0,
    colorType: 0,
    interlaced: false,
    chunks: [] as string[],
    crcErrors: 0,
    apng: false,
  };

  let width = 0;
  let height = 0;
  let hasAlpha = false;
  let hasTransparencyChunk = false;
  let sawIend = false;
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = ascii(bytes, offset + 4, 4);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) {
      meta.truncated = true;
      meta.notes.push(`PNG ${type || "chunk"} extends past the end of the file.`);
      break;
    }
    png.chunks.push(type);

    const crc = view.getUint32(offset + 8 + length);
    const computed = crc32Of([bytes.subarray(offset + 4, offset + 8 + length)]);
    if (crc !== computed) {
      png.crcErrors += 1;
    }

    if (type === "IHDR") {
      if (length < 13) {
        meta.notes.push("PNG IHDR is too short.");
      } else {
        width = view.getUint32(offset + 8);
        height = view.getUint32(offset + 12);
        png.bitDepth = bytes[offset + 16] ?? 0;
        png.colorType = bytes[offset + 17] ?? 0;
        png.interlaced = (bytes[offset + 20] ?? 0) !== 0;
      }
    } else if (type === "acTL") {
      png.apng = true;
    } else if (type === "iCCP" || type === "sRGB") {
      meta.iccProfile = true;
    } else if (type === "tRNS") {
      hasTransparencyChunk = true;
    } else if (type === "IEND") {
      sawIend = true;
      break;
    }

    offset = chunkEnd;
  }

  if (png.colorType === 4 || png.colorType === 6) hasAlpha = true;
  if (hasTransparencyChunk) hasAlpha = true;
  if (!sawIend) {
    meta.truncated = true;
    meta.notes.push("PNG has no IEND chunk.");
  }
  if (png.crcErrors > 0) {
    meta.notes.push(`${png.crcErrors} PNG chunk CRC error(s).`);
  }

  meta.width = width;
  meta.height = height;
  meta.displayWidth = width;
  meta.displayHeight = height;
  meta.hasAlpha = hasAlpha;
  meta.animated = png.apng;
  meta.png = png;
  return meta;
}

function parseExifOrientation(data: Uint8Array): number | undefined {
  let tiffOffset = 0;
  if (ascii(data, 0, 6) === "Exif\u0000\u0000") tiffOffset = 6;
  if (data.length < tiffOffset + 8) return undefined;

  const view = dataView(data);
  const byteOrder = ascii(data, tiffOffset, 2);
  const little = byteOrder === "II";
  const big = byteOrder === "MM";
  if (!little && !big) return undefined;

  const read16 = (offset: number) =>
    little ? view.getUint16(offset, true) : view.getUint16(offset, false);
  const read32 = (offset: number) =>
    little ? view.getUint32(offset, true) : view.getUint32(offset, false);

  if (read16(tiffOffset + 2) !== 42) return undefined;
  const ifdOffset = read32(tiffOffset + 4);
  const ifdStart = tiffOffset + ifdOffset;
  if (ifdStart + 2 > data.length) return undefined;

  const entries = read16(ifdStart);
  if (entries > 256) return undefined;

  for (let index = 0; index < entries; index += 1) {
    const entry = ifdStart + 2 + index * 12;
    if (entry + 12 > data.length) return undefined;
    const tag = read16(entry);
    if (tag !== 0x0112) continue;
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    if (type !== 3 || count < 1) return undefined;
    const value = read16(entry + 8);
    return value >= 1 && value <= 8 ? value : undefined;
  }
  return undefined;
}

function parseJpeg(bytes: Uint8Array): ImageMetadata {
  const meta = baseMetadata(bytes);
  meta.format = "jpeg";
  const view = dataView(bytes);
  let offset = 2;
  let width = 0;
  let height = 0;
  let components = 3;
  let progressive = false;
  let orientation = 1;
  let iccProfile = false;
  let hasEoi = false;
  let hasScan = false;
  let markerCount = 0;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0xd9) {
      hasEoi = true;
      break;
    }
    if (marker === 0xda) {
      hasScan = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    markerCount += 1;
    if (markerCount > 4096 || offset + 2 > bytes.length) {
      meta.truncated = true;
      break;
    }
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      meta.truncated = true;
      meta.notes.push("JPEG segment extends past the end of the file.");
      break;
    }
    const dataStart = offset + 2;
    const dataLength = segmentLength - 2;

    if (SOF_MARKERS.has(marker)) {
      if (dataLength >= 6) {
        height = view.getUint16(dataStart + 1);
        width = view.getUint16(dataStart + 3);
        components = bytes[dataStart + 5] ?? components;
        progressive = marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce;
      }
    } else if (marker === 0xe1 && dataLength >= 6) {
      const exif = parseExifOrientation(bytes.subarray(dataStart, dataStart + dataLength));
      if (exif) orientation = exif;
    } else if (marker === 0xe2 && dataLength >= 12) {
      if (ascii(bytes, dataStart, 12) === "ICC_PROFILE\u0000") iccProfile = true;
    }

    offset += segmentLength;
  }

  if (hasScan && !hasEoi) {
    // Scan the tail for an EOI marker; camera JPEGs can carry trailing metadata.
    for (let index = bytes.length - 2; index >= Math.max(0, bytes.length - 4096); index -= 1) {
      if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
        hasEoi = true;
        break;
      }
    }
  }

  if (!hasEoi) {
    meta.truncated = true;
    meta.notes.push("JPEG has no end-of-image marker.");
  }
  if (offset >= bytes.length && !hasScan) {
    meta.truncated = true;
  }

  meta.width = width;
  meta.height = height;
  meta.orientation = orientation;
  meta.displayWidth = orientation >= 5 ? height : width;
  meta.displayHeight = orientation >= 5 ? width : height;
  meta.iccProfile = iccProfile;
  meta.jpeg = { progressive, components, hasEoi };
  return meta;
}

function parseWebp(bytes: Uint8Array): ImageMetadata {
  const meta = baseMetadata(bytes);
  meta.format = "webp";
  const view = dataView(bytes);
  const riffSize = view.getUint32(4, true);
  const declaredEnd = 8 + riffSize;
  const end = Math.min(bytes.length, declaredEnd);
  if (declaredEnd > bytes.length) {
    meta.truncated = true;
    meta.notes.push("WebP RIFF size extends past the end of the file.");
  }

  let width = 0;
  let height = 0;
  let hasAlpha = false;
  let animated = false;
  let iccProfile = false;
  let orientation = 1;
  let variant: "lossy" | "lossless" | "extended" | "unknown" = "unknown";
  let offset = 12;

  while (offset + 8 <= end) {
    const fourcc = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (dataStart + size > end) {
      meta.truncated = true;
      meta.notes.push(`WebP ${fourcc || "chunk"} extends past the end of the file.`);
      break;
    }

    if (fourcc === "VP8X" && size >= 10) {
      variant = "extended";
      const flags = bytes[dataStart] ?? 0;
      hasAlpha = (flags & 0x10) !== 0;
      animated = (flags & 0x02) !== 0;
      iccProfile = (flags & 0x20) !== 0;
      width =
        1 +
        ((bytes[dataStart + 4] ?? 0) |
          ((bytes[dataStart + 5] ?? 0) << 8) |
          ((bytes[dataStart + 6] ?? 0) << 16));
      height =
        1 +
        ((bytes[dataStart + 7] ?? 0) |
          ((bytes[dataStart + 8] ?? 0) << 8) |
          ((bytes[dataStart + 9] ?? 0) << 16));
    } else if (fourcc === "VP8 " && size >= 10) {
      variant = "lossy";
      if (
        bytes[dataStart + 3] === 0x9d &&
        bytes[dataStart + 4] === 0x01 &&
        bytes[dataStart + 5] === 0x2a
      ) {
        width = view.getUint16(dataStart + 6, true) & 0x3fff;
        height = view.getUint16(dataStart + 8, true) & 0x3fff;
      }
    } else if (fourcc === "VP8L" && size >= 5) {
      variant = "lossless";
      const bits = view.getUint32(dataStart + 1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
      hasAlpha = ((bits >>> 28) & 1) === 1;
    } else if (fourcc === "ALPH") {
      hasAlpha = true;
    } else if (fourcc === "ANIM" || fourcc === "ANMF") {
      animated = true;
    } else if (fourcc === "ICCP") {
      iccProfile = true;
    } else if (fourcc === "EXIF") {
      const exif = parseExifOrientation(bytes.subarray(dataStart, dataStart + size));
      if (exif) orientation = exif;
    }

    offset = dataStart + size + (size % 2);
  }

  meta.width = width;
  meta.height = height;
  meta.displayWidth = orientation >= 5 ? height : width;
  meta.displayHeight = orientation >= 5 ? width : height;
  meta.orientation = orientation;
  meta.hasAlpha = hasAlpha;
  meta.animated = animated;
  meta.iccProfile = iccProfile;
  meta.webp = { variant, canvasWidth: width, canvasHeight: height };
  return meta;
}

function parseIco(bytes: Uint8Array): ImageMetadata {
  const meta = baseMetadata(bytes);
  meta.format = "ico";
  meta.hasAlpha = true;
  if (bytes.length < 6) {
    meta.truncated = true;
    return meta;
  }
  const view = dataView(bytes);
  const count = view.getUint16(4, true);
  meta.ico = { count };
  if (count === 0) {
    meta.notes.push("ICO contains no images.");
    return meta;
  }
  if (bytes.length < 6 + count * 16) {
    meta.truncated = true;
    meta.notes.push("ICO directory is truncated.");
    return meta;
  }
  const width = bytes[6] === 0 ? 256 : (bytes[6] ?? 0);
  const height = bytes[7] === 0 ? 256 : (bytes[7] ?? 0);
  meta.width = width;
  meta.height = height;
  meta.displayWidth = width;
  meta.displayHeight = height;
  return meta;
}

export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (!startsWith(bytes, PNG_SIGNATURE) || bytes.length < 24) return null;
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  const view = dataView(bytes);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}
