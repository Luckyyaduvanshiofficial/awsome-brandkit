import { toBlob } from "../core/bytes";
import { encodeIco, validateIco } from "../core/ico/ico";
import { alphaBounds, diffRgba } from "../core/imaging/alpha";
import { decodeToRgba } from "../core/imaging/decode";
import { parseImageMetadata } from "../core/imaging/metadata";
import { getRenderWorker } from "../core/render/client";
import type { RenderInitResult } from "../core/render/types";
import { analyzeSvg, sanitizeSvg } from "../core/svg/preflight";
import { checkImageLimits, type ImageMetadata } from "../core/types";
import { getArchiveWorker } from "../core/zip/client";
import { SVG_FIXTURES, type SvgFixture } from "./fixtures";
import { loadDocumentFonts, renderSvgNative } from "./native";
import { makeRasterFixtures } from "./raster-fixtures";
import type {
  FixtureResult,
  IcoResult,
  PocResults,
  RasterResult,
  SecurityResult,
  ZipResult,
} from "./types";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="26" y="26" width="94" height="94" rx="10" fill="#d9482f"/>
  <path d="M134 30 L226 218 L134 218 Z" fill="#181613"/>
  <circle cx="202" cy="54" r="18" fill="#f5f2ea" stroke="#181613" stroke-width="6"/>
