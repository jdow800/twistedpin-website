// HTML-string emitter for the Twisted Pin text dialect — for HTML emails /
// receipt pages (the backend's Eta templates). Converts the dialect to real,
// email-safe HTML: brand colors → inline styles (email clients can't read CSS
// classes or brand-name colors), **bold** → <strong>, [t](u) → <a>, <br> kept.
//
// SECURITY: this RETURNS A STRING for `dangerouslySetInnerHTML` / raw template
// interpolation, so every text node + attribute is HTML-escaped here. The React
// emitter doesn't need this (it builds elements); the string emitter does.
//
// Part of the canonical, framework-agnostic dialect core — see ./index.ts.

import { parseDialect, type DialectNode } from "./parse";

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function walk(nodes: DialectNode[]): string {
  let html = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        html += escapeText(n.value);
        break;
      case "br":
        html += "<br>";
        break;
      case "bold":
        html += `<strong>${walk(n.children)}</strong>`;
        break;
      case "italic":
        html += `<em>${walk(n.children)}</em>`;
        break;
      case "underline":
        html += `<u>${walk(n.children)}</u>`;
        break;
      case "color":
        html += `<span style="color:${n.color}">${walk(n.children)}</span>`;
        break;
      case "link":
        html +=
          `<a href="${escapeAttr(n.href)}" target="_blank" rel="noopener noreferrer">` +
          `${walk(n.children)}</a>`;
        break;
    }
  }
  return html;
}

export interface ToHtmlOptions {
  /** true: collapse breaks to spaces (tight one-line spots). Default false —
   *  keep <br> (the usual case for email body copy). */
  inline?: boolean;
}

/** Render a dialect string as email-safe HTML. */
export function toHtml(
  text: string,
  { inline = false }: ToHtmlOptions = {},
): string {
  return walk(parseDialect(text, { inline }));
}
