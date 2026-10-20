export type FixtureCategory = "renderer" | "font" | "raster" | "security";

export interface SvgFixture {
  id: string;
  name: string;
  category: FixtureCategory;
  description: string;
  svg: string;
  expectedBlocked?: boolean;
  fontSensitive?: boolean;
  diffThreshold?: number;
  expectedVectorContainer?: boolean;
}

const embeddedPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJklEQVR4AYXBQQEAIBCAMKSQNez/M43XQLZ1z358SJAgQYIECRIGZOwCX1zlU48AAAAASUVORK5CYII=";

export const SVG_FIXTURES: SvgFixture[] = [
  {
    id: "basic-asymmetric",
    name: "Basic asymmetric mark",
    category: "renderer",
    description: "Transparent rectangular mark with a square, triangle, and offset circle.",
    diffThreshold: 0.015,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
  <rect x="14" y="20" width="70" height="80" rx="8" fill="#d9482f"/>
  <path d="M100 20 L180 100 L100 100 Z" fill="#181613"/>
  <circle cx="168" cy="32" r="12" fill="#f5f2ea" stroke="#181613" stroke-width="4"/>
</svg>`,
  },
  {
    id: "horizontal-lockup",
    name: "Horizontal lockup",
    category: "renderer",
    description: "Asymmetric horizontal arrangement, the common favicon failure case.",
    diffThreshold: 0.015,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <rect x="8" y="14" width="52" height="52" rx="6" fill="#d9482f"/>
  <path d="M24 30h20v8H32v14h-8z" fill="#f5f2ea"/>
  <rect x="78" y="24" width="64" height="14" fill="#181613"/>
  <rect x="78" y="48" width="42" height="8" fill="#68625a"/>
  <circle cx="174" cy="40" r="22" fill="none" stroke="#181613" stroke-width="6"/>
  <path d="M218 54 L252 26 L286 54" fill="none" stroke="#d9482f" stroke-width="7" stroke-linecap="square"/>
  <rect x="294" y="30" width="14" height="20" fill="#181613"/>
</svg>`,
  },
  {
    id: "monochrome",
    name: "Monochrome paths",
    category: "renderer",
    description: "Single-color artwork with no fills other than black.",
    diffThreshold: 0.01,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <path d="M28 26h48l-16 30h40L60 136H28l20-44H24z" fill="#000"/>
  <circle cx="118" cy="118" r="10" fill="#000"/>
</svg>`,
  },
  {
    id: "complex-vector",
    name: "Complex vector features",
    category: "renderer",
    description:
      "Gradients, pattern, clip path, mask, and blur. Support must be explicit, not assumed.",
    diffThreshold: 0.07,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d9482f"/>
      <stop offset="1" stop-color="#181613"/>
    </linearGradient>
    <pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="6" cy="6" r="2" fill="#f5f2ea" opacity=".35"/>
    </pattern>
    <clipPath id="c"><circle cx="100" cy="100" r="70"/></clipPath>
    <filter id="blur"><feGaussianBlur stdDeviation="2"/></filter>
    <mask id="m">
      <rect width="320" height="200" fill="#fff"/>
      <circle cx="235" cy="90" r="38" fill="#000"/>
    </mask>
  </defs>
  <rect width="320" height="200" fill="#f5f2ea"/>
  <g clip-path="url(#c)">
    <rect x="20" y="20" width="160" height="160" fill="url(#g)"/>
    <rect x="20" y="20" width="160" height="160" fill="url(#p)"/>
  </g>
  <path d="M190 60 L280 150 L190 150 Z" fill="#181613" mask="url(#m)" filter="url(#blur)"/>
</svg>`,
  },
  {
    id: "transformed-group",
    name: "Intentional transform",
    category: "renderer",
    description:
      "A source artwork that already contains rotation and scale. The pipeline must preserve it.",
    diffThreshold: 0.02,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="160" viewBox="0 0 220 160">
  <g transform="translate(110 80) rotate(-12) scale(1.15 0.9) translate(-110 -80)">
    <rect x="40" y="46" width="70" height="68" fill="#d9482f"/>
    <path d="M116 48 L180 114 L116 114 Z" fill="#181613"/>
    <circle cx="62" cy="42" r="10" fill="#f5f2ea" stroke="#181613" stroke-width="4"/>
  </g>
</svg>`,
  },
  {
    id: "live-text",
    name: "Live text with bundled font",
    category: "font",
    description: "Text references Instrument Sans, which is bundled for resvg and the browser.",
    fontSensitive: true,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="96" viewBox="0 0 360 96">
  <rect width="360" height="96" fill="#f5f2ea"/>
  <text x="20" y="64" font-family="Instrument Sans Variable" font-size="44" font-weight="600" fill="#181613">Proofsheet</text>
  <circle cx="330" cy="48" r="8" fill="#d9482f"/>
</svg>`,
  },
  {
    id: "missing-font",
    name: "Live text with missing font",
    category: "font",
    description:
      "Text asks for a font that is not bundled. Silent substitution would be a fidelity failure.",
    fontSensitive: true,
    expectedVectorContainer: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="96" viewBox="0 0 360 96">
  <rect width="360" height="96" fill="#f5f2ea"/>
  <text x="20" y="64" font-family="Definitely Not Installed" font-size="44" font-weight="600" fill="#181613">Proofsheet</text>
</svg>`,
  },
  {
    id: "embedded-raster",
    name: "Embedded raster image",
    category: "raster",
    description:
      "An SVG container with a PNG image. It must never be labeled genuine vector artwork.",
    diffThreshold: 0.02,
    expectedVectorContainer: false,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140" viewBox="0 0 200 140">
  <rect width="200" height="140" fill="#f5f2ea"/>
  <image x="18" y="18" width="104" height="104" href="data:image/png;base64,${embeddedPng}"/>
  <circle cx="158" cy="70" r="32" fill="none" stroke="#181613" stroke-width="6"/>
</svg>`,
  },
  {
    id: "script-injection",
    name: "Script injection",
    category: "security",
    description: "A script element and an inline event handler. Neither may execute.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <script>window.__proofsheetCanary = "pwned";</script>
  <rect width="160" height="160" fill="#f5f2ea"/>
  <circle cx="80" cy="80" r="54" fill="#d9482f" onload="window.__proofsheetCanary = 'pwned-onload'"/>
</svg>`,
  },
  {
    id: "external-image",
    name: "External image reference",
    category: "security",
    description: "Remote image dependency. It must be blocked before any network request.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" fill="#f5f2ea"/>
  <image href="https://example.invalid/logo.png" x="20" y="20" width="120" height="120"/>
</svg>`,
  },
  {
    id: "external-use",
    name: "External use reference",
    category: "security",
    description: "A remote SVG sprite reference hidden behind <use>.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <use href="https://example.invalid/sprite.svg#mark" x="10" y="10" width="140" height="140"/>
</svg>`,
  },
  {
    id: "foreign-object",
    name: "Foreign object HTML",
    category: "security",
    description: "HTML embedded inside SVG. This is not static portable vector artwork.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <foreignObject x="10" y="10" width="140" height="140">
    <div xmlns="http://www.w3.org/1999/xhtml" style="background:#d9482f;width:100%;height:100%">HTML</div>
  </foreignObject>
</svg>`,
  },
  {
    id: "animation",
    name: "SVG animation",
    category: "security",
    description: "An animated circle. A static brand asset must not silently pick a frame.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <circle cx="30" cy="80" r="24" fill="#d9482f">
    <animate attributeName="cx" values="30;130;30" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`,
  },
  {
    id: "css-import",
    name: "External CSS import",
    category: "security",
    description: "A style block that tries to load remote CSS.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <style>@import url("https://example.invalid/evil.css"); circle { fill: red; }</style>
  <circle cx="80" cy="80" r="60" fill="#d9482f"/>
</svg>`,
  },
  {
    id: "entity-expansion",
    name: "Entity declaration",
    category: "security",
    description: "DOCTYPE and an external entity. Parsing must stop before expansion.",
    expectedBlocked: true,
    svg: `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "https://example.invalid/xxe">]>
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <text x="10" y="80">&xxe;</text>
</svg>`,
  },
  {
    id: "huge-dimensions",
    name: "Huge render box",
    category: "security",
    description: "A 100,000 × 100,000 SVG that must be rejected before allocation.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000" viewBox="0 0 100000 100000">
  <rect width="100000" height="100000" fill="#d9482f"/>
</svg>`,
  },
  {
    id: "broken-xml",
    name: "Malformed XML",
    category: "security",
    description: "Unclosed elements should fail preflight, not crash the worker.",
    expectedBlocked: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><path d="M10 10 L150 150" fill="#d9482f"`,
  },
];
