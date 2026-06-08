// ── Twisted Pin text dialect — canonical, framework-agnostic core ────────────
//
// The small inline-markup language authored in TPRS product fields (name, short
// description, long description, category subtitle, add-on name/description). It
// has ONE parser (`parseDialect` → a shared AST) and three emitters:
//
//   • React        — the website renderer (src/components/tprs/Markdown.tsx)
//   • plain-text   — `toPlainText`  (Stripe line items, plain emails/SMS, receipts,
//                                    admin tables, reports — every NON-HTML sink)
//   • HTML-string  — `toHtml`       (HTML emails / receipt pages)
//
// WHY THIS LIVES HERE (and must stay framework-free): the dialect leaks if any
// channel interpolates a raw field — `**bold**`, `[Wait List](…)`, `<font
// color="tango">` render literally in emails/receipts/Stripe. The fix is that
// EVERY channel transforms through this module. A React-only stripper would
// force the Fastify backend to reimplement it, and the two would drift — the
// exact failure the vendored-schemas rule (src/tprs/README.md) exists to prevent.
//
// VENDORING: treat this like `src/tprs/schemas` — intended to be promoted to a
// shared package in dev/tprs (alongside @tprs/shared-schemas) and vendored into
// BOTH repos, kept in lockstep. Authored here for ADR-0029 Slice 1; the backend
// lifts the same files (no React imports in the core, so it imports clean) and
// runs `fixtures.ts` as a parity test. Keep zero non-core imports in this folder.

export { BRAND_COLORS, resolveBrandColor } from "./colors";
export { parseDialect, type DialectNode, type ParseOptions } from "./parse";
export { toPlainText, type ToPlainTextOptions } from "./plain";
export { toHtml, type ToHtmlOptions } from "./html";
export { DIALECT_FIXTURES, type DialectFixture } from "./fixtures";
