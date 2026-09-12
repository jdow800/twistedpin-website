# Saved recipe reuse and ounce label changes

Jon encountered Green Tea Shot again under Bar Mods after saving its recipe in August. Production investigation on September 12 found six active GoTab occurrences of the same shared option dictionary entry, one under each Bar Mods spirit category: Vodkas, Rum, Tequila, Whiskey, Gin, and Liqueurs / Cordials. Two older Green Tea entries are archived. The saved inventory recipe is 1 oz Jameson; reuse displays that actual saved spec and does not infer other ingredients from the drink name.

The recipe identity remains product plus normalized option label. This is deliberate: identical names need not mean identical recipes. The old template endpoint only searched standalone product names, so it could not offer the already-saved option recipe.

## Result

- Same-named active option and standalone recipes appear directly on the unresolved card, with ingredient names, ounces, bottle sizes, and source menu context where available.
- **Use this recipe** saves the displayed components to this target using the existing save route. **Edit first** prefills the ordinary builder. Undo unclassifies only the target; the source remains unchanged.
- Identical component specs are grouped; differing pours or bottles remain separate choices. Mixers, swaps, inactive recipes, and recipes containing inactive ingredients are not offered. No background assignment and no new schema.
- Menu names are optional display context from a coalesced five-minute GoTab cache, with a 2.5-second bound and an offline fallback. The recipe-gap queue remains DB-only. Failure of suggestions leaves the manual builder usable.

## Renaming pour buttons

The ounce parser accepts `oz`, `ounce`, `ounces`, and forms such as `2-ounce pour`, including `.5oz`. A fraction, range, zero measure, or multiple measures is left for classification rather than interpreted as a single pour.

For choose-your-spirit options, the engine aggregates the labels returned on ledger transactions separately even when the parent product ID is reused. A test proves 4 old `Tito's 1.5 ounces` pours plus 3 new `Tito's 2.0 ounces` pours produce 12 oz, not 14. This does not establish a GoTab guarantee about retrospective edits to its own data: the application uses the transaction option labels it receives.

Whole-product cocktail recipes remain keyed by product ID and do not resize themselves when a product name changes. There is no dedicated size-change notification or recipe version history in this change. A future rename detector should distinguish transaction option labels from current product metadata and must not rescale older sales using a current name. Jon is willing to confirm such changes when they arise.

## Validation and reproduction

Backend TypeScript and the focused recipe, coverage, pour parser, automatch, and variance tests pass. The API fixture runs only on a local `_test` database in a rollback transaction and proves read-only lookup, target-only save, removal from the gap queue, Undo, original-source preservation, and rejection of a retired ingredient.

Website TypeScript and eight synthetic DOM scenarios pass, covering source/target labels, displayed quantities, no automatic save, confirmation, Undo, edit first, conflicting specs, failures, and standalone reuse. No visual browser or real phone check was available in this session.

From Website (existing isolated jsdom dependencies under `scripts/qa-liquor-bottle-sizes`; install with its lockfile if absent):

```powershell
node scripts/qa-liquor-bottle-sizes/serve.mjs --recipes --build-only
node scripts/qa-liquor-bottle-sizes/check-recipes.mjs
```

For the synthetic visual fixture, omit `--build-only` and visit localhost:4177; this sends no real API writes. Source is in `recipe-fixture.jsx`; generated `dist/` and dependencies are ignored.

## Release

Implementation and local validation complete. Backend PR, production builds, and live verification pending. No production recipe data has been changed by this session.
