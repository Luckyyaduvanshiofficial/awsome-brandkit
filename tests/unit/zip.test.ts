import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildArchive, verifyArchive } from "../../src/core/zip/archive";

const text = (value: string) => new TextEncoder().encode(value);

describe("ZIP archive", () => {
  it("builds a manifest and verifies every entry", async () => {
    const built = await buildArchive(
      [
        { path: "README.txt", data: "Proofsheet\n" },
        { path: "assets/é-icon.txt", data: "unicode path\n" },
        { path: "assets/mark.bin", data: text("binary payload") },
      ],
      "2026-01-01T00:00:00.000Z",
    );

    expect(built.bytes.length).toBeGreaterThan(100);
    expect(built.manifest.files).toHaveLength(3);
    expect(built.manifest.files.map((file) => file.path)).toEqual([
      "README.txt",
      "assets/mark.bin",
      "assets/é-icon.txt",
    ]);
    expect(built.manifestText).toContain("proofsheet.archive.v1");

    const verified = await verifyArchive(built.bytes);
    expect(verified.valid).toBe(true);
    expect(verified.errors).toEqual([]);
    expect(verified.fileCount).toBe(4);
    expect(verified.totalBytes).toBe(
      built.manifest.files.reduce((total, file) => total + file.bytes, 0),
    );
  });

  it("rejects a truncated archive", async () => {
    const built = await buildArchive([{ path: "README.txt", data: "Proofsheet\n" }]);
    const truncated = built.bytes.slice(0, Math.floor(built.bytes.length * 0.6));
    const verified = await verifyArchive(truncated);
    expect(verified.valid).toBe(false);
    expect(verified.errors.length).toBeGreaterThan(0);
  });

  it("passes a system unzip -t check when unzip is available", async () => {
    const built = await buildArchive([
      { path: "README.txt", data: "Proofsheet\n" },
      { path: "assets/mark.bin", data: text("binary payload") },
    ]);
    const directory = mkdtempSync(join(tmpdir(), "proofsheet-zip-"));
    const archivePath = join(directory, "archive.zip");
    writeFileSync(archivePath, built.bytes);
    try {
      const output = execFileSync("unzip", ["-t", archivePath], { encoding: "utf8" });
      expect(output).toMatch(/No errors detected/i);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects unsafe, reserved, and duplicate paths", async () => {
    await expect(buildArchive([{ path: "../escape.txt", data: "x" }])).rejects.toThrow(
      /Unsafe archive path/,
    );
    await expect(buildArchive([{ path: "/absolute.txt", data: "x" }])).rejects.toThrow(
      /Unsafe archive path/,
    );
    await expect(buildArchive([{ path: "manifest.json", data: "{}" }])).rejects.toThrow(/reserved/);
    await expect(
      buildArchive([
        { path: "same.txt", data: "one" },
        { path: "same.txt", data: "two" },
      ]),
    ).rejects.toThrow(/Duplicate archive path/);
  });
});
