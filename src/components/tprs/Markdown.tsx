// React emitter for the Twisted Pin text dialect — so copy authored in the TPRS
// admin (**bold**, *italic*, [links](url), <u>underline</u>,
// <font color="brand">color</font>, <br>) renders the same everywhere a product
// appears, with NO per-page code.
//
// Parsing lives in the shared, framework-agnostic core (src/tprs/text-dialect) —
// the SAME parser the backend uses for plain-text / HTML emails + Stripe line
// items, so the dialect can't drift between channels. This file is ONE emitter:
// it walks the shared AST into React nodes.
//
// Safety: builds React elements — NEVER dangerouslySetInnerHTML — so any raw HTML
// in the field is inert. Only the dialect's token set is honored; color is locked
// to the brand allowlist.

import { Fragment, type ReactNode } from "react";
import { parseDialect, type DialectNode } from "../../tprs/text-dialect";

function emit(nodes: DialectNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.value}</Fragment>;
      case "br":
        return <br key={i} />;
      case "bold":
        return <strong key={i}>{emit(n.children)}</strong>;
      case "italic":
        return <em key={i}>{emit(n.children)}</em>;
      case "underline":
        return <u key={i}>{emit(n.children)}</u>;
      case "color":
        return (
          <span key={i} style={{ color: n.color }}>
            {emit(n.children)}
          </span>
        );
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className="tprs-md-link"
          >
            {emit(n.children)}
          </a>
        );
    }
  });
}

/**
 * Render a dialect string (no wrapper element). Drop it straight inside any text
 * container: <h2><Markdown text={name}/></h2>. By default <br>/newlines become
 * line breaks; pass `inline` (tight one-line cart rows) to collapse them to spaces.
 */
export default function Markdown({
  text,
  inline = false,
}: {
  text: string;
  inline?: boolean;
}): ReactNode {
  return <>{emit(parseDialect(text, { inline }))}</>;
}
