import type { BBoxValue } from "../core/render/types";

export type Verdict = "pass" | "review" | "blocked" | "error" | "skip";

export interface FixtureResult {
  id: string;
  name: string;
  category: string;
  verdict: Verdict;
  vectorContainer: boolean;
  portableVector: boolean;
  liveText: boolean;
  blockingReasons: string[];
  warnings: string[];
  resvg?: {
    width: number;
    height: number;
    elapsedMs: number;
    bbox?: BBoxValue;
    innerBBox?: BBoxValue;
    simplifiedSvgLength?: number;
  };
  native?: {
    width: number;
    height: number;
    elapsedMs: number;
  };
  diff?: {
    percent: number;
    meanDelta: number;
    maxDelta: number;
    threshold: number;
  };
  error?: string;
}

export interface SecurityResult {
  id: string;
  name: string;
  expectedBlocked: boolean;
  blocked: boolean;
  sanitizedClean: boolean;
  browserImageSafe: boolean;
  reasons: string[];
  removed: string[];
  error?: string;
}

export interface IcoResult {
  valid: boolean;
  entries: Array<{ width: number; height: number; bytesInRes: number }>;
  bytes: number;
  elapsedMs: number;
  browserDecoded: boolean;
  browserWidth?: number;
  browserHeight?: number;
  errors: string[];
}

export interface ZipResult {
  built: boolean;
  verified: boolean;
  corruptRejected: boolean;
  fileCount: number;
  totalBytes: number;
  elapsedMs: number;
  errors: string[];
}

export interface RasterResult {
  png: {
    width: number;
    height: number;
    hasAlpha: boolean;
    animated: boolean;
    iccProfile: boolean;
    alphaBounds?: { x: number; y: number; width: number; height: number } | null;
  };
  jpeg: {
    width: number;
    height: number;
    orientation: number;
    hasAlpha: boolean;
  };
  webp?: {
    width: number;
    height: number;
    hasAlpha: boolean;
  };
  exif: {
    declaredOrientation: number;
    displayWidth: number;
    displayHeight: number;
    browserWidth: number;
    browserHeight: number;
    swapped: boolean;
  };
  apng: {
    animated: boolean;
  };
  icc: {
    detected: boolean;
  };
  animatedWebp: {
    detected: boolean;
  };
  limits: {
    oversizedRejected: boolean;
    oversizedBytesRejected: boolean;
  };
  errors: string[];
}

export interface PerformanceResult {
  coldStartMs: number;
  fontLoaded: boolean;
  one512Ms: number;
  one1024Ms: number;
  batch32Ms: number;
  assetsPerSecond: number;
  thresholds: {
    coldStartMs: number;
    one1024Ms: number;
    batch32Ms: number;
  };
}

export interface PocResults {
  schemaVersion: "proofsheet.poc.v1";
  startedAt: string;
  durationMs: number;
  userAgent: string;
  summary: {
    pass: number;
    review: number;
    blocked: number;
    error: number;
  };
  fixtures: FixtureResult[];
  security: SecurityResult[];
  ico: IcoResult;
  zip: ZipResult;
  raster: RasterResult;
  performance: PerformanceResult;
  csp: {
    violations: string[];
    externalResources: string[];
    canary: string;
  };
  passed: boolean;
  errors: string[];
}
