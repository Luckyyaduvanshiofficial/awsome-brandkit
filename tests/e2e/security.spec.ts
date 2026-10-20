import { expect, test } from "@playwright/test";

test("hostile SVG inputs are contained and never escape", async ({ page }) => {
  const externalRequests: string[] = [];
  const dialogs: string[] = [];
  const pageErrors: string[] = [];

  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/i.test(url)) {
      const parsed = new URL(url);
      if (parsed.origin !== "http://127.0.0.1:4173") externalRequests.push(url);
    }
  });
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.evaluate(() => {
    window.__proofsheetCanary = "clean";
  });

  const results = await page.evaluate(async () => {
    if (!window.__proofsheetPoc) throw new Error("PoC API was not exposed.");
    return window.__proofsheetPoc.runAll();
  });

  expect(results.security.map((item) => item.id)).toEqual(
    expect.arrayContaining([
      "script-injection",
      "external-image",
      "external-use",
      "foreign-object",
      "animation",
      "css-import",
      "entity-expansion",
      "huge-dimensions",
      "broken-xml",
    ]),
  );

  for (const probe of results.security) {
    expect(probe.blocked, `${probe.id} was not blocked`).toBe(true);
    expect(probe.sanitizedClean, `${probe.id} sanitized output was not clean`).toBe(true);
    expect(probe.browserImageSafe, `${probe.id} executed in the browser image context`).toBe(true);
    expect(probe.error, `${probe.id} threw: ${probe.error}`).toBeUndefined();
  }

  expect(await page.evaluate(() => window.__proofsheetCanary)).toBe("clean");
  expect(externalRequests, externalRequests.join("\n")).toEqual([]);
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(results.csp.violations, results.csp.violations.join("\n")).toEqual([]);
  expect(results.csp.externalResources).toEqual([]);
  expect(results.csp.canary).toBe("clean");
});
