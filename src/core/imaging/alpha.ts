import type { Bounds, RgbaImage } from "../types";

/**
 * Finds the bounding box of pixels whose alpha is greater than `threshold`.
 * Returns null when the image is fully transparent.
 */
export function alphaBounds(image: RgbaImage, threshold = 0): Bounds | null {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const alpha = data[row + x * 4 + 3] ?? 0;
      if (alpha <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function compositeOnWhite(image: RgbaImage): RgbaImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = (image.data[index + 3] ?? 0) / 255;
    data[index] = Math.round((image.data[index] ?? 0) * alpha + 255 * (1 - alpha));
    data[index + 1] = Math.round((image.data[index + 1] ?? 0) * alpha + 255 * (1 - alpha));
    data[index + 2] = Math.round((image.data[index + 2] ?? 0) * alpha + 255 * (1 - alpha));
    data[index + 3] = 255;
  }
  return { width: image.width, height: image.height, data };
}

export interface ImageDiff {
  width: number;
  height: number;
  differentPixels: number;
  totalPixels: number;
  percent: number;
  meanDelta: number;
  maxDelta: number;
}

export function diffRgba(left: RgbaImage, right: RgbaImage, channelThreshold = 24): ImageDiff {
  if (left.width !== right.width || left.height !== right.height) {
    return {
      width: left.width,
      height: left.height,
      differentPixels: left.width * left.height,
      totalPixels: left.width * left.height,
      percent: 100,
      meanDelta: 255,
      maxDelta: 255,
    };
  }

  let differentPixels = 0;
  let totalDelta = 0;
  let maxDelta = 0;
  const totalPixels = left.width * left.height;

  for (let index = 0; index < left.data.length; index += 4) {
    const dr = Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0));
    const dg = Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0));
    const db = Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0));
    const da = Math.abs((left.data[index + 3] ?? 0) - (right.data[index + 3] ?? 0));
    const delta = Math.max(dr, dg, db, da);
    totalDelta += delta;
    if (delta > maxDelta) maxDelta = delta;
    if (delta > channelThreshold) differentPixels += 1;
  }

  return {
    width: left.width,
    height: left.height,
    differentPixels,
    totalPixels,
    percent: totalPixels === 0 ? 0 : (differentPixels / totalPixels) * 100,
    meanDelta: totalPixels === 0 ? 0 : totalDelta / totalPixels,
    maxDelta,
  };
}
