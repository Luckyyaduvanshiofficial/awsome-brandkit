export type ImageFormat = "png" | "jpeg" | "webp" | "ico" | "unknown";

export interface ImageMetadata {
  format: ImageFormat;
  bytes: number;
  width: number;
  height: number;
  /** Dimensions after EXIF orientation is applied. */
  displayWidth: number;
  displayHeight: number;
  orientation: number;
  hasAlpha: boolean;
  animated: boolean;
  iccProfile: boolean;
  truncated: boolean;
  notes: string[];
  png?: {
    bitDepth: number;
    colorType: number;
    interlaced: boolean;
    chunks: string[];
    crcErrors: number;
    apng: boolean;
  };
  jpeg?: {
    progressive: boolean;
    components: number;
    hasEoi: boolean;
  };
  webp?: {
    variant: "lossy" | "lossless" | "extended" | "unknown";
    canvasWidth: number;
    canvasHeight: number;
  };
  ico?: {
    count: number;
  };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageLimits {
  maxBytes: number;
  maxPixels: number;
  maxSvgBytes: number;
  maxSvgNodes: number;
  maxSvgDepth: number;
}

export const DEFAULT_LIMITS: ImageLimits = {
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 50_000_000,
  maxSvgBytes: 5 * 1024 * 1024,
  maxSvgNodes: 50_000,
  maxSvgDepth: 100,
};

export function checkImageLimits(
  metadata: ImageMetadata,
  limits: ImageLimits = DEFAULT_LIMITS,
): string[] {
  const errors: string[] = [];
  if (metadata.bytes > limits.maxBytes) {
    errors.push(
      `File is ${formatBytes(metadata.bytes)}; limit is ${formatBytes(limits.maxBytes)}.`,
    );
  }
  const pixels = metadata.width * metadata.height;
  if (pixels > limits.maxPixels) {
    errors.push(
      `Image is ${metadata.width}×${metadata.height} (${formatNumber(pixels)} pixels); limit is ${formatNumber(limits.maxPixels)}.`,
    );
  }
  return errors;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
