// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { analyzeSvg, sanitizeSvg } from "../../src/core/svg/preflight";
import { SVG_FIXTURES } from "../../src/lab/fixtures";

function fixture(id: string): string {
  const match = SVG_FIXTURES.find((entry) => entry.id === id);
  if (!match) throw new Error(`Missing fixture: ${id}`);
  return match.svg;
}

describe("SVG preflight", () => {
  it("accepts a clean vector fixture", () => {
    const report = analyzeSvg(fixture("basic-asymmetric"));
    expect(report.parseOk).toBe(true);
    expect(report.rootIsSvg).toBe(true);
    expect(report.width).toBe(200);
    expect(report.height).toBe(120);
    expect(report.blockingReasons).toEqual([]);
    expect(report.vectorContainer).toBe(true);
    expect(report.portableVector).toBe(true);
    expect(report.nodeCount).toBeGreaterThan(0);
  });

  it("detects live text and does not claim portable vector", () => {
    const report = analyzeSvg(fixture("live-text"));
    expect(report.features.liveText).toBe(true);
    expect(report.liveTextFonts).toContain("Instrument Sans Variable");
    expect(report.vectorContainer).toBe(true);
    expect(report.portableVector).toBe(false);
    expect(report.warnings.some((warning) => /live text/i.test(warning))).toBe(true);
  });

  it("detects an embedded raster and refuses a vector-only claim", () => {
    const report = analyzeSvg(fixture("embedded-raster"));
    expect(report.features.embeddedRaster).toBe(true);
    expect(report.vectorContainer).toBe(false);
    expect(report.portableVector).toBe(false);
  });

  it("blocks scripts and strips them during sanitization", () => {
    const report = analyzeSvg(fixture("script-injection"));
    expect(report.features.scripts).toBe(true);
    expect(report.features.eventHandlers).toBe(true);
    expect(report.blockingReasons.length).toBeGreaterThan(0);

    const sanitized = sanitizeSvg(fixture("script-injection"));
    expect(sanitized.sanitized.toLowerCase()).not.toContain("<script");
    expect(sanitized.sanitized.toLowerCase()).not.toContain("onload=");
    expect(sanitized.report.features.scripts).toBe(false);
    expect(sanitized.report.features.eventHandlers).toBe(false);
    expect(sanitized.removed.length).toBeGreaterThan(0);
  });

  it("blocks external references and removes them during sanitization", () => {
    const report = analyzeSvg(fixture("external-image"));
    expect(report.features.externalRefs).toBe(true);
    expect(report.blockingReasons.some((reason) => /external/i.test(reason))).toBe(true);

    const sanitized = sanitizeSvg(fixture("external-image"));
    expect(sanitized.report.features.externalRefs).toBe(false);
    expect(sanitized.sanitized).not.toContain("example.invalid");
  });

  it("flags foreignObject, animation, and unsafe CSS", () => {
    expect(analyzeSvg(fixture("foreign-object")).features.foreignObject).toBe(true);
    expect(analyzeSvg(fixture("animation")).features.animation).toBe(true);
    expect(analyzeSvg(fixture("css-import")).features.unsafeCss).toBe(true);
  });

  it("rejects entities without attempting expansion", () => {
    const report = analyzeSvg(fixture("entity-expansion"));
    expect(report.features.entities).toBe(true);
    expect(report.parseOk).toBe(false);
    expect(report.blockingReasons.length).toBeGreaterThan(0);
  });

  it("rejects huge render boxes and malformed XML", () => {
    const huge = analyzeSvg(fixture("huge-dimensions"));
    expect(huge.blockingReasons.some((reason) => /pixel limit/i.test(reason))).toBe(true);

    const broken = analyzeSvg(fixture("broken-xml"));
    expect(broken.parseOk).toBe(false);
    expect(broken.blockingReasons.length).toBeGreaterThan(0);
  });

  it("does not throw when sanitizing hostile inputs", () => {
    for (const id of ["entity-expansion", "huge-dimensions", "broken-xml", "animation"]) {
      expect(() => sanitizeSvg(fixture(id))).not.toThrow();
    }
  });
});
