export interface RenderRequest {
  id: number;
  type: "init" | "render";
  svg?: string;
  width?: number;
  height?: number;
  background?: string;
  withPixels?: boolean;
}

export interface BBoxValue {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderResponse {
  id: number;
  ok: boolean;
  error?: string;
  initMs?: number;
  fontLoaded?: boolean;
  elapsedMs?: number;
  width?: number;
  height?: number;
  png?: Uint8Array;
  pixels?: Uint8Array;
  bbox?: BBoxValue;
  innerBBox?: BBoxValue;
  simplifiedSvg?: string;
}

export interface RenderResult {
  png: Uint8Array;
  pixels?: Uint8Array;
  width: number;
  height: number;
  elapsedMs: number;
  bbox?: BBoxValue;
  innerBBox?: BBoxValue;
  simplifiedSvg?: string;
}

export interface RenderInitResult {
  initMs: number;
  fontLoaded: boolean;
}
