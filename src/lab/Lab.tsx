import { type ReactNode, useEffect, useMemo, useState } from "react";
import { formatBytes } from "../core/types";
import { getPocResults, runPoc } from "./run";
import type { FixtureResult, PocResults, SecurityResult, Verdict } from "./types";

type RunState = "idle" | "running" | "done" | "error";

function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case "pass":
      return "Pass";
    case "review":
      return "Review";
    case "blocked":
      return "Blocked";
    case "skip":
      return "Skipped";
    default:
      return "Error";
  }
}

function verdictClass(verdict: Verdict): string {
  switch (verdict) {
    case "pass":
      return "border-pass/30 bg-pass/8 text-pass";
    case "review":
      return "border-warn/30 bg-warn/8 text-warn";
    case "blocked":
      return "border-rule bg-ink/5 text-muted";
    case "skip":
      return "border-rule bg-ink/5 text-muted";
    default:
      return "border-error/30 bg-error/8 text-error";
  }
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${verdictClass(verdict)}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {verdictLabel(verdict)}
    </span>
  );
}

function formatMs(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1) return "<1 ms";
  if (value < 1000) return `${value.toFixed(1)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}

function Metric({
  label,
  value,
  detail,
  tone = "ink",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "ink" | "pass" | "warn" | "error";
}) {
  const toneClass =
    tone === "pass"
      ? "text-pass"
      : tone === "warn"
        ? "text-warn"
        : tone === "error"
          ? "text-error"
          : "text-ink";
  return (
    <div className="paper-panel p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={`mt-3 font-serif text-3xl leading-none ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function SectionHeading({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] text-accent">{index}</span>
        <div>
          <h2 className="font-serif text-2xl leading-none">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function FixtureTable({ fixtures }: { fixtures: FixtureResult[] }) {
  if (fixtures.length === 0) {
    return <p className="py-6 text-sm text-muted">No fixture results yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="rule-table w-full min-w-[940px] border-collapse text-left text-xs">
        <thead>
          <tr>
            <th className="py-2 pr-3">Fixture</th>
            <th className="px-3 py-2">Verdict</th>
            <th className="px-3 py-2">Vector claim</th>
            <th className="px-3 py-2">Resvg</th>
            <th className="px-3 py-2">Native</th>
            <th className="px-3 py-2">Pixel diff</th>
            <th className="px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((fixture) => (
            <tr key={fixture.id}>
              <td className="max-w-[220px] py-3 pr-3">
                <p className="font-medium text-ink">{fixture.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">{fixture.id}</p>
              </td>
              <td className="px-3 py-3">
                <VerdictBadge verdict={fixture.verdict} />
              </td>
              <td className="px-3 py-3">
                <p>
                  {fixture.portableVector
                    ? "Portable vector"
                    : fixture.vectorContainer
                      ? "Vector container"
                      : "Raster inside"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted">
                  {fixture.liveText
                    ? "Live text"
                    : fixture.portableVector
                      ? "No raster"
                      : "Restricted"}
                </p>
              </td>
              <td className="px-3 py-3 font-mono text-[10px] text-muted">
                {fixture.resvg
                  ? `${fixture.resvg.width}×${fixture.resvg.height} · ${formatMs(fixture.resvg.elapsedMs)}`
                  : "—"}
              </td>
              <td className="px-3 py-3 font-mono text-[10px] text-muted">
                {fixture.native
                  ? `${fixture.native.width}×${fixture.native.height} · ${formatMs(fixture.native.elapsedMs)}`
                  : "—"}
              </td>
              <td className="px-3 py-3">
                {fixture.diff ? (
                  <>
                    <p className="font-mono text-[11px]">{formatPercent(fixture.diff.percent)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      limit {(fixture.diff.threshold * 100).toFixed(1)}%
                    </p>
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="max-w-[340px] px-3 py-3 text-[11px] leading-relaxed text-muted">
                {fixture.error ? <p className="text-error">{fixture.error}</p> : null}
                {fixture.blockingReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {fixture.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
                {!fixture.error &&
                fixture.blockingReasons.length === 0 &&
                fixture.warnings.length === 0
                  ? "Clean."
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SecurityTable({ security }: { security: SecurityResult[] }) {
  if (security.length === 0) {
    return <p className="py-6 text-sm text-muted">No security probes yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="rule-table w-full min-w-[860px] border-collapse text-left text-xs">
        <thead>
          <tr>
            <th className="py-2 pr-3">Probe</th>
            <th className="px-3 py-2">Preflight</th>
            <th className="px-3 py-2">Sanitized</th>
            <th className="px-3 py-2">Image context</th>
            <th className="px-3 py-2">Removed / reasons</th>
          </tr>
        </thead>
        <tbody>
          {security.map((item) => {
            const ok = item.blocked && item.sanitizedClean && item.browserImageSafe && !item.error;
            return (
              <tr key={item.id}>
                <td className="max-w-[240px] py-3 pr-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">{item.id}</p>
                </td>
                <td className="px-3 py-3">
                  <VerdictBadge verdict={item.blocked ? "pass" : "error"} />
                </td>
                <td className="px-3 py-3">
                  <VerdictBadge verdict={item.sanitizedClean ? "pass" : "error"} />
                </td>
                <td className="px-3 py-3">
                  <VerdictBadge verdict={item.browserImageSafe ? "pass" : "error"} />
                </td>
                <td className="max-w-[380px] px-3 py-3 text-[11px] leading-relaxed text-muted">
                  {item.error ? <p className="text-error">{item.error}</p> : null}
                  <p>
                    {[...item.reasons, ...item.removed].join(" · ") || "No dangerous features."}
                  </p>
                  {!ok ? (
                    <p className="mt-1 text-error">Probe did not meet the security gate.</p>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right font-mono text-[11px] text-ink">{value}</span>
    </div>
  );
}

function RasterPanel({ results }: { results: PocResults | null }) {
  if (!results) return <p className="py-6 text-sm text-muted">No raster results yet.</p>;
  const raster = results.raster;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="paper-panel p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">PNG</p>
        <div className="mt-3">
          <DataRow label="Dimensions" value={`${raster.png.width}×${raster.png.height}`} />
          <DataRow
            label="Alpha channel"
            value={raster.png.hasAlpha ? "Detected" : "Not detected"}
          />
          <DataRow label="Animated" value={raster.png.animated ? "Yes" : "No"} />
          <DataRow
            label="ICC / color profile"
            value={raster.png.iccProfile ? "Detected" : "None"}
          />
          <DataRow
            label="Alpha bounds"
            value={
              raster.png.alphaBounds
                ? `${raster.png.alphaBounds.x},${raster.png.alphaBounds.y} · ${raster.png.alphaBounds.width}×${raster.png.alphaBounds.height}`
                : "Empty"
            }
          />
        </div>
      </div>
      <div className="paper-panel p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          EXIF orientation
        </p>
        <div className="mt-3">
          <DataRow label="Declared orientation" value={String(raster.exif.declaredOrientation)} />
          <DataRow
            label="Expected display"
            value={`${raster.exif.displayWidth}×${raster.exif.displayHeight}`}
          />
          <DataRow
            label="Browser decode"
            value={`${raster.exif.browserWidth}×${raster.exif.browserHeight}`}
          />
          <DataRow label="Orientation applied" value={raster.exif.swapped ? "Yes" : "No"} />
        </div>
      </div>
      <div className="paper-panel p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Other probes</p>
        <div className="mt-3">
          <DataRow
            label="APNG animation"
            value={raster.apng.animated ? "Detected" : "Not detected"}
          />
          <DataRow
            label="ICC profile chunk"
            value={raster.icc.detected ? "Detected" : "Not detected"}
          />
          <DataRow
            label="Animated WebP"
            value={raster.animatedWebp.detected ? "Detected" : "Not detected"}
          />
          <DataRow
            label="WebP source"
            value={
              raster.webp
                ? `${raster.webp.width}×${raster.webp.height} · ${raster.webp.hasAlpha ? "alpha" : "no alpha"}`
                : "Encoder unavailable"
            }
          />
          <DataRow
            label="Pixel/byte limits"
            value={`${raster.limits.oversizedRejected ? "pixels ok" : "pixels failed"} · ${raster.limits.oversizedBytesRejected ? "bytes ok" : "bytes failed"}`}
          />
        </div>
      </div>
      {raster.errors.length > 0 ? (
        <div className="border border-error/30 bg-error/5 p-4 lg:col-span-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-error">
            Raster findings
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-error">
            {raster.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function Lab() {
  const [state, setState] = useState<RunState>("idle");
  const [stage, setStage] = useState("");
  const [results, setResults] = useState<PocResults | null>(() => getPocResults());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleUnhandled(event: PromiseRejectionEvent) {
      setError(event.reason instanceof Error ? event.reason.message : String(event.reason));
    }
    window.addEventListener("unhandledrejection", handleUnhandled);
    return () => window.removeEventListener("unhandledrejection", handleUnhandled);
  }, []);

  const run = async () => {
    setState("running");
    setError(null);
    setStage("Starting");
    try {
      const next = await runPoc((message) => setStage(message));
      setResults(next);
      setState("done");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setState("error");
    }
  };

  const overall = useMemo(() => {
    if (!results)
      return {
        label: "Not run",
        tone: "text-muted",
        detail: "Start the harness to generate a decision record.",
      };
    if (results.passed && results.summary.review === 0) {
      return { label: "Pass", tone: "text-pass", detail: "All gates passed." };
    }
    if (results.passed) {
      return {
        label: "Pass with review",
        tone: "text-warn",
        detail: "No blocking failures; review items are listed.",
      };
    }
    return {
      label: "Needs attention",
      tone: "text-error",
      detail: "At least one gate is blocked or failed.",
    };
  }, [results]);

  const downloadReport = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `proofsheet-poc-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="crop-mark flex size-10 items-center justify-center border border-ink bg-surface">
              <span className="size-2.5 bg-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="font-serif text-2xl leading-none tracking-[-0.01em]">Proofsheet</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                Phase 0 / Renderer &amp; Security Lab
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="border border-rule bg-surface px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              Local only · no uploads
            </span>
            <span className="border border-rule bg-surface px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              {results
                ? `${results.summary.pass} pass · ${results.summary.review} review`
                : "Not run"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-16 pt-8">
        <section className="proof-grid border border-rule bg-surface/70 p-6 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
                Gate 0 / decision record
              </p>
              <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-[0.95] tracking-[-0.02em] md:text-6xl">
                Prove the renderer before promising the brand kit.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
                This harness checks the four things that can invalidate the product: SVG fidelity,
                font portability, archive validity, and hostile-file handling. A result is only
                useful if it says what the renderer cannot do.
              </p>
            </div>
            <div className="border-l border-rule pl-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                Overall
              </p>
              <p className={`mt-2 font-serif text-4xl leading-none ${overall.tone}`}>
                {overall.label}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">{overall.detail}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="run-poc"
                  onClick={run}
                  disabled={state === "running"}
                  className="focus-ring border border-ink bg-ink px-4 py-2.5 text-xs font-medium text-paper transition-colors hover:bg-accent hover:border-accent disabled:cursor-wait disabled:opacity-60"
                >
                  {state === "running"
                    ? "Running checks…"
                    : results
                      ? "Run again"
                      : "Run all checks"}
                </button>
                <button
                  type="button"
                  onClick={downloadReport}
                  disabled={!results}
                  className="focus-ring border border-ink bg-transparent px-4 py-2.5 text-xs font-medium text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Download JSON
                </button>
              </div>
              <p className="mt-3 min-h-5 font-mono text-[10px] text-muted" aria-live="polite">
                {state === "running"
                  ? stage
                  : results
                    ? `Completed in ${formatMs(results.durationMs)}`
                    : "Awaiting first run."}
              </p>
              {error ? <p className="mt-2 text-xs text-error">{error}</p> : null}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Metric
            label="Renderer fixtures"
            value={results ? `${results.summary.pass}/${results.fixtures.length}` : "—"}
            detail={
              results
                ? `${results.summary.review} review · ${results.summary.blocked} blocked · ${results.summary.error} error`
                : "SVG corpus not run"
            }
            tone={results?.passed ? "pass" : results ? "warn" : "ink"}
          />
          <Metric
            label="Security probes"
            value={
              results
                ? `${results.security.filter((item) => item.blocked && item.sanitizedClean && item.browserImageSafe).length}/${results.security.length}`
                : "—"
            }
            detail={
              results
                ? results.security.every((item) => item.blocked && item.sanitizedClean)
                  ? "All hostile fixtures contained"
                  : "Containment failure"
                : "No probes run"
            }
            tone={
              results
                ? results.security.every(
                    (item) => item.blocked && item.sanitizedClean && item.browserImageSafe,
                  )
                  ? "pass"
                  : "error"
                : "ink"
            }
          />
          <Metric
            label="Favicon ICO"
            value={results ? (results.ico.valid ? "Valid" : "Invalid") : "—"}
            detail={
              results
                ? `${results.ico.entries.length} sizes · ${formatBytes(results.ico.bytes)} · browser ${results.ico.browserDecoded ? "decoded" : "no decode"}`
                : "Not generated"
            }
            tone={results ? (results.ico.valid ? "pass" : "error") : "ink"}
          />
          <Metric
            label="Complete ZIP"
            value={results ? (results.zip.verified ? "Verified" : "Failed") : "—"}
            detail={
              results
                ? `${results.zip.fileCount} entries · corrupt archive ${results.zip.corruptRejected ? "rejected" : "accepted"}`
                : "Not built"
            }
            tone={
              results
                ? results.zip.verified && results.zip.corruptRejected
                  ? "pass"
                  : "error"
                : "ink"
            }
          />
          <Metric
            label="Cold start"
            value={results ? formatMs(results.performance.coldStartMs) : "—"}
            detail={
              results
                ? results.performance.fontLoaded
                  ? "resvg-wasm + bundled font"
                  : "font unavailable"
                : "Worker not initialized"
            }
            tone={
              results
                ? results.performance.coldStartMs <= results.performance.thresholds.coldStartMs
                  ? "pass"
                  : "warn"
                : "ink"
            }
          />
          <Metric
            label="32 renders"
            value={results ? formatMs(results.performance.batch32Ms) : "—"}
            detail={
              results
                ? `${results.performance.assetsPerSecond.toFixed(1)} assets/s at 256px`
                : "No benchmark"
            }
            tone={
              results
                ? results.performance.batch32Ms <= results.performance.thresholds.batch32Ms
                  ? "pass"
                  : "warn"
                : "ink"
            }
          />
        </section>

        <section className="mt-10">
          <SectionHeading
            index="01"
            title="SVG fixture matrix"
            description="Resvg output is compared with browser-native rasterization at 512px. A difference above the fixture threshold becomes a review item, not a silent pass."
          />
          <div className="mt-4 paper-panel p-4">
            <FixtureTable fixtures={results?.fixtures ?? []} />
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            index="02"
            title="Hostile input containment"
            description="Every hostile fixture must be refused by preflight, stripped by sanitization, and remain inert when the browser renders it as an image."
          />
          <div className="mt-4 paper-panel p-4">
            <SecurityTable security={results?.security ?? []} />
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            index="03"
            title="Raster inspection"
            description="Metadata is read before decode. EXIF orientation, alpha bounds, animation flags, color-profile presence, and input limits must be explicit."
          />
          <div className="mt-4">
            <RasterPanel results={results} />
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-3">
          <div className="paper-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              ICO validation
            </p>
            <p className="mt-3 font-serif text-3xl">
              {results ? (results.ico.valid ? "Valid PNG-in-ICO" : "Invalid") : "—"}
            </p>
            <div className="mt-3">
              <DataRow
                label="Entries"
                value={
                  results ? results.ico.entries.map((entry) => `${entry.width}px`).join(" · ") : "—"
                }
              />
              <DataRow label="File size" value={results ? formatBytes(results.ico.bytes) : "—"} />
              <DataRow
                label="Browser decode"
                value={
                  results
                    ? results.ico.browserDecoded
                      ? `${results.ico.browserWidth}×${results.ico.browserHeight}`
                      : "Unsupported"
                    : "—"
                }
              />
              <DataRow
                label="Encode + validate"
                value={results ? formatMs(results.ico.elapsedMs) : "—"}
              />
            </div>
            {results?.ico.errors.length ? (
              <p className="mt-3 text-xs leading-relaxed text-error">
                {results.ico.errors.join(" ")}
              </p>
            ) : null}
          </div>

          <div className="paper-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              ZIP round-trip
            </p>
            <p className="mt-3 font-serif text-3xl">
              {results ? (results.zip.verified ? "Verified archive" : "Unverified") : "—"}
            </p>
            <div className="mt-3">
              <DataRow label="Built" value={results?.zip.built ? "Yes" : "No"} />
              <DataRow
                label="Manifest hashes"
                value={results?.zip.verified ? "Matched" : "Not verified"}
              />
              <DataRow
                label="Corrupt archive"
                value={
                  results ? (results.zip.corruptRejected ? "Rejected" : "Accepted — bug") : "—"
                }
              />
              <DataRow
                label="Entries"
                value={
                  results
                    ? `${results.zip.fileCount} (${formatBytes(results.zip.totalBytes)})`
                    : "—"
                }
              />
            </div>
            {results?.zip.errors.length ? (
              <p className="mt-3 text-xs leading-relaxed text-error">
                {results.zip.errors.slice(0, 3).join(" ")}
              </p>
            ) : null}
          </div>

          <div className="paper-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              CSP + isolation
            </p>
            <p className="mt-3 font-serif text-3xl">
              {results
                ? results.csp.violations.length === 0 && results.csp.externalResources.length === 0
                  ? "No egress"
                  : "Check failed"
                : "—"}
            </p>
            <div className="mt-3">
              <DataRow
                label="CSP violations"
                value={results ? String(results.csp.violations.length) : "—"}
              />
              <DataRow
                label="External resources"
                value={results ? String(results.csp.externalResources.length) : "—"}
              />
              <DataRow label="Script canary" value={results?.csp.canary ?? "—"} />
              <DataRow label="Source rendering" value="Worker · isolated · no inline SVG" />
            </div>
            {results?.csp.violations.length ? (
              <p className="mt-3 break-words text-xs leading-relaxed text-error">
                {results.csp.violations.join(" ")}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            index="04"
            title="Performance + limits"
            description="Timings are measured after wasm initialization. Thresholds are deliberately generous; the goal is to expose a renderer that is orders of magnitude too slow, not to micro-benchmark."
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="paper-panel p-4">
              <DataRow
                label="Cold start"
                value={results ? formatMs(results.performance.coldStartMs) : "—"}
              />
              <DataRow
                label="Threshold"
                value={results ? formatMs(results.performance.thresholds.coldStartMs) : "—"}
              />
              <DataRow
                label="Font buffer"
                value={results ? (results.performance.fontLoaded ? "Loaded" : "Missing") : "—"}
              />
            </div>
            <div className="paper-panel p-4">
              <DataRow
                label="512px render"
                value={results ? formatMs(results.performance.one512Ms) : "—"}
              />
              <DataRow
                label="1024px render"
                value={results ? formatMs(results.performance.one1024Ms) : "—"}
              />
              <DataRow
                label="1024px threshold"
                value={results ? formatMs(results.performance.thresholds.one1024Ms) : "—"}
              />
            </div>
            <div className="paper-panel p-4">
              <DataRow
                label="32 × 256px"
                value={results ? formatMs(results.performance.batch32Ms) : "—"}
              />
              <DataRow
                label="Assets / second"
                value={results ? results.performance.assetsPerSecond.toFixed(2) : "—"}
              />
              <DataRow
                label="Batch threshold"
                value={results ? formatMs(results.performance.thresholds.batch32Ms) : "—"}
              />
            </div>
            <div className="paper-panel p-4">
              <DataRow label="Max source bytes" value="25 MB" />
              <DataRow label="Max raster pixels" value="50 MP" />
              <DataRow label="Max SVG" value="5 MB / 50k nodes" />
            </div>
          </div>
        </section>

        <section className="mt-10">
          <SectionHeading
            index="05"
            title="Decision record"
            description="The raw result is the artifact that feeds the go/no-go memo. It includes the browser user agent, every fixture verdict, and all warnings."
          />
          <details className="mt-4 paper-panel p-4">
            <summary className="focus-ring cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Raw JSON result
            </summary>
            <pre
              data-testid="poc-json"
              className="mt-4 max-h-[520px] overflow-auto border border-rule bg-paper p-4 font-mono text-[10px] leading-relaxed text-ink"
            >
              {results ? JSON.stringify(results, null, 2) : "No result yet."}
            </pre>
          </details>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
          <span>Proofsheet · Phase 0 · renderer and security gate</span>
          <span>
            Source files never leave this browser · no analytics · no third-party requests
          </span>
        </div>
      </footer>
    </div>
  );
}
