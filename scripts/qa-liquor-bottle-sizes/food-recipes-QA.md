# Food recipe and historical yield QA

From the Website root:

```powershell
node scripts/qa-liquor-bottle-sizes/build-food-recipes.mjs
node scripts/qa-liquor-bottle-sizes/check-food-recipes.mjs
node scripts/qa-liquor-bottle-sizes/render-food-recipes.mjs
```

The checker uses jsdom. If it is held in an isolated QA dependency directory,
set `COGS_QA_DEPS` to that directory (containing package.json and node_modules),
then run the checker. The reviewed release used pinned jsdom 26.1.0.

The renderer uses the cached headless Chrome through `qa-cogs-mobile/cdp.mjs`.
Set `COGS_QA_CHROME` to its executable when the cache differs. It writes
regenerable screenshots under ignored `dist/food-recipes-shots`, verifies no
horizontal overflow at 390px and desktop width, and blocks external requests.

All requests are intercepted. The scenarios cover a full ingredient picker,
partial costs, immutable sales identity, source round-trip, staff reads/admin
writes, stale saves, unmapped option deep links, yield revision tokens, and
one atomic corrected-report request with both frozen physical bases visible.

For shelf behavior use `serve.mjs --food-voice --build-only` followed by
`check-food-walk-locations.mjs`. Its two shelf regressions preserve a zero as
a shelf-specific entry, leave another shelf blank, sum independent counts,
and retain a reopened draft's old case factor alongside a newer factor.

These mocked checks do not replace Jon's real phone/microphone food walks or
the baseline/second-count comparison with Opsi. No transcription service,
production data, email, or price-write endpoint is used.
