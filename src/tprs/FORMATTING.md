# Formatting customer copy (the `/tprs` booking flow)

How to add **bold**, color, links, line breaks, etc. to the customer-facing text
you author in the **TPRS admin** — it renders the same everywhere that text shows
in the booking flow (grid card, product detail, cart / "Your selections", the
"What you're reserving" summary, add-on rows).

You write a small **markdown-style** syntax in the normal TPRS fields. No code, no
per-page work — author once in TPRS, it renders everywhere that product appears.

---

## Where it applies

These TPRS fields all support formatting:

| Field | Shows up on |
|---|---|
| Product **name** | grid card, product detail header, cart, summary |
| **Short description** | grid card, cart, "what you're reserving" |
| **Long description** | product detail (capped to ~3 sentences + "Read more") |
| Booking **category subtitle** | category header on the grid + the "How many lanes?" helper |

---

## The syntax

| You want | You type | Result |
|---|---|---|
| **Bold** | `**shoes included**` | **shoes included** |
| *Italic* | `*late-night only*` | *late-night only* |
| Underline | `<u>must arrive on time</u>` | underlined |
| Color (brand only) | `<font color="fuchsia">shoes included</font>` | colored text |
| Link (opens new tab) | `[Wait List](https://www.twistedpin.com/waitlist/)` | a clickable link |
| Line break | `1 Hour w/ Shoes<br>(Traditional Lane)` | breaks onto two lines |

You can **nest** them, e.g. bold + color:
```
<font color="fuchsia">**shoes included**</font>
[**Wait List**](https://www.twistedpin.com/waitlist/)
```

---

## Brand colors (the allowlist)

Color is **locked to a brand palette** — readable on the dark theme and on-brand
by construction. Use any of these names in `<font color="…">`:

| Name(s) | Color |
|---|---|
| `glow` | mint green `#4EECC4` |
| `copper` | `#D88B5C` |
| `fuchsia` / `pink` | `#D45D92` |
| `gold` / `lemon` | `#FFE236` |
| `orange` / `tango` | `#FF8000` |
| `blue` | celestial blue `#468CC8` |

**Anything not on this list** (e.g. `red`, `#ff0000`, `black`) renders as **plain
text** — the formatting is simply ignored, so you can't accidentally break
contrast or go off-brand. If you need a new color, ask and it can be added to the
allowlist.

---

## Rules & gotchas

- **Use this syntax, not raw HTML.** `<strong>`, `<em>`, `<font color="red">`,
  arbitrary tags — these render as **literal text** (by design: it's safe, nothing
  can be injected). The only HTML honored is `<u>`, `<br>`, and `<font color="…">`
  with a brand name.
- **Links open in a new tab** and are styled in the brand accent.
- **Line breaks (`<br>`) collapse to a space in tight spots** — the cart rows and
  the "what you're reserving" summary stay on one line; titles break onto two
  lines on the card + detail where there's room.
- **The long description is capped** to ~3 sentences on the detail screen with a
  **"Read more"** — links are kept whole, so a link near the cut won't break.
- **Category subtitle** is *per-category*, not per-product — good place for
  `Up to <font color="glow">6 guests</font> per lane` on a VIP category vs
  `Up to 5 guests per lane` on Traditional. Put VIP and Traditional in separate
  categories so each shows the right capacity.
- **Formatting is for the website. Receipts, confirmation emails, and texts show
  the *plain* version** — the bold/colors/links are stripped and a `<br>` becomes
  a space (so `[Wait List](…)` reads as just "Wait List", no link). So: put the
  must-be-seen-everywhere wording in the plain text itself, and use heavy
  formatting (colors, links) in the **long description** (website-only), not in
  the **name** (which is what shows on a receipt / line item). If you want a
  different short name on receipts than the marketing name, that's a planned
  "receipt name" field — ask and we'll wire it.

---

## Examples

```
Name:   1 Hour w/ Shoes<br>(Traditional Lane)

Short:  Up to 5 players per lane with <font color="fuchsia">**shoes included**</font>.

Long:   Hate waiting? Reserve a guaranteed bowling lane. If you don't see a time
        you like, check our [Wait List](https://www.twistedpin.com/waitlist/).
        Each lane reserved includes shoes and seats up to 5 guests.
```

---

*For developers: this is the "Twisted Pin text dialect." Its canonical parser +
emitters live in `src/tprs/text-dialect/` (framework-agnostic, vendorable). The
website renders via the React emitter `src/components/tprs/Markdown.tsx` (builds
React elements — never `dangerouslySetInnerHTML` — so raw HTML is inert). Every
NON-HTML sink (Stripe line items, plain/HTML emails, receipts, SMS) MUST go
through `toPlainText` / `toHtml` from the same module — never interpolate a raw
field. See `src/tprs/README.md` ("Text dialect") for the cross-repo vendoring +
backend wiring.*
