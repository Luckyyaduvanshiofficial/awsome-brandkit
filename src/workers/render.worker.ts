/// <reference lib="webworker" />

import fontUrl from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasmUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import type { BBoxValue, RenderRequest, RenderResponse } from "../core/render/types";

const scope = self as unknown as DedicatedWorkerGlobalScope;

let fontBuffer: Uint8Array | undefined;
let initPromise: Promise<{ initMs: number; fontLoaded: boolean }> | null = null;

function bboxValue(value: { x: number; y: number; width: number; height: number } | undefined) {
  if (!value) return undefined;
  const result: BBoxValue = {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
  return result;
}

async function initialize(): Promise<{ initMs: number; fontLoaded: boolean }> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const started = performance.now();
    await initWasm(fetch(wasmUrl));
    let fontLoaded = false;
    try {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error(`Font request failed with ${response.status}.`);
      fontBuffer = new Uint8Array(await response.arrayBuffer());
      fontLoaded = true;
    } catch (error) {
      console.error("Font loading failed", error);
    }
    return { initMs: performance.now() - started, fontLoaded };
  })();
  return initPromise;
}

async function render(request: RenderRequest): Promise<RenderResponse> {
  const started = performance.now();
  const svg = request.svg;
  const width = request.width;
  if (!svg) throw new Error("Render request is missing SVG.");
  if (!width || width < 1 || width > 8192) throw new Error("Render width is out of range.");

  const init = await initialize();
  const options = {
    fitTo: { mode: "width" as const, value: width },
    background: request.background,
    font: fontBuffer
      ? {
          fontBuffers: [fontBuffer],
          defaultFontFamily: "Instrument Sans Variable",
          sansSerifFamily: "Instrument Sans Variable",
        }
      : {
          fontBuffers: [],
          loadSystemFonts: false,
          defaultFontFamily: "Instrument Sans Variable",
        },
  };

  const resvg = new Resvg(svg, options);
  const bboxObject = resvg.getBBox();
  const innerObject = resvg.innerBBox();
  const bbox = bboxValue(bboxObject);
  const innerBBox = bboxValue(innerObject);
  bboxObject?.free();
  innerObject?.free();

  let simplifiedSvg: string | undefined;
  try {
    simplifiedSvg = resvg.toString();
  } catch {
    simplifiedSvg = undefined;
  }

  const rendered = resvg.render();
  try {
    const png = new Uint8Array(rendered.asPng());
    const pixels = request.withPixels ? new Uint8Array(rendered.pixels) : undefined;
    const response: RenderResponse = {
      id: request.id,
      ok: true,
      initMs: init.initMs,
      fontLoaded: init.fontLoaded,
      elapsedMs: performance.now() - started,
      width: rendered.width,
      height: rendered.height,
      png,
      pixels,
      bbox,
      innerBBox,
      simplifiedSvg,
    };
    const transfers: Transferable[] = [png.buffer];
    if (pixels) transfers.push(pixels.buffer);
    scope.postMessage(response, transfers);
    return response;
  } finally {
    rendered.free();
    resvg.free();
  }
}

scope.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    const started = performance.now();
    try {
      const init = await initialize();
      const response: RenderResponse = {
        id: request.id,
        ok: true,
        initMs: performance.now() - started,
        fontLoaded: init.fontLoaded,
      };
      scope.postMessage(response);
    } catch (error) {
      const response: RenderResponse = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      scope.postMessage(response);
    }
    return;
  }

  try {
    await render(request);
  } catch (error) {
    const response: RenderResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
    scope.postMessage(response);
  }
};
