# Food count units and matching

Ready for review. Retain Deepgram and improve food-count review, including implausible case quantities such as 30 cases of Aquafina. Website PR #30 already overlaps matching with recording; this change addresses product, quantity and package review.

Companion backend: [TPRS PR #207](https://github.com/jdow800/tprs/pull/207), branch `fix/food-count-reliability`. It provides spoken package words, explicit missing quantities, reliable history observations and support for one-pack food cases. Model evaluation and catalog-repair details are documented in the private backend repository.

The review recalculates quantity from the chosen product and current answers. Staff can search/select a product, edit quantities, answer cases-versus-packs or package contents, and explicitly keep an unusual count. Large counts use reliable submitted-count/confirmed-delivery history where available, plus a generic check at ten cases. The 30-case water example offers 30 bottles without silently changing the answer. Test catalog/history values, including 24 bottles per case, are synthetic and do not establish production packaging. Packet/box counts require their actual package contents before Apply; unlisted product variants remain unresolved.

The original transcript stays available during review/error. A wholly failed take can be retried without recording again; partly successful takes cannot be replayed wholesale and counted twice. Resumed pack metadata and frozen case sizes survive later edits; manual grid changes are labeled grid. Unknown quantity blocks Apply, while explicit zero is a valid answer. No production count quantities were edited.

Validation: 23 DOM interaction scenarios passed, changed-UI TypeScript check passed and the full Website `npm run build` passed. The backend passed 105 targeted tests and its typecheck. No browser was available to the computer-use runtime, so visual phone QA remains unverified.

Merge and deploy backend/migration first, then this Website PR. The client sends `foodUnitsVersion: 1`; the backend asks old tabs to refresh rather than letting them ignore package questions. Food voice is temporarily blocked on the old Website between deployments; manual entry remains available. Refresh the counter after both deployments and monitor real food extraction latency and corrections. PR #30 alone is already live; these new changes are not yet deployed.
