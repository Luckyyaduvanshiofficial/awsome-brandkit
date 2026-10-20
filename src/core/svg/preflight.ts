import createDOMPurify from "dompurify";
import { DEFAULT_LIMITS, type ImageLimits } from "../types";

export interface SvgFeatures {
  scripts: boolean;
  eventHandlers: boolean;
  externalRefs: boolean;
  foreignObject: boolean;
  animation: boolean;
  embeddedRaster: boolean;
  liveText: boolean;
  embeddedCss: boolean;
  unsafeCss: boolean;
  entities: boolean;
  filters: boolean;
  gradients: boolean;
  masks: boolean;
  clipPaths: boolean;
  patterns: boolean;
}

export interface SvgReport {
  parseOk: boolean;
  rootIsSvg: boolean;
  width?: number;
  height?: number;
  viewBox?: { x: number; y: number; width: number; height: number };
  nodeCount: number;
  maxDepth: number;
  features: SvgFeatures;
  liveTextFonts: string[];
  blockingReasons: string[];
  warnings: string[];
  vectorContainer: boolean;
  portableVector: boolean;
}

const EMPTY_FEATURES: SvgFeatures = {
  scripts: false,
  eventHandlers: false,
  externalRefs: false,
  foreignObject: false,
  animation: false,
  embeddedRaster: false,
  liveText: false,
  embeddedCss: false,
  unsafeCss: false,
  entities: false,
  filters: false,
  gradients: false,
  masks: false,
  clipPaths: false,
  patterns: false,
};

function parseLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)(?:px)?$/i.exec(trimmed);
  if (!match) return undefined;
  const number = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function parseViewBox(value: string | null): SvgReport["viewBox"] {
  if (!value) return undefined;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));
  const [x, y, width, height] = parts;
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

function isExternalHref(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(trimmed)) return false;
  return true;
}

const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Chrome attempts to compile inline event handlers when it parses SVG, even
 * when the document is detached and inert. That produces CSP reports during
 * inspection. We detect the attributes on the raw source and strip them from
 * a parse-only copy; the unsafe source is never handed to a parser.
 */
function redactEventHandlersForParsing(source: string): { source: string; found: boolean } {
  let found = false;
  let output = "";
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open === -1) {
      output += source.slice(index);
      break;
    }
    output += source.slice(index, open);

    const marker = source[open + 1] ?? "";
    if (marker === "!" || marker === "?") {
      const close = source.indexOf(">", open + 1);
      if (close === -1) {
        output += source.slice(open);
        break;
      }
      output += source.slice(open, close + 1);
      index = close + 1;
      continue;
    }

    let cursor = open + 1;
    let quote = "";
    while (cursor < source.length) {
      const character = source.charAt(cursor);
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
      cursor += 1;
    }

    const tag = source.slice(open, cursor + 1);
    output += tag.replace(EVENT_HANDLER_ATTRIBUTE, () => {
      found = true;
      return "";
    });
    index = cursor + 1;
  }

  return { source: output, found };
}

