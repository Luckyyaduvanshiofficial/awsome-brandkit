import JSZip from "jszip";
import { sha256Hex } from "../hash";

export interface ArchiveInput {
  path: string;
  data: Uint8Array | string;
}

export interface ArchiveManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ArchiveManifest {
  schemaVersion: "proofsheet.archive.v1";
  generatedAt: string;
  files: ArchiveManifestEntry[];
}

export interface ArchiveBuildResult {
  bytes: Uint8Array;
  manifest: ArchiveManifest;
  manifestText: string;
  elapsedMs: number;
}

export interface ArchiveVerifyResult {
  valid: boolean;
  errors: string[];
  fileCount: number;
  totalBytes: number;
  manifest?: ArchiveManifest;
}

export const POC_ARCHIVE_DATE = new Date("2026-01-01T00:00:00.000Z");

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function unsafePathReason(path: string): string | null {
  if (!path) return "empty path";
  if (path.startsWith("/") || path.startsWith("\\")) return "absolute path";
  if (/^[a-zA-Z]:/.test(path)) return "drive-letter path";
  if (path.includes("\\")) return "backslash path";
  if (path.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) {
    return "dot or empty path segment";
  }
  return null;
}

export async function buildArchive(
  inputs: ArchiveInput[],
  generatedAt = new Date().toISOString(),
): Promise<ArchiveBuildResult> {
  const started = performance.now();
  const zip = new JSZip();
  const seen = new Set<string>();
  const files: ArchiveManifestEntry[] = [];

  for (const input of inputs) {
    const reason = unsafePathReason(input.path);
    if (reason) throw new Error(`Unsafe archive path "${input.path}": ${reason}.`);
    if (input.path === "manifest.json") throw new Error("manifest.json is reserved.");
    if (seen.has(input.path)) throw new Error(`Duplicate archive path: ${input.path}.`);
    seen.add(input.path);

    const data = typeof input.data === "string" ? encodeText(input.data) : input.data;
    // Always hand JSZip bytes. Passing a string together with `binary: false`
    // is fine, but passing the encoded bytes with that flag is not.
    zip.file(input.path, data, {
      binary: true,
      date: POC_ARCHIVE_DATE,
      unixPermissions: 0o100644,
    });
    files.push({
      path: input.path,
      bytes: data.length,
      sha256: await sha256Hex(data),
    });
  }

  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const manifest: ArchiveManifest = {
    schemaVersion: "proofsheet.archive.v1",
    generatedAt,
    files,
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  zip.file("manifest.json", encodeText(manifestText), {
    binary: true,
    date: POC_ARCHIVE_DATE,
  });

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS",
  });

  return {
    bytes,
    manifest,
    manifestText,
    elapsedMs: performance.now() - started,
  };
}

export async function verifyArchive(bytes: Uint8Array): Promise<ArchiveVerifyResult> {
  const errors: string[] = [];
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    return {
      valid: false,
      errors: [
        `Archive could not be read: ${error instanceof Error ? error.message : String(error)}`,
      ],
      fileCount: 0,
      totalBytes: 0,
    };
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const names = new Set(entries.map((entry) => entry.name));
  for (const name of names) {
    const reason = unsafePathReason(name);
    if (reason) errors.push(`Unsafe archive path "${name}": ${reason}.`);
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    return {
      valid: false,
      errors: [...errors, "manifest.json is missing."],
      fileCount: entries.length,
      totalBytes: 0,
    };
  }

  let manifest: ArchiveManifest;
  try {
    const parsed = JSON.parse(await manifestFile.async("string")) as ArchiveManifest;
    if (parsed.schemaVersion !== "proofsheet.archive.v1" || !Array.isArray(parsed.files)) {
      throw new Error("Unsupported manifest schema.");
    }
    manifest = parsed;
  } catch (error) {
    return {
      valid: false,
      errors: [
        ...errors,
        `Invalid manifest: ${error instanceof Error ? error.message : String(error)}`,
      ],
      fileCount: entries.length,
      totalBytes: 0,
    };
  }

  let totalBytes = 0;
  const expected = new Set<string>();
  for (const file of manifest.files) {
    const reason = unsafePathReason(file.path);
    if (reason) {
      errors.push(`Unsafe manifest path "${file.path}": ${reason}.`);
      continue;
    }
    expected.add(file.path);
    const entry = zip.file(file.path);
    if (!entry) {
      errors.push(`Missing file: ${file.path}.`);
      continue;
    }
    const data = await entry.async("uint8array");
    totalBytes += data.length;
    if (data.length !== file.bytes) {
      errors.push(`Size mismatch for ${file.path}: ${data.length} vs ${file.bytes}.`);
    }
    const digest = await sha256Hex(data);
    if (digest !== file.sha256) {
      errors.push(`SHA-256 mismatch for ${file.path}.`);
    }
  }

  for (const entry of entries) {
    if (entry.name !== "manifest.json" && !expected.has(entry.name)) {
      errors.push(`Unexpected file not listed in manifest: ${entry.name}.`);
    }
  }
  if (entries.length !== expected.size + 1) {
    errors.push(
      `Entry count ${entries.length} does not match manifest (${expected.size} + manifest).`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    fileCount: entries.length,
    totalBytes,
    manifest,
  };
}