</svg>`;

let currentResults: PocResults | null = null;

export function getPocResults(): PocResults | null {
  return currentResults;
}

function shortError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeResultBase(startedAt: string): PocResults {
  return {
    schemaVersion: "proofsheet.poc.v1",
    startedAt,
    durationMs: 0,
    userAgent: navigator.userAgent,
    summary: { pass: 0, review: 0, blocked: 0, error: 0 },
    fixtures: [],
    security: [],
    ico: {
      valid: false,
      entries: [],
      bytes: 0,
      elapsedMs: 0,
      browserDecoded: false,
      errors: [],
    },
    zip: {
      built: false,
      verified: false,
      corruptRejected: false,
      fileCount: 0,
      totalBytes: 0,
      elapsedMs: 0,
      errors: [],
    },
    raster: emptyRasterResult(),
    performance: {
      coldStartMs: 0,
      fontLoaded: false,
      one512Ms: 0,
      one1024Ms: 0,
      batch32Ms: 0,
      assetsPerSecond: 0,
      thresholds: { coldStartMs: 5000, one1024Ms: 3000, batch32Ms: 15000 },
    },
    csp: {
      violations: [],
      externalResources: [],
      canary: "unset",
    },
    passed: false,
    errors: [],
  };
}

function emptyRasterResult(): RasterResult {
  return {
    png: { width: 0, height: 0, hasAlpha: false, animated: false, iccProfile: false },
    jpeg: { width: 0, height: 0, orientation: 1, hasAlpha: false },
    exif: {
      declaredOrientation: 1,
      displayWidth: 0,
      displayHeight: 0,
      browserWidth: 0,
      browserHeight: 0,
      swapped: false,
    },
    apng: { animated: false },
    icc: { detected: false },
    animatedWebp: { detected: false },
    limits: { oversizedRejected: false, oversizedBytesRejected: false },
    errors: [],
  };
}

async function renderFixture(
  fixture: SvgFixture,
  width: number,
  renderer: ReturnType<typeof getRenderWorker>,
): Promise<FixtureResult> {
  const report = analyzeSvg(fixture.svg);
  const result: FixtureResult = {
    id: fixture.id,
    name: fixture.name,
    category: fixture.category,
    verdict: "error",
    vectorContainer: report.vectorContainer,
    portableVector: report.portableVector,
    liveText: report.features.liveText,
    blockingReasons: report.blockingReasons,
    warnings: report.warnings,
  };

  if (report.blockingReasons.length > 0) {
    result.verdict = "blocked";
    return result;
  }

  try {
    const sanitized = sanitizeSvg(fixture.svg);
    const resvg = await renderer.render(sanitized.sanitized, width, {
      background: "#ffffff",
      withPixels: true,
    });
    const native = await renderSvgNative(sanitized.sanitized, width, "#ffffff", resvg.height);
    const resvgImage =
      resvg.pixels !== undefined
        ? { width: resvg.width, height: resvg.height, data: new Uint8ClampedArray(resvg.pixels) }
        : (await decodeToRgba(resvg.png, "image/png")).image;
    const diff = diffRgba(resvgImage, native.image);
    const threshold = fixture.diffThreshold ?? 0.02;
    const within = diff.percent <= threshold * 100;

    result.resvg = {
      width: resvg.width,
      height: resvg.height,
      elapsedMs: resvg.elapsedMs,
      bbox: resvg.bbox,
      innerBBox: resvg.innerBBox,
      simplifiedSvgLength: resvg.simplifiedSvg?.length,
    };
    result.native = {
      width: native.width,
      height: native.height,
      elapsedMs: native.elapsedMs,
    };
    result.diff = {
      percent: diff.percent,
      meanDelta: diff.meanDelta,
      maxDelta: diff.maxDelta,
      threshold,
    };
    result.verdict =
      within && !fixture.fontSensitive && !report.features.filters ? "pass" : "review";
    if (!within) {
      result.warnings = [
        ...result.warnings,
        `Pixel difference ${diff.percent.toFixed(2)}% exceeds the ${(threshold * 100).toFixed(1)}% review threshold.`,
      ];
    }
    return result;
  } catch (error) {
    result.verdict = "error";
    result.error = shortError(error);
    return result;
  }
}

async function runSecurityChecks(): Promise<SecurityResult[]> {
  const results: SecurityResult[] = [];
  window.__proofsheetCanary = "clean";

  for (const fixture of SVG_FIXTURES.filter((entry) => entry.category === "security")) {
    const report = analyzeSvg(fixture.svg);
    try {
      const sanitized = sanitizeSvg(fixture.svg);
      const sanitizedReport = sanitized.report;
      const dangerous =
        sanitizedReport.features.scripts ||
        sanitizedReport.features.eventHandlers ||
        sanitizedReport.features.externalRefs ||
        sanitizedReport.features.foreignObject ||
        sanitizedReport.features.animation ||
        sanitizedReport.features.unsafeCss ||
        sanitizedReport.features.entities;
      const blocked = report.blockingReasons.length > 0;
      let browserImageSafe = true;
      if (fixture.id === "script-injection") {
        try {
          // Render the sanitized artifact, the only form the product would ever
          // hand to an image context. The original is never injected into the page.
          await renderSvgNative(sanitized.sanitized, 64, "#ffffff");
        } catch {
          // The image context may refuse the file; that is also safe.
        }
        browserImageSafe = window.__proofsheetCanary === "clean";
      }
      results.push({
        id: fixture.id,
        name: fixture.name,
        expectedBlocked: fixture.expectedBlocked ?? true,
        blocked,
        sanitizedClean: !dangerous,
        browserImageSafe,
        reasons: report.blockingReasons,
        removed: sanitized.removed,
      });
    } catch (error) {
      results.push({
        id: fixture.id,
        name: fixture.name,
        expectedBlocked: fixture.expectedBlocked ?? true,
        blocked: report.blockingReasons.length > 0,
        sanitizedClean: false,
        browserImageSafe: window.__proofsheetCanary === "clean",
        reasons: report.blockingReasons,
        removed: [],
        error: shortError(error),
      });
    }
  }

  return results;
}

async function decodeIcoInBrowser(
  bytes: Uint8Array,
): Promise<{ ok: boolean; width?: number; height?: number }> {
  const blob = toBlob(bytes, "image/x-icon");
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return { ok: true, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return { ok: false };
  } finally {
    URL.revokeObjectURL(url);
    image.removeAttribute("src");
  }
}

async function runIcoCheck(renderer: ReturnType<typeof getRenderWorker>): Promise<IcoResult> {
  const started = performance.now();
  const result: IcoResult = {
    valid: false,
    entries: [],
    bytes: 0,
    elapsedMs: 0,
    browserDecoded: false,
    errors: [],
  };
  try {
    const images = [];
    for (const size of [16, 32, 48, 64]) {
      const rendered = await renderer.render(MARK_SVG, size);
      images.push({ size, png: rendered.png });
    }
    const ico = encodeIco(images);
    const validation = validateIco(ico);
    const browser = await decodeIcoInBrowser(ico);
    result.valid = validation.valid;
    result.entries = validation.entries.map((entry) => ({
      width: entry.width,
      height: entry.height,
      bytesInRes: entry.bytesInRes,
    }));
    result.bytes = ico.length;
    result.elapsedMs = performance.now() - started;
    result.browserDecoded = browser.ok;
    result.browserWidth = browser.width;
    result.browserHeight = browser.height;
    result.errors = validation.errors;
    return result;
  } catch (error) {
    result.errors.push(shortError(error));
    result.elapsedMs = performance.now() - started;
    return result;
  }
}

async function runZipCheck(
  renderer: ReturnType<typeof getRenderWorker>,
  icoBytes: Uint8Array,
): Promise<ZipResult> {
  const started = performance.now();
  const result: ZipResult = {
    built: false,
    verified: false,
    corruptRejected: false,
    fileCount: 0,
    totalBytes: 0,
    elapsedMs: 0,
    errors: [],
  };
  try {
    const textFiles = Array.from({ length: 96 }, (_, index) => ({
      path: `docs/note-${String(index + 1).padStart(2, "0")}.txt`,
      data: `Proofsheet archive fixture ${index + 1}\n`,
    }));
    const mark = await renderer.render(MARK_SVG, 128);
    const files = [
      ...textFiles,
      { path: "README.txt", data: "Proofsheet PoC archive\n" },
      { path: "assets/mark-128.png", data: mark.png },
      { path: "assets/é-icon.ico", data: icoBytes },
    ];
    const built = await getArchiveWorker().build(files);
    const corrupt = await getArchiveWorker().corruptAndVerify(built.bytes);
    result.built = built.bytes.length > 0;
    result.verified = built.verify.valid;
    result.corruptRejected = !corrupt.valid;
    result.fileCount = built.verify.fileCount;
    result.totalBytes = built.verify.totalBytes;
    result.elapsedMs = performance.now() - started;
    result.errors = built.verify.errors;
    return result;
  } catch (error) {
    result.errors.push(shortError(error));
    result.elapsedMs = performance.now() - started;
    return result;
  }
}

async function runRasterChecks(): Promise<RasterResult> {
  const result = emptyRasterResult();
  try {
    const fixtures = await makeRasterFixtures();
    const pngMeta = parseImageMetadata(fixtures.png);
    const jpegMeta = parseImageMetadata(fixtures.jpeg);
    const exifMeta = parseImageMetadata(fixtures.exifJpeg);
    const apngMeta = parseImageMetadata(fixtures.apng);
    const iccMeta = parseImageMetadata(fixtures.iccPng);
    const animatedWebpMeta = parseImageMetadata(fixtures.animatedWebp);

    result.png = {
      width: pngMeta.width,
      height: pngMeta.height,
      hasAlpha: pngMeta.hasAlpha,
      animated: pngMeta.animated,
      iccProfile: pngMeta.iccProfile,
    };
    const pngImage = await decodeToRgba(fixtures.png, "image/png");
    result.png.alphaBounds = alphaBounds(pngImage.image);

    result.jpeg = {
      width: jpegMeta.width,
      height: jpegMeta.height,
      orientation: jpegMeta.orientation,
      hasAlpha: jpegMeta.hasAlpha,
    };
    if (fixtures.webp) {
      const webpMeta = parseImageMetadata(fixtures.webp);
      result.webp = {
        width: webpMeta.width,
        height: webpMeta.height,
        hasAlpha: webpMeta.hasAlpha,
      };
    }

    const exifBitmap = await createImageBitmap(toBlob(fixtures.exifJpeg, "image/jpeg"), {
      imageOrientation: "from-image",
    });
    result.exif = {
      declaredOrientation: exifMeta.orientation,
      displayWidth: exifMeta.displayWidth,
      displayHeight: exifMeta.displayHeight,
      browserWidth: exifBitmap.width,
      browserHeight: exifBitmap.height,
      swapped:
        exifBitmap.width === exifMeta.displayWidth && exifBitmap.height === exifMeta.displayHeight,
    };
    exifBitmap.close();

    result.apng = { animated: apngMeta.animated };
    result.icc = { detected: iccMeta.iccProfile };
    result.animatedWebp = { detected: animatedWebpMeta.animated };

    const fakeHuge: ImageMetadata = { ...pngMeta, width: 10_000, height: 10_000 };
    const fakeBytes: ImageMetadata = { ...pngMeta, bytes: 30 * 1024 * 1024 };
    result.limits = {
      oversizedRejected: checkImageLimits(fakeHuge).length > 0,
      oversizedBytesRejected: checkImageLimits(fakeBytes).length > 0,
    };

    if (pngMeta.width !== 64 || pngMeta.height !== 28)
      result.errors.push("PNG dimensions are wrong.");
    if (!pngMeta.hasAlpha) result.errors.push("PNG alpha was not detected.");
    if (pngMeta.animated) result.errors.push("PNG was incorrectly marked animated.");
    if (jpegMeta.width !== 64 || jpegMeta.height !== 28)
      result.errors.push("JPEG dimensions are wrong.");
    if (exifMeta.orientation !== 6) result.errors.push("EXIF orientation 6 was not detected.");
    if (exifMeta.displayWidth !== 28 || exifMeta.displayHeight !== 64) {
      result.errors.push("EXIF display dimensions were not swapped.");
    }
    if (exifMeta.truncated) {
      result.errors.push("EXIF JPEG was marked truncated.");
    }
    if (!apngMeta.animated) result.errors.push("APNG animation was not detected.");
    if (!iccMeta.iccProfile) result.errors.push("PNG ICC profile was not detected.");
    if (!animatedWebpMeta.animated) result.errors.push("Animated WebP flag was not detected.");
    if (!result.exif.swapped) {
      result.errors.push(
        "Browser did not apply EXIF orientation with imageOrientation: from-image.",
      );
    }
    if (!result.limits.oversizedRejected || !result.limits.oversizedBytesRejected) {
      result.errors.push("Input limits were not enforced.");
    }
    const bounds = result.png.alphaBounds;
    if (!bounds) {
      result.errors.push("Alpha bounds were empty.");
    } else if (
      Math.abs(bounds.x - 10) > 3 ||
      Math.abs(bounds.y - 5) > 3 ||
      Math.abs(bounds.width - 50) > 4 ||
      Math.abs(bounds.height - 19) > 4
    ) {
      result.errors.push(
        `Alpha bounds ${bounds.x},${bounds.y} ${bounds.width}×${bounds.height} are outside tolerance.`,
      );
    }
    return result;
  } catch (error) {
    result.errors.push(shortError(error));
    return result;
  }
}

async function runPerformanceCheck(
  renderer: ReturnType<typeof getRenderWorker>,
  init: RenderInitResult,
): Promise<PocResults["performance"]> {
  const basic = SVG_FIXTURES.find((fixture) => fixture.id === "basic-asymmetric");
  if (!basic) throw new Error("The basic-asymmetric fixture is missing.");
  const one512 = await renderer.render(basic.svg, 512);
  const one1024 = await renderer.render(basic.svg, 1024);
  const batchStarted = performance.now();
  for (let index = 0; index < 32; index += 1) {
    await renderer.render(basic.svg, 256);
  }
  const batch32Ms = performance.now() - batchStarted;
  return {
    coldStartMs: init.initMs,
    fontLoaded: init.fontLoaded,
    one512Ms: one512.elapsedMs,
    one1024Ms: one1024.elapsedMs,
    batch32Ms,
    assetsPerSecond: 32 / (batch32Ms / 1000),
    thresholds: { coldStartMs: 5000, one1024Ms: 3000, batch32Ms: 15000 },
  };
}

function summarize(fixtures: FixtureResult[]) {
  return fixtures.reduce(
    (summary, fixture) => {
      if (fixture.verdict !== "skip") summary[fixture.verdict] += 1;
      return summary;
    },
    { pass: 0, review: 0, blocked: 0, error: 0 },
  );
}

export async function runPoc(onProgress?: (stage: string) => void): Promise<PocResults> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const results = makeResultBase(startedAt);
  const renderer = getRenderWorker();

  try {
    onProgress?.("Loading fonts and initializing resvg-wasm");
    await loadDocumentFonts();
    const init = await renderer.start();
    results.performance.coldStartMs = init.initMs;
    results.performance.fontLoaded = init.fontLoaded;

    onProgress?.("Rendering SVG fixture matrix");
    for (const fixture of SVG_FIXTURES.filter((entry) => entry.category !== "security")) {
      results.fixtures.push(await renderFixture(fixture, 512, renderer));
    }

    onProgress?.("Running security probes");
    results.security = await runSecurityChecks();

    onProgress?.("Encoding and decoding ICO");
    results.ico = await runIcoCheck(renderer);

    onProgress?.("Building and verifying ZIP archive");
    // Build a fresh ICO for the archive so the ZIP check remains independent of
    // browser ICO decode support.
    const icoImages = [];
    for (const size of [16, 32, 48, 64]) {
      const rendered = await renderer.render(MARK_SVG, size);
      icoImages.push({ size, png: rendered.png });
    }
    const archiveIco = encodeIco(icoImages);
    results.zip = await runZipCheck(renderer, archiveIco);

    onProgress?.("Inspecting raster metadata and EXIF orientation");
    results.raster = await runRasterChecks();

    onProgress?.("Measuring render performance");
    results.performance = {
      ...(await runPerformanceCheck(renderer, init)),
      thresholds: results.performance.thresholds,
    };

    onProgress?.("Checking CSP and network isolation");
    results.csp = {
      violations: [...(window.__proofsheetCspViolations ?? [])],
      externalResources: performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => {
          if (!/^https?:/i.test(name)) return false;
          try {
            return new URL(name).origin !== location.origin;
          } catch {
            return false;
          }
        }),
      canary: window.__proofsheetCanary ?? "unset",
    };
  } catch (error) {
    results.errors.push(shortError(error));
  }

  results.summary = summarize(results.fixtures);
  results.durationMs = performance.now() - started;

  const fixturesPass = results.fixtures.every(
    (fixture) => fixture.verdict !== "error" && fixture.verdict !== "blocked",
  );
  const securityPass = results.security.every(
    (item) => item.blocked && item.sanitizedClean && item.browserImageSafe && !item.error,
  );
  const icoPass = results.ico.valid && results.ico.entries.length === 4;
  const zipPass = results.zip.built && results.zip.verified && results.zip.corruptRejected;
  const rasterPass = results.raster.errors.length === 0;
  const perf = results.performance;
  const performancePass =
    perf.coldStartMs <= perf.thresholds.coldStartMs &&
    perf.one1024Ms <= perf.thresholds.one1024Ms &&
    perf.batch32Ms <= perf.thresholds.batch32Ms;
  const cspPass =
    results.csp.violations.length === 0 &&
    results.csp.externalResources.length === 0 &&
    results.csp.canary === "clean";

  results.passed =
    results.errors.length === 0 &&
    fixturesPass &&
    securityPass &&
    icoPass &&
    zipPass &&
    rasterPass &&
    performancePass &&
    cspPass;

  currentResults = results;
  return results;
}
