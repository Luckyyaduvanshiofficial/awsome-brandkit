# Phase 0 decision memo — renderer and security proof of concept

**Project:** Proofsheet  
**Date:** 20 October 2026  
**Status:** Complete  
**Decision:** **GO for Phase 1**, with the guardrails and review conditions below.

## 1. Decision

The renderer and security architecture is viable for a static, local-first brand-kit app. All blocking Phase 0 gates pass in Chromium, Firefox, and desktop WebKit. No uploaded SVG is injected into the page, hostile fixtures are contained, ICO and ZIP outputs validate, and raster metadata handling is reliable enough to build on.

Phase 1 may start. The following conditions are part of the decision:

1. **Never claim guaranteed pixel identity for live text, missing fonts, or filter-heavy artwork.** These are review items. For guaranteed vector exports, text must be converted to outlines or rendered with an exact embedded font.
2. **Never label an SVG container with an embedded raster as portable vector artwork.** The POC already distinguishes `vectorContainer` from `portableVector`; Phase 1 must preserve that distinction in the UI and manifest.
3. **Keep the security boundary.** Only sanitized SVG may reach the renderer. The raw upload must never be assigned to `innerHTML`, a live `<svg>`, or an injected image node.
4. **Do not invent variants.** Phase 1 variant slots must be explicitly approved or supplied. A flattened PNG cannot be used to fabricate a tagline-free, stacked, dark, or horizontal logo.
5. **Install Playwright host dependencies in CI.** Desktop WebKit passed only after adding the missing `libjpeg-turbo8` system library on this Linux host.
6. **Defer PDF.** Guidelines will be printable HTML; browser print-to-PDF is the v1 path.

There are no red gates. Filter fidelity, live-text fidelity, and the untested iOS target are amber items, not reasons to stop.

## 2. Scope and method

Phase 0 tested the risky parts before product UI work:

- resvg-wasm initialization in a module worker
- sanitized SVG rendering at 512/1024px
- browser-native SVG rasterization for comparison
- font loading and missing-font behavior
- PNG/JPEG/WebP metadata, alpha, EXIF, APNG, ICC, animated WebP
- scripts, event handlers, external references, `foreignObject`, animation, unsafe CSS, entities, oversized inputs, malformed XML
- PNG-in-ICO encoding and browser decode
- deterministic ZIP creation, manifest hashing, read-back verification, corruption rejection
- production CSP and network isolation

The same `runAll()` path is used by the lab dashboard and Playwright. There is no separate mock renderer or mock archive path in the E2E gate.

## 3. Environment

| Item | Value |
| --- | --- |
| Host | Linux x86-64 |
| Node.js | 22.23.3 |
| pnpm | 12.4.2 |
| TypeScript | 7.0.2 |
| Vite | 8.3.4 |
| resvg-wasm | 2.6.2 |
| Chromium | 156.0.8078.4 |
| Firefox | 157.0 |
| WebKit | 27.2 (desktop Playwright build) |

The WebKit run required a host workaround: the Playwright build expects `libjpeg.so.8`, while this host provides `libjpeg.so.62`. The Ubuntu `libjpeg-turbo8` package was extracted into the local Playwright WebKit bundle for validation. CI should use `playwright install-deps` instead.

## 4. Results

### 4.1 Automated gates

| Gate | Result |
| --- | --- |
| Unit tests | **34/34 passed** |
| E2E tests | **6/6 passed** |
| Chromium renderer + security | Pass |
| Firefox renderer + security | Pass |
| Desktop WebKit renderer + security | Pass |
| Lint | Pass |
| Typecheck | Pass |
| Production build | Pass |

The 34 unit tests cover PNG/JPEG/WebP metadata, EXIF orientation, alpha bounds, the complete SVG security fixture set, ICO validity/corruption, ZIP hashing/verification/corruption, Unicode paths, duplicate paths, and system `unzip -t` when available.

### 4.2 Rendering fidelity

Each fixture is rendered by resvg-wasm and by the browser’s native SVG rasterizer at 512px. The diff is the percentage of pixels with any RGBA channel delta greater than 24. Lower is better.

| Fixture | Output | Chromium | Firefox | WebKit | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Basic asymmetric mark | 512×307 | 0.085% | 0.244% | 0.080% | Pass |
| Horizontal lockup | 512×128 | 0.345% | 0.308% | 0.310% | Pass |
| Monochrome paths | 512×512 | 0.027% | 0.024% | 0.027% | Pass |
| Complex vector features | 512×320 | 6.578% | 6.423% | 6.613% | **Review** |
| Intentional transform | 512×372 | 0.042% | 0.172% | 0.042% | Pass |
| Live text, bundled font | 512×137 | 8.934% | 10.066% | 10.101% | **Review** |
| Live text, missing font | 512×137 | 8.926% | 10.061% | 10.092% | **Review** |
| Embedded raster in SVG | 512×358 | 0.058% | 0.957% | 0.058% | Pass, not portable vector |

