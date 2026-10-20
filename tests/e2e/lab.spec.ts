import { expect, test } from "@playwright/test";

test("Phase 0 gates: rendering, ICO, ZIP, raster, performance", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("wasm-unsafe-eval");
  expect(csp).not.toContain("'unsafe-eval'");

  await expect(page.getByTestId("run-poc")).toBeVisible();
  await page.getByTestId("run-poc").click();
  await expect(page.getByTestId("poc-json")).toContainText('"schemaVersion": "proofsheet.poc.v1"', {
    timeout: 120_000,
  });
  const results = await page.evaluate(() => window.__proofsheetPoc?.getResults() ?? null);
  if (!results) throw new Error("The UI completed without storing PoC results.");

  expect(results.errors, JSON.stringify(results.errors, null, 2)).toEqual([]);
  expect(results.fixtures.length).toBeGreaterThanOrEqual(8);
  expect(results.security.length).toBeGreaterThanOrEqual(8);

  const basic = results.fixtures.find((fixture) => fixture.id === "basic-asymmetric");
  expect(basic?.verdict).toBe("pass");
  expect(basic?.resvg?.width).toBe(512);
  expect(basic?.resvg?.height).toBe(307);
  expect(basic?.native?.width).toBe(512);
  expect(basic?.native?.height).toBe(307);
  expect(basic?.resvg?.bbox).toMatchObject({ x: 14, y: 18, width: 168, height: 82 });
  expect(basic?.diff?.percent ?? 100).toBeLessThan(1.5);

  const horizontal = results.fixtures.find((fixture) => fixture.id === "horizontal-lockup");
  expect(horizontal?.resvg?.width).toBe(512);
  expect(horizontal?.resvg?.height).toBe(128);
  expect(horizontal?.native?.height).toBe(128);

  const complex = results.fixtures.find((fixture) => fixture.id === "complex-vector");
  expect(complex?.verdict).not.toBe("error");
  expect(complex?.verdict).not.toBe("blocked");
  expect(complex?.resvg?.width).toBe(512);
  expect(complex?.resvg?.height).toBe(320);
  expect(complex?.native?.height).toBe(320);

  const liveText = results.fixtures.find((fixture) => fixture.id === "live-text");
  expect(liveText?.portableVector).toBe(false);
  expect(liveText?.liveText).toBe(true);

  const missingFont = results.fixtures.find((fixture) => fixture.id === "missing-font");
  expect(missingFont?.verdict).toBe("review");

  const rasterInSvg = results.fixtures.find((fixture) => fixture.id === "embedded-raster");
  expect(rasterInSvg?.vectorContainer).toBe(false);
  expect(rasterInSvg?.portableVector).toBe(false);

  expect(results.ico.valid, JSON.stringify(results.ico.errors)).toBe(true);
  expect(results.ico.entries.map((entry) => entry.width)).toEqual([16, 32, 48, 64]);
  if (test.info().project.name === "chromium") {
    expect(results.ico.browserDecoded).toBe(true);
    expect(results.ico.browserWidth).toBe(64);
    expect(results.ico.browserHeight).toBe(64);
  }
  expect(results.zip.built).toBe(true);
  expect(results.zip.verified, JSON.stringify(results.zip.errors)).toBe(true);
  expect(results.zip.corruptRejected).toBe(true);
  expect(results.zip.fileCount).toBe(100);

  expect(results.raster.errors, JSON.stringify(results.raster.errors)).toEqual([]);
  expect(results.raster.png.hasAlpha).toBe(true);
  expect(results.raster.webp?.hasAlpha).toBe(true);
  expect(results.raster.exif.declaredOrientation).toBe(6);
  expect(results.raster.exif.swapped).toBe(true);
  expect(results.raster.apng.animated).toBe(true);
  expect(results.raster.icc.detected).toBe(true);
  expect(results.raster.animatedWebp.detected).toBe(true);
  expect(results.raster.limits.oversizedRejected).toBe(true);

  expect(results.performance.coldStartMs).toBeLessThanOrEqual(
    results.performance.thresholds.coldStartMs,
  );
  expect(results.performance.one1024Ms).toBeLessThanOrEqual(
    results.performance.thresholds.one1024Ms,
  );
  expect(results.performance.batch32Ms).toBeLessThanOrEqual(
    results.performance.thresholds.batch32Ms,
  );

  expect(results.csp.violations, results.csp.violations.join("\n")).toEqual([]);
  expect(results.csp.externalResources).toEqual([]);
  expect(results.csp.canary).toBe("clean");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => /Content Security Policy/i.test(message))).toEqual([]);
});
