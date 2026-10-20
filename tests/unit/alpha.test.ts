import { describe, expect, it } from "vitest";
import { alphaBounds, compositeOnWhite, diffRgba } from "../../src/core/imaging/alpha";
import type { RgbaImage } from "../../src/core/types";

function blank(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(image: RgbaImage, x: number, y: number, rgba: [number, number, number, number]) {
  const index = (y * image.width + x) * 4;
  image.data[index] = rgba[0];
  image.data[index + 1] = rgba[1];
  image.data[index + 2] = rgba[2];
  image.data[index + 3] = rgba[3];
}

describe("alphaBounds", () => {
  it("returns the tight bounding box of visible pixels", () => {
    const image = blank(6, 5);
    setPixel(image, 2, 1, [217, 72, 47, 255]);
    setPixel(image, 4, 3, [24, 22, 19, 255]);
    expect(alphaBounds(image)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
  });

  it("returns null for a fully transparent image", () => {
    expect(alphaBounds(blank(8, 8))).toBeNull();
  });

  it("respects the alpha threshold", () => {
    const image = blank(3, 3);
    setPixel(image, 1, 1, [0, 0, 0, 8]);
    expect(alphaBounds(image, 8)).toBeNull();
    expect(alphaBounds(image, 7)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
});

describe("diffRgba", () => {
  it("reports zero for identical images", () => {
    const left = blank(2, 2);
    setPixel(left, 0, 0, [217, 72, 47, 255]);
    const diff = diffRgba(left, left, 24);
    expect(diff.percent).toBe(0);
    expect(diff.differentPixels).toBe(0);
  });

  it("reports changed pixels", () => {
    const left = blank(2, 2);
    const right = blank(2, 2);
    setPixel(left, 0, 0, [255, 255, 255, 255]);
    setPixel(right, 0, 0, [0, 0, 0, 255]);
    const diff = diffRgba(left, right, 24);
    expect(diff.differentPixels).toBe(1);
    expect(diff.percent).toBe(25);
    expect(diff.maxDelta).toBe(255);
  });

  it("fails immediately on dimension mismatch", () => {
    const diff = diffRgba(blank(2, 2), blank(3, 2));
    expect(diff.percent).toBe(100);
    expect(diff.differentPixels).toBe(4);
  });
});

describe("compositeOnWhite", () => {
  it("composites semi-transparent pixels with alpha", () => {
    const image = blank(1, 1);
    setPixel(image, 0, 0, [255, 0, 0, 128]);
    const composited = compositeOnWhite(image);
    expect(composited.data[0]).toBe(255);
    expect(composited.data[1]).toBe(127);
    expect(composited.data[2]).toBe(127);
    expect(composited.data[3]).toBe(255);
  });
});