Key observations:

- **Aspect ratio is preserved exactly** in every fixture and every browser. resvg and native dimensions matched in all 24 fixture/engine combinations.
- Path-only, transform, and embedded-raster fixtures are close enough for the proposed output pipeline.
- The complex fixture uses gradients, a pattern, a clip path, a mask, and a blur filter. Its 6.4–6.6% difference is material, even though it stays under the fixture’s 7% review budget. It is correctly marked **review**, not a clean pass.
- Live text differs by roughly 9–10% in all engines, even with the bundled Instrument Sans font available. Text rendering, hinting, and fallback behavior are not deterministic enough for a guaranteed identity claim. Live text also sets `portableVector: false`.
- The missing-font fixture confirms the risk: a requested but unavailable family silently changes appearance. The product must detect this and require a decision, not ship the substituted rendering as “the logo.”

Representative bounding boxes returned by resvg:

| Fixture | `getBBox()` |
| --- | --- |
| Basic asymmetric mark | `x=14, y=18, w=168, h=82` |
| Horizontal lockup | `x=8, y=14, w=300, h=52` |
| Monochrome paths | `x=24, y=26, w=104, h=110` |
| Complex vector features | `x=0, y=0, w=320, h=200` |
| Intentional transform | `x=24.897, y=46.865, w=170.206, h=79.803` |
| Live text | `x=0, y=0, w=360, h=96` |
| Embedded raster | `x=0, y=0, w=200, h=140` |

The transform fixture also returned an inner bounding box of `x=21, y=19, w=175, h=108`, showing that the inspection API exposes both transformed and pre-transform geometry.

### 4.3 Security containment

Nine hostile fixtures were exercised. Every one was blocked by preflight, produced sanitized output with no dangerous feature remaining, and stayed inert in an image context.

| Probe | Blocked | Removed during sanitization |
| --- | --- | --- |
| Script + `onload` | Yes | `element:script`, `attribute:event-handler` |
| External image `href` | Yes | `external:image`, `reference:external` |
| External `<use>` reference | Yes | `reference:external` |
| `foreignObject` HTML | Yes | `element:foreignObject` |
| SVG animation | Yes | `element:animation` |
| External CSS import | Yes | `unsafe-style-block`, `style:unsafe` |
| Entity declaration | Yes | Raw source rejected before parsing |
| 100,000×100,000 render box | Yes | Rejected by pixel cap |
| Malformed XML | Yes | Rejected by parser |

The hostile fixtures produced:

- **Canary:** clean; no script or event handler executed.
- **External requests:** none.
- **Dialogs:** none.
- **Page errors:** none.
- **CSP violations:** zero in the production-preview run.

The sanitizer uses DOMPurify plus a manual pass. One implementation detail is security-relevant: Chrome attempts to compile inline event handlers while parsing an SVG, even in a detached document. Preflight therefore detects `on*` attributes on the raw source and redacts them from the parse-only copy. This prevents CSP report noise during inspection without weakening detection. The unsafe source is never rendered.

The production CSP is:

```text
default-src 'self'
script-src 'self' 'wasm-unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' blob: data:
font-src 'self' data:
connect-src 'self'
worker-src 'self' blob:
media-src 'none'
object-src 'none'
base-uri 'none'
form-action 'none'
frame-ancestors 'none'
```

`wasm-unsafe-eval` is required for resvg-wasm. There is no `unsafe-eval`, no remote connect source, and no third-party script or font request.

### 4.4 ICO

The encoder produced a 2,809-byte ICO with four PNG entries:

| Size | PNG bytes |
| ---: | ---: |
| 16×16 | 347 |
| 32×32 | 583 |
| 48×48 | 777 |
| 64×64 | 1,032 |

All three engines decoded the generated ICO as a 64×64 image. Unit tests cover the 256-as-zero directory rule, duplicate sizes, mismatched payload dimensions, corrupt image offsets, and truncated directories.

### 4.5 ZIP

The archive gate built a 100-entry archive in the worker:

- 96 generated documentation entries
- `README.txt`
- `assets/mark-128.png`
- `assets/é-icon.ico`
- `manifest.json`

Every entry is hashed with SHA-256 and recorded in the manifest. Read-back verification confirmed all hashes and the entry count. A deliberately truncated copy was rejected. The test suite also passes the archive through system `unzip -t`, which reports no errors when available.

Measured uncompressed entry bytes: **7,548**. The ZIP is deterministic for the fixed archive date used by the PoC.

### 4.6 Raster inspection

