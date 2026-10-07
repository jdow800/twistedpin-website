import { useState } from "react";
import type { BarSkuItem } from "./api";
import { foodSearchMatch } from "./FoodReviewCountRow";

export type FoodCountChoice = {
  sku: BarSkuItem;
  total: string;
  sessionId: string;
  zoneId: string;
  snapshot: string;
};

/** Explicitly associate one pending voice question with a count already entered.
 * This never certifies a model number or adds another quantity. */
export default function FoodCountRecovery({ choices, location, onResolve }: {
  choices: FoodCountChoice[];
  location: string;
  onResolve: (choice: FoodCountChoice) => boolean;
}) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState(false);
  const hits = choices.filter(c => !search.trim() || foodSearchMatch(c.sku, search));
  return <details className="lq-fc-count-recovery">
    <summary>Use count already entered</summary>
    <p className="lq-muted">Choose the count in {location} that already includes this item. This clears this question without adding more.</p>
    <input type="search" className="lq-search" aria-label={`Find an entered count in ${location}`}
      placeholder="Find an entered item…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="lq-fc-recovery-choices">
      {hits.map(c => <button key={c.sku.id} type="button" className="lq-chip" onClick={() => setError(!onResolve(c))}>
        {c.sku.name} · {c.total}
      </button>)}
      {!hits.length && <span className="lq-muted">No entered count matches that search.</span>}
    </div>
    {error && <p className="lq-error" role="alert">That count changed. Check the current total and choose again.</p>}
  </details>;
}