function hasUnsafeCss(value: string): boolean {
  return (
    /@import/i.test(value) ||
    /expression\s*\(/i.test(value) ||
    /javascript\s*:/i.test(value) ||
    /url\s*\(\s*['"]?(?:https?:|\/\/|javascript:|data:text\/html)/i.test(value)
  );
}

function collectFonts(value: string, fonts: Set<string>): void {
  for (const part of value.split(",")) {
    const cleaned = part.trim().replace(/^['"]|['"]$/g, "");
    if (cleaned) fonts.add(cleaned);
  }
}

export function analyzeSvg(source: string, limits: ImageLimits = DEFAULT_LIMITS): SvgReport {
  const features: SvgFeatures = { ...EMPTY_FEATURES };
  const fonts = new Set<string>();
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const trimmed = source.trim();

  if (!trimmed) {
    return {
      parseOk: false,
      rootIsSvg: false,
      nodeCount: 0,
      maxDepth: 0,
      features,
      liveTextFonts: [],
      blockingReasons: ["SVG is empty."],
      warnings,
      vectorContainer: false,
      portableVector: false,
    };
  }

  if (source.length > limits.maxSvgBytes) {
    blockingReasons.push("SVG exceeds the byte limit.");
  }

  if (/<!DOCTYPE/i.test(source) || /<!ENTITY/i.test(source)) {
    features.entities = true;
    blockingReasons.push("DOCTYPE or entity declarations are not accepted.");
    return {
      parseOk: false,
      rootIsSvg: false,
      nodeCount: 0,
      maxDepth: 0,
      features,
      liveTextFonts: [],
      blockingReasons,
      warnings,
      vectorContainer: false,
      portableVector: false,
    };
  }

  const parseSource = redactEventHandlersForParsing(source);
  features.eventHandlers = parseSource.found;

  let document: Document;
  try {
    document = new DOMParser().parseFromString(parseSource.source, "image/svg+xml");
  } catch {
    blockingReasons.push("SVG could not be parsed.");
    return {
      parseOk: false,
      rootIsSvg: false,
      nodeCount: 0,
      maxDepth: 0,
      features,
      liveTextFonts: [],
      blockingReasons,
      warnings,
      vectorContainer: false,
      portableVector: false,
    };
  }

  const parserErrors = document.querySelectorAll("parsererror");
  if (parserErrors.length > 0) {
    blockingReasons.push("SVG is not well-formed XML.");
  }
  const root = document.documentElement;
  const rootIsSvg = root?.localName?.toLowerCase() === "svg";
  if (!rootIsSvg) blockingReasons.push("Root element is not <svg>.");

  let nodeCount = 0;
  let maxDepth = 0;

  const visit = (element: Element, depth: number): void => {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    const tag = element.localName.toLowerCase();

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;

      if (name.startsWith("on")) {
        features.eventHandlers = true;
      }
      if (name === "href" || name === "xlink:href" || name === "src") {
        if (isExternalHref(value)) features.externalRefs = true;
      }
      if (name === "style" && hasUnsafeCss(value)) {
        features.unsafeCss = true;
      }
      if (name === "fill" || name === "stroke") {
        if (/url\s*\(\s*['"]?(?!\s*#)/i.test(value)) features.externalRefs = true;
      }
      if (name === "font-family") collectFonts(value, fonts);
      if (name === "style") {
        const fontMatch = /font-family\s*:\s*([^;]+)/i.exec(value);
        if (fontMatch?.[1]) collectFonts(fontMatch[1], fonts);
      }
    }

    if (tag === "script") features.scripts = true;
    if (tag === "foreignobject") features.foreignObject = true;
    if (tag === "image") features.embeddedRaster = true;
    if (
      tag === "animate" ||
      tag === "animatetransform" ||
      tag === "animatemotion" ||
      tag === "set"
    ) {
      features.animation = true;
    }
    if (tag === "style") {
      features.embeddedCss = true;
      if (hasUnsafeCss(element.textContent ?? "")) features.unsafeCss = true;
    }
    if (tag === "filter") features.filters = true;
    if (tag === "lineargradient" || tag === "radialgradient" || tag === "meshgradient") {
      features.gradients = true;
    }
    if (tag === "mask") features.masks = true;
    if (tag === "clippath") features.clipPaths = true;
    if (tag === "pattern") features.patterns = true;

    if (tag === "text" || tag === "tspan" || tag === "textpath") {
      if ((element.textContent ?? "").trim()) {
        features.liveText = true;
        const family = element.getAttribute("font-family");
        if (family) collectFonts(family, fonts);
      }
    }

    for (const child of Array.from(element.children)) {
      visit(child, depth + 1);
    }
  };

  if (root) visit(root, 0);

  if (nodeCount > limits.maxSvgNodes) {
    blockingReasons.push(
      `SVG has ${nodeCount.toLocaleString()} nodes; limit is ${limits.maxSvgNodes.toLocaleString()}.`,
    );
  }
  if (maxDepth > limits.maxSvgDepth) {
    blockingReasons.push(`SVG nesting depth ${maxDepth} exceeds ${limits.maxSvgDepth}.`);
  }

  const width = parseLength(root?.getAttribute("width") ?? null);
  const height = parseLength(root?.getAttribute("height") ?? null);
  const viewBox = parseViewBox(root?.getAttribute("viewBox") ?? null);
  const effectiveWidth = width ?? viewBox?.width;
  const effectiveHeight = height ?? viewBox?.height;
  if (!effectiveWidth || !effectiveHeight) {
    warnings.push("SVG has no usable intrinsic width/height; a default render box will be used.");
  }
  if (effectiveWidth && effectiveHeight) {
    const pixels = effectiveWidth * effectiveHeight;
    if (pixels > limits.maxPixels) {
      blockingReasons.push(
        `SVG render box is ${Math.round(effectiveWidth)}×${Math.round(effectiveHeight)}; it exceeds the pixel limit.`,
      );
    }
  }

  if (features.scripts) blockingReasons.push("SVG contains a <script> element.");
  if (features.eventHandlers) blockingReasons.push("SVG contains event-handler attributes.");
  if (features.externalRefs) blockingReasons.push("SVG references an external resource.");
  if (features.foreignObject) blockingReasons.push("SVG contains <foreignObject> HTML content.");
  if (features.animation) blockingReasons.push("SVG contains animation elements.");
  if (features.unsafeCss) blockingReasons.push("SVG contains unsafe CSS.");
  if (features.embeddedRaster) {
    warnings.push("SVG contains an embedded raster image; it is not portable vector artwork.");
  }
  if (features.liveText) {
    warnings.push(
      "SVG contains live text. Unless the exact fonts are embedded or the text is outlined, rendering is not guaranteed.",
    );
  }
  if (features.embeddedCss) {
    warnings.push(
      "SVG contains a <style> block; CSS can be document-wide and is reviewed for isolation.",
    );
  }
  if (features.filters) {
    warnings.push(
      "SVG uses filters; output can differ from browser-native rendering and requires visual review.",
    );
  }
  if (parserErrors.length > 0 && rootIsSvg) {
    warnings.push("SVG parsed with warnings.");
  }

  const vectorContainer = rootIsSvg && !features.embeddedRaster && !features.foreignObject;
  const portableVector =
    parseOk(rootIsSvg, blockingReasons) &&
    vectorContainer &&
    !features.liveText &&
    !features.scripts &&
    !features.eventHandlers &&
    !features.externalRefs &&
    !features.animation &&
    !features.unsafeCss;

  return {
    parseOk: rootIsSvg && parserErrors.length === 0,
    rootIsSvg,
    width: effectiveWidth,
    height: effectiveHeight,
    viewBox,
    nodeCount,
    maxDepth,
    features,
    liveTextFonts: Array.from(fonts),
    blockingReasons,
    warnings,
    vectorContainer,
    portableVector,
  };
}

function parseOk(rootIsSvg: boolean, blockingReasons: string[]): boolean {
  return rootIsSvg && blockingReasons.length === 0;
}

export interface SanitizedSvg {
  sanitized: string;
  report: SvgReport;
  removed: string[];
}

export function sanitizeSvg(source: string): SanitizedSvg {
  const original = analyzeSvg(source);
  const parseSource = redactEventHandlersForParsing(source);
  const purifier = createDOMPurify(window);
  const removed = new Set<string>();
  const purified = purifier.sanitize(parseSource.source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "animate", "animateTransform", "animateMotion", "set"],
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  }) as string;

  let document: Document;
  try {
    document = new DOMParser().parseFromString(purified, "image/svg+xml");
  } catch {
    return {
      sanitized: "",
      report: analyzeSvg(source),
      removed: ["SVG could not be serialized after sanitization."],
    };
  }

  const all = Array.from(document.querySelectorAll("*"));
  for (const element of all) {
    const tag = element.localName.toLowerCase();
    if (
      tag === "script" ||
      tag === "foreignobject" ||
      tag === "animate" ||
      tag === "animatetransform" ||
      tag === "animatemotion" ||
      tag === "set"
    ) {
      removed.add(`element:${tag}`);
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        removed.add(`attribute:${name}`);
        element.removeAttribute(attribute.name);
      } else if (name === "href" || name === "xlink:href" || name === "src") {
        if (isExternalHref(attribute.value)) {
          removed.add(`external:${tag}`);
          element.removeAttribute(attribute.name);
        }
      } else if (name === "style" && hasUnsafeCss(attribute.value)) {
        removed.add(`style:${tag}`);
        element.removeAttribute(attribute.name);
      }
    }

    if (tag === "style" && hasUnsafeCss(element.textContent ?? "")) {
      removed.add("unsafe-style-block");
      element.remove();
    }
  }

  const sanitized = new XMLSerializer().serializeToString(document);
  const report = analyzeSvg(sanitized);
  if (original.features.scripts && !report.features.scripts) removed.add("element:script");
  if (original.features.eventHandlers && !report.features.eventHandlers) {
    removed.add("attribute:event-handler");
  }
  if (original.features.externalRefs && !report.features.externalRefs) {
    removed.add("reference:external");
  }
  if (original.features.foreignObject && !report.features.foreignObject) {
    removed.add("element:foreignObject");
  }
  if (original.features.animation && !report.features.animation) removed.add("element:animation");
  if (original.features.unsafeCss && !report.features.unsafeCss) removed.add("style:unsafe");
  return { sanitized, report, removed: Array.from(removed) };
}
