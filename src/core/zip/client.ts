import type { ArchiveBuildPayload, ArchiveRequest, ArchiveResponse } from "./types";

interface Pending {
  resolve: (response: ArchiveResponse) => void;
  reject: (error: Error) => void;
  timer: number;
}

export class ArchiveWorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../../workers/archive.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onerror = (event) => {
      this.rejectAll(new Error(event.message || "Archive worker crashed."));
    };
    worker.onmessage = (event: MessageEvent<ArchiveResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) return;
      this.pending.delete(event.data.id);
      window.clearTimeout(pending.timer);
      if (!event.data.ok) {
        pending.reject(new Error(event.data.error ?? "Archive operation failed."));
        return;
      }
      pending.resolve(event.data);
    };
    this.worker = worker;
    return worker;
  }

  private request(request: Omit<ArchiveRequest, "id">): Promise<ArchiveResponse> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<ArchiveResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Archive operation timed out."));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ ...request, id });
    });
  }

  async build(files: ArchiveRequest["files"]): Promise<ArchiveBuildPayload> {
    const response = await this.request({ type: "build", files });
    if (!response.build) throw new Error("Archive build returned no payload.");
    return response.build;
  }

  async verify(bytes: Uint8Array) {
    const response = await this.request({ type: "verify", bytes });
    if (!response.verify) throw new Error("Archive verify returned no result.");
    return response.verify;
  }

  async corruptAndVerify(bytes: Uint8Array) {
    const response = await this.request({ type: "corrupt", bytes });
    if (!response.verify) throw new Error("Archive corrupt check returned no result.");
    return response.verify;
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new Error("Archive worker terminated."));
  }
}

let shared: ArchiveWorkerClient | null = null;

export function getArchiveWorker(): ArchiveWorkerClient {
  shared ??= new ArchiveWorkerClient();
  return shared;
}
