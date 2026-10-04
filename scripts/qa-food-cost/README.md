# Food physical cost correction QA

All data and requests are mocked. No GoTab access, credentials, production reads or writes.

```powershell
node scripts/qa-food-cost/build.mjs
# COGS_QA_DEPS may point to an existing local package directory containing jsdom.
node scripts/qa-food-cost/check.mjs
node scripts/qa-food-cost/render.mjs
```

Runs ten scenarios using the real LiquorApp bootstrap/PIN flow, operations inbox link, exact SKU cost panel and FoodRecipes recipe preview. Checks a restored bag cost stays unknown on a case until an explicit current-unit price is confirmed, permission enforcement, cost precision, stale revision handling and renewed confirmation after a changed physical basis. A physical-capacity rejection or a successful response with null/missing cost cannot announce confirmation; a usable zero cost can. Browser checks capture the held-cost editor at 360px, 412px and 1280px with no horizontal overflow. Generated dist/output files are ignored.
