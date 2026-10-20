import type { RenderInitResult, RenderRequest, RenderResponse, RenderResult } from "./types";

interface Pending {
  resolve: (value: RenderResponse) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class RenderWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private started: Promise<RenderInitResult> | null = null;

  start(): Promise<RenderInitResult> {
    if (this.started) return this.started;
    this.started = this.boot();
    return this.started;
  }

  private boot(): Promise<RenderInitResult> {
    return new Promise<RenderInitResult>((resolve, reject) => {
      const worker = new Worker(new URL("../../workers/render.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker = worker;
      worker.onerror = (event) => {
        const error = new Error(event.message || "Render worker crashed.");
        this.rejectAll(error);
        reject(error);
      };
      worker.onmessage = (event: MessageEvent<RenderResponse>) => this.handleMessage(event.data);

      const id = this.send({ id: 0, type: "init" });
      const timer = window.setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.reject(new Error("Render worker initialization timed out."));
      }, 30_000);
      this.pending.set(id, {
        resolve: (response) => {
          window.clearTimeout(timer);
          if (!response.ok) {
            reject(new Error(response.error ?? "Render worker initialization failed."));
            return;
          }
          resolve({
            initMs: response.initMs ?? 0,
            fontLoaded: response.fontLoaded ?? false,
          });
        },
        reject,
        timer,
      });
    });
  }

  private send(request: RenderRequest): number {
    const worker = this.worker;
    if (!worker) throw new Error("Render worker is not running.");
    worker.postMessage(request);
    return request.id;
  }

  private handleMessage(response: RenderResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    window.clearTimeout(pending.timer);
    if (!response.ok) {
      pending.reject(new Error(response.error ?? "Render failed."));
      return;
    }
    pending.resolve(response);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async render(
    svg: string,
    width: number,
    options: { background?: string; withPixels?: boolean } = {},
  ): Promise<RenderResult> {
    await this.start();
    const id = this.nextId++;
    return new Promise<RenderResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Render timed out at ${width}px.`));
      }, 45_000);
      this.pending.set(id, {
        resolve: (response) => {
          if (!response.png || response.width === undefined || response.height === undefined) {
            reject(new Error("Render response was missing its image."));
            return;
          }
          resolve({
            png: response.png,
            pixels: response.pixels,
            width: response.width,
            height: response.height,
            elapsedMs: response.elapsedMs ?? 0,
            bbox: response.bbox,
            innerBBox: response.innerBBox,
            simplifiedSvg: response.simplifiedSvg,
          });
        },
        reject,
        timer,
      });
      this.send({
        id,
        type: "render",
        svg,
        width,
        background: options.background,
        withPixels: options.withPixels,
      });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.started = null;
    this.rejectAll(new Error("Render worker terminated."));
  }
}

let shared: RenderWorkerClient | null = null;

export function getRenderWorker(): RenderWorkerClient {
  shared ??= new RenderWorkerClient();
  return shared;
}
