# Menu economics offline QA

No credentials, production data, external GoTab read or price write is used. The fixture intercepts every API call. Browser checks additionally block external requests.

From Website:

```powershell
node scripts/qa-menu-economics/build.mjs
# Optional: point COGS_QA_DEPS to a local package directory with jsdom installed.
node scripts/qa-menu-economics/check.mjs
# Uses the existing qa-cogs-mobile headless browser adapter; override COGS_QA_CHROME if necessary.
node scripts/qa-menu-economics/render.mjs
```

Checks exact same-name product identity, unknown complete costs, physical versus financial quantity, staff permissions, blank unapproved policy defaults, approval/readback across analysis refresh, conflicting approvals, idempotent retry after an ambiguous response, stale evidence, unattempted approval withdrawal, explicit uncertain reconciliation, and fixed recipe/mix ingredient impact. Scenarios clear when saved analysis changes; a deferred response from an older run cannot appear under a newer one. The deferred-response check invokes the actual registered request handler to force this request-order race independently of the disabled loading control. Browser output covers 360px, 412px and 1280px with no horizontal overflow. `dist` and `output` are regenerable and ignored.
