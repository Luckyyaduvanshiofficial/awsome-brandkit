# Proofsheet — TODO

**Product:** Logo-to-brand-kit generator  
**Current phase:** Phase 0 complete — Phase 1 ready  
**Working name:** Proofsheet (verify trademark/domain before launch)  
**Decisions:** PoC first · precision editorial UI · PDF deferred · IndexedDB autosave later  
**Phase 0 outcome:** **Go** for Phase 1, with review guardrails. See [docs/poc-report.md](docs/poc-report.md).

## Phase 0 — Rendering and security proof of concept ✅

**Verified:** 34 unit tests · 6 cross-browser E2E tests · Chromium 156 · Firefox 157 · desktop WebKit 27.2  
**Amber items:** filter-heavy artwork and live text are review-only; iOS Safari is deferred to Phase 4; Linux WebKit requires Playwright host dependencies.

### 0.1 Scaffold and tooling
- [x] Initialize pnpm + Vite + React + TypeScript
- [x] Add Tailwind CSS v4, Proofsheet design tokens, local OFL fonts
- [x] Add Vitest, Playwright, Biome, CI-ready scripts
- [x] Add strict production headers (`_headers`) and SPA fallback
- [x] Add TODO, README, and decision memo structure

### 0.2 SVG preflight and sanitization
- [x] Parse SVG, dimensions, viewBox, node count, depth
- [x] Detect scripts, event handlers, external refs, foreignObject
- [x] Detect animation, embedded raster, unsafe CSS, entity expansion
- [x] Detect live text and declared font families
- [x] Detect unsupported/complex features before rendering
- [x] Sanitize with DOMPurify plus a manual security pass
- [x] Return explicit blocking reasons and vector/portability flags

### 0.3 Rendering
- [x] Initialize resvg-wasm in a module worker
- [x] Load bundled fonts via `fontBuffers`
- [x] Render representative SVG fixtures at 512/1024px
- [x] Confirm bbox/inspection API availability or add alpha-scan fallback
- [x] Compare resvg output with browser-native SVG rasterization
- [x] Measure render time and worker cold-start time

### 0.4 Raster inspection
- [x] Detect PNG/JPEG/WebP and parse dimensions
- [x] Detect PNG alpha, APNG, ICC, animation
- [x] Parse JPEG EXIF orientation and ICC presence
- [x] Parse WebP VP8X alpha/animation and dimensions
- [x] Reject oversized sources before decode
- [x] Verify browser EXIF orientation handling
- [x] Measure alpha bounds and transparent-edge quality

### 0.5 Security
- [x] Test script, `onload`, external ref, foreignObject, animation fixtures
- [x] Test CSS import, entity expansion, huge dimensions, malformed XML
- [x] Assert no external requests and no script canary execution
- [x] Assert source SVG is never injected into the DOM (fixtures are parsed/sanitized only)
- [x] Validate strict CSP in a production preview
- [x] Confirm zero CSP violations during the production-preview gate

### 0.6 ICO
- [x] Implement PNG-in-ICO encoder for 16/32/48/64px
- [x] Validate header, directory, offsets, dimensions
- [x] Decode generated ICO in a browser
- [x] Add corrupt-ICO unit tests

### 0.7 ZIP
- [x] Build deterministic ZIP in a worker with JSZip
- [x] Include manifest with SHA-256 hashes
- [x] Read back and verify entries/hashes
- [x] Test Unicode paths, nested paths, duplicates, corruption
- [x] Verify with `unzip -t` where available

### 0.8 Proof-of-concept dashboard
- [x] Display renderer, security, raster, ICO, ZIP, and performance results
- [x] Show explicit pass/review/blocked verdicts
- [x] Expose results to Playwright
- [x] Add downloadable JSON report

### 0.9 Acceptance and decision memo
- [x] Chromium, Firefox, WebKit smoke tests
- [x] Security test suite passes with no external requests
- [x] Performance caps documented (source size, pixels, nodes)
- [x] Write `docs/poc-report.md` with go/no-go and limitations
- [x] Update the delivery plan if any gate is amber or red

## Phase 1 — Source processing and core exports (after Phase 0 gate)
- [ ] Upload/inspection flow, immutable source registry, SHA-256
- [ ] Approved variant slots (symbol, stacked, horizontal, dark, no-tagline)
- [ ] Text-outlining and filter-review rules in the export eligibility contract
- [ ] Brand palette extraction and contrast checks
- [ ] Logo Kit, Favicon Kit, ICO, previews
- [ ] IndexedDB autosave (source + settings only)
- [ ] First manifest and single-file downloads

## Phase 2 — Integrity validator and archives
- [ ] Independent QA validator for every output
- [ ] Category ZIPs and complete verified ZIP
- [ ] Manifest/QA report, `verify.mjs`, failure UI
- [ ] Full fixture corpus and security regression suite

## Phase 3 — Remaining kits
- [ ] PWA Kit (maskable, Apple touch, manifest)
- [ ] Social Kit (avatars, OG, banner presets with safe areas)
- [ ] Developer Kit (tokens, CSS, favicon HTML, JSON-LD templates)
- [ ] Guidelines Kit (printable HTML; no PDF file in v1)

## Phase 4 — Hardening and launch
- [ ] Accessibility audit (axe + keyboard + screen reader)
- [ ] Cross-browser and iOS Safari pass
- [ ] Visual regression and performance budgets
- [ ] Cloudflare Pages deploy, privacy/terms, docs
- [ ] Launch checklist and final integrity gate
