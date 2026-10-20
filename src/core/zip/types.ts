export interface ArchiveFileInput {
  path: string;
  data: string | Uint8Array;
}

export interface ArchiveBuildPayload {
  bytes: Uint8Array;
  manifestText: string;
  elapsedMs: number;
  verify: import("./archive").ArchiveVerifyResult;
}

export interface ArchiveRequest {
  id: number;
  type: "build" | "verify" | "corrupt";
  files?: ArchiveFileInput[];
  bytes?: Uint8Array;
}

export interface ArchiveResponse {
  id: number;
  ok: boolean;
  error?: string;
  build?: ArchiveBuildPayload;
  verify?: import("./archive").ArchiveVerifyResult;
}
