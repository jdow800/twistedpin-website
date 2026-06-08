// Plain-text emitter for the Twisted Pin text dialect. Strips ALL markup down to
// readable text — the projection every NON-HTML sink must use (Stripe line-item
// names, plain-text emails/SMS, receipts, admin tables, reports). Links collapse
// to their visible text (the URL is dropped — it isn't clickable in plain text).
//
// Part of the canonical, framework-agnostic dialect core — see ./index.ts.

import { parseDialect, type DialectNode } from "./parse";

function walk(nodes: DialectNode[], brAs: string): string {
  let s = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        s += n.value;
        break;
      case "br":
        s += brAs;
        break;
      default:
        // bold / italic / underline / color / link — keep the visible text only.
        s += walk(n.children, brAs);
    }
  }
  return s;
}

export interface ToPlainTextOptions {
  /** true (default): one line, breaks → spaces — right for names / line items.
   *  false: preserve breaks as "\n" — for multi-paragraph copy (long desc). */
  inline?: boolean;
}

/** Render a dialect string as clean plain text. */
export function toPlainText(
  text: string,
  { inline = true }: ToPlainTextOptions = {},
): string {
  const nodes = parseDialect(text, { inline });
  return walk(nodes, inline ? " " : "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}
