import { toBlob } from "../bytes";
import type { RgbaImage } from "../types";

export interface DecodedImage {
  image: RgbaImage;
  bitmapWidth: number;
  bitmapHeight: number;
}

function makeCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height);
}

export async function decodeToRgba(bytes: Uint8Array, mimeType: string): Promise<DecodedImage> {
  const blob = toBlob(bytes, mimeType);
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const canvas = makeCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D context unavailable.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      image: {
        width: imageData.width,
        height: imageData.height,
        data: imageData.data,
      },
      bitmapWidth: bitmap.width,
      bitmapHeight: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

export async function canvasToPng(
  width: number,
  height: number,
  draw: (context: OffscreenCanvasRenderingContext2D) => void,
): Promise<Uint8Array> {
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  draw(context);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasToEncoded(
  width: number,
  height: number,
  type: "image/png" | "image/jpeg" | "image/webp",
  draw: (context: OffscreenCanvasRenderingContext2D) => void,
  quality?: number,
): Promise<Uint8Array> {
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable.");
  draw(context);
  const blob = await canvas.convertToBlob({ type, quality });
  return new Uint8Array(await blob.arrayBuffer());
}
