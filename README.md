# Proofsheet

Proofsheet is a local-first logo-to-brand-kit generator. It takes a supplied logo and produces a consistent, verified kit without uploading artwork, requiring an account, or inventing missing logo variants.

> **Working name:** Proofsheet. Verify trademark and domain availability before launch.

## Status

**Phase 0 — renderer and security proof of concept: complete.**

The PoC returns **go for Phase 1** with explicit guardrails. See [docs/poc-report.md](docs/poc-report.md) for the decision memo, measured results, and limitations.

Current scope is a proof-of-concept dashboard, not the product UI:

- Sanitized SVG rendering through resvg-wasm in a Web Worker
- Browser-native rasterization comparison
- Raster metadata and EXIF orientation inspection
- Hostile-input containment tests
- PNG-in-ICO encoding and browser decode
- Deterministic ZIP creation, manifest hashing, and verification
- Cross-browser Playwright gates

## Requirements

- Node.js 22+
- pnpm 12+
- Modern Chromium, Firefox, or Safari/WebKit
- Linux CI: Playwright system dependencies, including `libjpeg-turbo8` for WebKit

## Quick start

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. The Phase 0 lab is served at `/`.

Production-preview the built app:

```bash
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

On Linux, install Playwright’s host dependencies once:

```bash
sudo pnpm exec playwright install-deps
```

The Phase 0 suite currently has:

- **34 unit tests** across metadata, alpha bounds, SVG preflight, ICO, and ZIP
- **6 E2E tests** across Chromium, Firefox, and WebKit
- **0 CSP violations** and **0 external requests** in the production-preview run

The E2E gate starts a production preview and runs the same `runAll()` PoC entry point exposed at `window.__proofsheetPoc`. It is not a mock.

## What is implemented

### Rendering

`src/core/render` and `src/workers/render.worker.ts` initialize resvg-wasm in a module worker, load bundled Instrument Sans, sanitize SVG before rendering, and return PNG/pixel data plus bounding boxes.

The lab compares resvg output with browser-native SVG rasterization at 512px. Dimensions and aspect ratios match exactly across the fixture matrix. Basic path, transform, and embedded-raster fixtures pass. The complex gradient/filter fixture and live-text fixtures are review items, not guaranteed pixel-identical exports.

### Security

`src/core/svg/preflight.ts` detects and blocks:

- `<script>` elements and inline event handlers
- External `href`, `xlink:href`, `src`, CSS `@import`, and remote `url(...)`
- `<foreignObject>`
- SVG animation elements
- Unsafe CSS
- DOCTYPE and entity declarations
- Oversized render boxes, excessive node counts, and excessive depth
- Malformed XML

Sanitization uses DOMPurify followed by a manual pass. Uploaded SVG is never injected into the live DOM. The renderer receives sanitized markup inside a worker. Event-handler attributes are detected on the raw source but redacted from the parse-only copy so Chrome does not attempt to compile hostile handlers during inspection.

Production headers are defined in `vite.config.ts` and mirrored in `public/_headers`. The CSP has no `unsafe-eval`; `wasm-unsafe-eval` is required for resvg-wasm. There are no analytics, third-party scripts, remote fonts, or network calls.

### Raster inspection

`src/core/imaging` detects PNG, JPEG, and WebP, alpha presence, APNG animation, ICC profiles, JPEG EXIF orientation, WebP VP8X animation/alpha, and source limits before decode.

### ICO and ZIP

`src/core/ico` writes 16/32/48/64px PNG-in-ICO files and validates headers, directories, offsets, and dimensions. `src/core/zip` builds deterministic archives with SHA-256 manifest entries in a worker, reads them back, verifies every hash, and rejects corruption. Unit tests also verify an archive with system `unzip -t` where available.

## Source caps

Provisional Phase 0 caps, implemented in `src/core/types.ts`:

| Limit | Value |
| --- | ---: |
| Raster file size | 25 MB |
| Raster pixels | 50,000,000 |
| SVG file size | 5 MB |
| SVG nodes | 50,000 |
| SVG nesting depth | 100 |

These are guardrails, not product copy. Revisit them after real logo samples are measured.

## Project layout

```text
src/core/        metadata, alpha, SVG preflight, ICO, ZIP, render clients
src/workers/     resvg render worker and ZIP worker
src/lab/         fixture corpus, browser-native renderer, PoC runner, dashboard
tests/unit/      Node/Vitest tests and generated fixture helpers
tests/e2e/       Playwright gates for renderer, archive, raster, and security
public/          Cloudflare Pages headers and SPA fallback
docs/            decision records and reports
```

## Deliberate v1 non-goals

- PDF generation. Guidelines will be printable HTML; users can use browser print-to-PDF.
- Backend, database, accounts, or runtime AI.
- Inventing stacked, horizontal, dark, or no-tagline variants that were not supplied.
- Claiming a flattened PNG is vector artwork.
- Guaranteed pixel identity for live text, missing fonts, or filter-heavy artwork.
- iOS Safari validation in Phase 0. Desktop WebKit is covered; iOS remains a Phase 4 target.

## Roadmap

- **Phase 1:** source intake, variant registry, palette extraction, logo/favicon kits, IndexedDB autosave.
- **Phase 2:** independent QA validator, category archives, manifest verification, failure UI.
- **Phase 3:** PWA, social, developer, and printable guidelines kits.
- **Phase 4:** accessibility, iOS Safari, visual regressions, Cloudflare Pages launch.

The living checklist is in [TODO.md](TODO.md).
