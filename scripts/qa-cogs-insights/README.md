# COGS insights UI QA

The fixture renders the actual Operations inbox, Food cost trends and Brunswick food revenue components with a fetch mock. All values and identities are synthetic. There are no database writes, external API calls, messages, or price changes.

From the Website repository:

```powershell
node scripts/qa-cogs-insights/build.mjs
# Optional: point at an isolated package directory containing jsdom 26.1.0.
$env:COGS_QA_DEPS = 'path/to/qa-dependencies'
node scripts/qa-cogs-insights/check.mjs
node scripts/qa-cogs-insights/check-deep-links.mjs
# Optional: use a cached Chromium/headless-shell executable; never download one.
$env:COGS_QA_CHROME = 'path/to/chrome-headless-shell.exe'
node scripts/qa-cogs-insights/render.mjs
```

The checks cover unavailable sources versus all clear, network errors, unknown impact filtering and paging, staff permissions, independent reliable/all trend summaries, Chicago closing dates, unknown revenue versus a reviewed zero, and 409 review conflicts followed by an explicit source reload with fresh revision tokens. A failed reload preserves the unsaved review. Food cost report checks separately cover all-unknown Brunswick days, a verified zero, and an explicitly labeled partial known subtotal.

Screenshots cover desktop and 390px phone layouts. The visual runner asserts no horizontal overflow and uses the existing local-only Chrome interception guard. Bundles and screenshots are regenerated under ignored `dist/`.

These checks validate the mocked UI contract. Backend source aggregation, timezone selection and concurrency protections have separate backend tests; a real phone counting walk remains a field validation.

The separate deep-link fixture imports the actual LiquorApp and Counts components. It covers older, partial and other-counter drafts, plus the exact destination through PIN login. Legacy `count`/`countfood` links carrying an ID must normalize to the read-only history detail. Submitted food counts use the actual server section, show exact food cost/variance report links, and never request liquor variance or expose its correction controls. A legacy response falls back to the requested section; actual bar identity overrides a food URL and preserves bar variance behavior. History reads follow the requested section. The fixture deliberately offers a different recent count in history; it refuses walk/open/catalog requests, count creation and count writes.
