# Working agreement

## Git workflow

- Make small, single-purpose commits as work progresses. Do not batch unrelated changes.
- Keep the local history revertible: each commit should describe one coherent change.
- Run the relevant checks before committing:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e` for renderer, security, or browser-facing changes
- Push completed task work to the GitHub remote. Do not leave finished tasks only on the local machine.
- Keep generated output such as `dist/`, Playwright reports, and test results out of commits.

## Project boundaries

- Static, local-first app: no backend, database, accounts, runtime AI, or third-party requests.
- Preserve supplied artwork and proportions. Never invent logo variants or present a flattened raster as vector artwork.
- Only sanitized SVG may reach the renderer. Uploaded SVG must never be injected into the live DOM.
- Live text, missing fonts, and filter-heavy artwork are review-only, not guaranteed pixel-identical exports.