| Check | Result |
| --- | --- |
| PNG dimensions | 64×28 |
| PNG alpha | Detected |
| Alpha bounds | `x=10, y=3, w=50, h=20` |
| APNG animation | Detected |
| ICC profile fixture | Detected |
| Animated WebP | Detected |
| WebP dimensions + alpha | 64×28, alpha detected |
| JPEG dimensions | 64×28 |
| EXIF orientation | Declared 6; displayed and browser-decoded 28×64 |
| Oversized pixel cap | Rejected |
| Oversized byte cap | Rejected |

WebKit’s canvas encoder reported an ICC profile on the generated test PNG while Chromium and Firefox did not. That is a browser-encoder difference, not a metadata failure; the dedicated ICC fixture was detected in all engines.

### 4.7 Performance

Indicative production-preview timings, measured on this host:

| Metric | Chromium | Firefox | WebKit | Gate |
| --- | ---: | ---: | ---: | ---: |
| Worker cold start | 121 ms | 286 ms | 314 ms | 5,000 ms |
| One 512px render | 38.5 ms | 48 ms | 50 ms | — |
| One 1024px render | 170 ms | 196 ms | 200 ms | 3,000 ms |
| 32 × 256px batch | 587 ms | 773 ms | 703 ms | 15,000 ms |
| Batch throughput | 54.6 assets/s | 41.4 assets/s | 45.5 assets/s | — |

All engines pass with substantial margin. These numbers are not a device benchmark; they establish that the architecture is comfortably inside the Phase 0 envelope for a local-first app.

## 5. Caps and limits

| Limit | Value | Evidence |
| --- | ---: | --- |
| Raster file size | 25 MB | Oversized fixture rejected |
| Raster pixels | 50,000,000 | Oversized fixture rejected |
| SVG file size | 5 MB | Preflight byte limit |
| SVG nodes | 50,000 | Preflight node cap |
| SVG depth | 100 | Preflight depth cap |

The caps are provisional. They should be revisited after testing real customer logos and after measuring memory pressure on mobile devices.

## 6. Known limitations and deferred work

- **Live text is not export-safe without an exact font or outlining.** This is the largest fidelity finding. The product needs an explicit text policy before Phase 1 exports.
- **Filters are renderer-dependent.** Blur and filter-heavy artwork can differ visibly. The PoC detects filter usage and marks the fixture for review.
- **Embedded fonts are not implemented.** The worker loads the bundled Instrument Sans. Phase 1 must decide whether to support uploaded/embedded font bytes, require outlining, or refuse guaranteed vector output for un-outlined custom fonts.
- **No upload flow exists yet.** The hostile SVG tests operate on the fixture corpus. Phase 1 must add regression tests around the real file-drop path and confirm the raw file is never injected into the DOM.
- **No iOS Safari device validation.** Desktop WebKit 27.2 passed; iOS 16.4+ remains a Phase 4 target.
- **No PDF.** Deferred by decision; use printable HTML.
- **No full brand-kit generation yet.** The ZIP is a deterministic integration fixture, not a customer deliverable.
- **WebKit host dependency.** Linux CI needs Playwright’s system dependencies. The local validation used an extracted `libjpeg-turbo8`; this is not a product runtime dependency.
- **No Cloudflare Pages deployment.** Headers and SPA fallback are configured; deployment is a later phase.

## 7. Phase 1 entry criteria

Phase 1 can start when these remain true:

- [x] The renderer, archive, raster, ICO, and security gates pass in all three desktop engines.
- [x] No third-party requests are made by the PoC.
- [x] Hostile SVG is blocked before render and never injected into the DOM.
- [x] The app is static and backend-free.
- [x] The decision record states the fidelity limits rather than hiding them.
- [ ] Upload flow and immutable source registry exist.
- [ ] A real-logo sample set has been tested against the provisional caps.
- [ ] The text/outlining policy is written into the export contract.
- [ ] iOS testing is scheduled for Phase 4.

## 8. Reproduction

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

The E2E suite starts a production preview, loads `/`, runs the lab through the same API exposed to the dashboard, and asserts the renderer, security, ICO, ZIP, raster, performance, and CSP gates.

On Linux, WebKit needs Playwright’s host dependencies:

```bash
sudo pnpm exec playwright install-deps
```

## 9. Conclusion

The risky assumptions behind Proofsheet hold up. resvg-wasm is fast enough, SVG isolation can be enforced without a backend, ICO and ZIP outputs validate across engines, and the app can remain static and local-first.

The fidelity limits are real but containable: filters and live text are review items, embedded raster is never called vector, and missing fonts cannot be silently substituted. Phase 0 therefore closes with a **go** decision and a narrower, explicit export promise for Phase 1.
