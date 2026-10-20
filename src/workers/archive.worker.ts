/// <reference lib="webworker" />

import { buildArchive, verifyArchive } from "../core/zip/archive";
import type { ArchiveRequest, ArchiveResponse } from "../core/zip/types";

const scope = self as unknown as DedicatedWorkerGlobalScope;

async function handle(request: ArchiveRequest): Promise<ArchiveResponse> {
  if (request.type === "build") {
    const build = await buildArchive(request.files ?? []);
    const verify = await verifyArchive(build.bytes);
    return {
      id: request.id,
      ok: true,
      build: {
        bytes: build.bytes,
        manifestText: build.manifestText,
        elapsedMs: build.elapsedMs,
        verify,
      },
    };
  }

  if (request.type === "verify" && request.bytes) {
    return { id: request.id, ok: true, verify: await verifyArchive(request.bytes) };
  }

  if (request.type === "corrupt" && request.bytes) {
    const cut = Math.max(22, Math.floor(request.bytes.length * 0.6));
    const truncated = request.bytes.slice(0, cut);
    return { id: request.id, ok: true, verify: await verifyArchive(truncated) };
  }

  return { id: request.id, ok: false, error: "Unknown archive request." };
}

scope.onmessage = async (event: MessageEvent<ArchiveRequest>) => {
  try {
    const response = await handle(event.data);
    if (response.build) {
      scope.postMessage(response, [response.build.bytes.buffer]);
    } else {
      scope.postMessage(response);
    }
  } catch (error) {
    const response: ArchiveResponse = {
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
    scope.postMessage(response);
  }
};
