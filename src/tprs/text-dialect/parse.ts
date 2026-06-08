// Parser for the Twisted Pin text dialect → a small AST. ONE parser feeds every
// emitter (React for the website, plain-text + HTML-string for the backend's
// emails/receipts/Stripe), so tokenization can't drift between channels — that's
// the whole point of factoring this out of the React component.
//
// The dialect (authored in TPRS product fields — name / short / long / subtitle):
//   [text](url)                    → link (http/https/mailto/tel/site-relative only)
//   <u>…</u>                       → underline
//   <font color="brand">…</font>   → brand color (allowlist; else plain)
//   **bold**                       → bold
//   *italic*                       → italic
//   <br> / newlines                → line break (collapsed to a space when inline)
// Tokens nest. Earliest match in the string wins (ties → the rule order below).
// Anything else is literal, inert text.
//
// Part of the canonical, framework-agnostic dialect core — see ./index.ts.

import { resolveBrandColor } from "./colors";

export type DialectNode =
  | { type: "text"; value: string }
  | { type: "br" }
  | { type: "bold"; children: DialectNode[] }
  | { type: "italic"; children: DialectNode[] }
  | { type: "underline"; children: DialectNode[] }
  | { type: "color"; color: string; children: DialectNode[] }
  | { type: "link"; href: string; children: DialectNode[] };

/** A literal <br> / <br/> / <br /> (with any surrounding whitespace). */
const BR = /\s*<br\s*\/?>\s*/gi;

/** Hrefs we'll honor — everything else degrades to plain text (defense for the
 *  HTML emitter, applied in the parser so every emitter behaves identically). */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i;

interface Rule {
  re: RegExp;
  make: (
    m: RegExpExecArray,
    parse: (t: string) => DialectNode[],
  ) => DialectNode | DialectNode[];
}

// Checked in order; the EARLIEST match in the string wins (ties → this order).
const RULES: Rule[] = [
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    make: (m, parse) => {
      const children = parse(m[1]);
      // Unsafe/unknown scheme → drop the link, keep the visible text.
      return SAFE_HREF.test(m[2])
        ? { type: "link", href: m[2], children }
        : children;
    },
  },
  {
    re: /<u>([\s\S]*?)<\/u>/i,
    make: (m, parse) => ({ type: "underline", children: parse(m[1]) }),
  },
  {
    re: /<font\s+color=["']?([a-zA-Z]+)["']?\s*>([\s\S]*?)<\/font>/i,
    make: (m, parse) => {
      const color = resolveBrandColor(m[1]);
      const children = parse(m[2]);
      // Off-allowlist color → render the text plain (no wrapper).
      return color ? { type: "color", color, children } : children;
    },
  },
  {
    re: /\*\*([^*]+)\*\*/,
    make: (m, parse) => ({ type: "bold", children: parse(m[1]) }),
  },
  {
    re: /\*([^*]+)\*/,
    make: (m, parse) => ({ type: "italic", children: parse(m[1]) }),
  },
];

function parseInline(text: string): DialectNode[] {
  const out: DialectNode[] = [];
  let rest = text;
  while (rest.length > 0) {
    let bestIdx = -1;
    let bestRule: Rule | null = null;
    let bestMatch: RegExpExecArray | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (bestIdx === -1 || m.index < bestIdx)) {
        bestIdx = m.index;
        bestRule = rule;
        bestMatch = m;
      }
    }
    if (!bestRule || !bestMatch) {
      out.push({ type: "text", value: rest });
      break;
    }
    if (bestIdx > 0) out.push({ type: "text", value: rest.slice(0, bestIdx) });
    const made = bestRule.make(bestMatch, parseInline);
    if (Array.isArray(made)) out.push(...made);
    else out.push(made);
    rest = rest.slice(bestIdx + bestMatch[0].length);
  }
  return out;
}

export interface ParseOptions {
  /** Collapse <br>/newlines to a single space (tight one-line spots) rather than
   *  emitting line breaks. */
  inline?: boolean;
}

/** Parse a dialect string into the shared AST. */
export function parseDialect(
  text: string,
  { inline = false }: ParseOptions = {},
): DialectNode[] {
  if (inline) {
    const flat = text.replace(BR, " ").replace(/\s*\r?\n\s*/g, " ");
    return parseInline(flat);
  }
  const lines = text.replace(BR, "\n").split(/\r?\n/);
  const out: DialectNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: "br" });
    out.push(...parseInline(line));
  });
  return out;
}
