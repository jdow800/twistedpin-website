// Parity fixtures for the Twisted Pin text dialect. Both repos (this site's React
// emitter + the backend's plain/HTML emitters) assert their output against these
// EXACT strings, so the dialect can't silently drift between channels before the
// shared module is formally vendored. If you intentionally change the dialect,
// regenerate these and update BOTH repos in lockstep.
//
// `plain` = toPlainText(input) (inline, the default). `html` = toHtml(input).

export interface DialectFixture {
  /** What an author typed in a TPRS field. */
  input: string;
  /** Expected `toPlainText(input)` — for Stripe / plain emails / receipts / SMS. */
  plain: string;
  /** Expected `toHtml(input)` — for HTML emails / receipt pages. */
  html: string;
}

export const DIALECT_FIXTURES: DialectFixture[] = [
  {
    // <br> in a name → a break in HTML, a space in plain text.
    input: "1 Hour w/ Shoes<br>(Traditional Lane)",
    plain: "1 Hour w/ Shoes (Traditional Lane)",
    html: "1 Hour w/ Shoes<br>(Traditional Lane)",
  },
  {
    // Nested brand-color + bold.
    input: 'Up to 5 players per lane with <font color="fuchsia">**shoes included**</font>.',
    plain: "Up to 5 players per lane with shoes included.",
    html: 'Up to 5 players per lane with <span style="color:#d45d92"><strong>shoes included</strong></span>.',
  },
  {
    // Link → text-only in plain; real anchor in HTML.
    input: "Hate waiting? Reserve a lane. Check our [Wait List](https://www.twistedpin.com/waitlist/) for times.",
    plain: "Hate waiting? Reserve a lane. Check our Wait List for times.",
    html: 'Hate waiting? Reserve a lane. Check our <a href="https://www.twistedpin.com/waitlist/" target="_blank" rel="noopener noreferrer">Wait List</a> for times.',
  },
  {
    // Safety: unknown tags are literal/inert, off-allowlist color drops, unsafe
    // link scheme drops to its text, and HTML output is escaped.
    input: 'Plain & simple <b>x</b> [bad](javascript:hax) <font color="red">off</font>',
    plain: "Plain & simple <b>x</b> bad off",
    html: "Plain &amp; simple &lt;b&gt;x&lt;/b&gt; bad off",
  },
];
