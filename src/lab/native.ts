import { decodeToRgba } from "../core/imaging/decode";
import type { RgbaImage } from "../core/types";

export interface NativeRenderResult {
  png: Uint8Array;
  image: RgbaImage;
  width: number;
  height: number;
  elapsedMs: number;
}

export async function loadDocumentFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  try {
    await document.fonts.load('600 44px "Instrument Sans Variable"');
    await document.fonts.ready;
  } catch {
    // Font loading is measured separately; rendering can continue with fallbacks.
  }
}

export async function renderSvgNative(
  svg: string,
  width: number,
  background = "#ffffff",
  targetHeight?: number,
): Promise<NativeRenderResult> {
  const started = performance.now();
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    await image.decode();
    const ratio = image.naturalHeight / Math.max(1, image.naturalWidth);
    const height = targetHeight ?? Math.max(1, Math.round(width * ratio));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D context unavailable.");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    const png = new Uint8Array(await pngBlob.arrayBuffer());
    const decoded = await decodeToRgba(png, "image/png");
    return {
      png,
      image: decoded.image,
      width,
      height,
      elapsedMs: performance.now() - started,
    };
  } finally {
    URL.revokeObjectURL(url);
    image.removeAttribute("src");
  }
}
