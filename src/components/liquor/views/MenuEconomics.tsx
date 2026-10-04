import { useEffect, useRef, useState } from "react";
import { BarApiError, ForbiddenError } from "../api";
import { decideMenuPrice, getMenuEconomics, previewIngredientPrice, refreshMenuEconomics, saveMenuPricingPolicy, verifyMenuPrice,
  withdrawMenuPrice, reconcileMenuPrice,
  type MenuEconomicsData, type MenuEconomicsRun, type PriceDecision, type PriceRecommendation, type PriceScenario, type PricingPolicy } from "../menu-economics-api";
import "../menu-economics.css";

const money = (cents: number | null) => cents == null ? "Unknown" : (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const pct = (n: number | null) => n == null ? "Unknown" : `${n.toFixed(1)}%`;
const cents = (value: string) => value.trim() === "" ? NaN : Math.round(Number(value) * 100);
const housePrice = (n: number) => Number.isInteger(n) && n > 0 && n % (n < 500 ? 25 : 100) === 0;
const labels: Record<string, string> = { raise: "Raise for review", over_target: "Above target", margin_gained: "Margin gained", within_policy: "Within saved policy",
  policy_needed: "Item policy needed", cost_incomplete: "Cost incomplete", manual_structure: "Manual pricing structure", suppressed: "Ignored within saved scope" };
function errorText(error: unknown) {
  if (error instanceof ForbiddenError) return "Only an admin can save price decisions and item policies.";
  if (error instanceof BarApiError && error.status === 409) return "The price, policy or cost evidence changed. Reload and refresh analysis before deciding.";
  return "The request did not finish. Reload the saved state before retrying a decision.";
}

function PolicyEditor({ rec, saved, canManage, onSaved }: { rec: PriceRecommendation; saved: PricingPolicy | null; canManage: boolean; onSaved: () => Promise<void> }) {
  const [target, setTarget] = useState(saved?.targetCostPct?.toString() ?? ""), [shrink, setShrink] = useState(saved?.shrinkMultiplier?.toString() ?? "");
  const [floor, setFloor] = useState(saved?.floorCents == null ? "" : String(saved.floorCents / 100));
  const [market, setMarket] = useState(saved?.marketCeilingCents == null ? "" : String(saved.marketCeilingCents / 100));
  const [cap, setCap] = useState(saved?.programCapCents == null ? "" : String(saved.programCapCents / 100));
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const valid = target.trim() !== "" && Number(target) > 0 && Number(target) <= 100 && shrink.trim() !== "" && Number(shrink) >= 1 && Number(shrink) <= 5
    && [cents(floor), cents(market), cents(cap)].every(housePrice) && cents(floor) <= Math.min(cents(market), cents(cap)) && reason.trim().length >= 3;
  return <details className="lq-me-policy"><summary>Edit this item's pricing policy</summary>
    <p>Enter the reviewed target and limits for this exact product. Report targets do not fill these fields. Use whole dollars, or quarter dollars below $5.</p>
    {!rec.productUuid && <p>Current GoTab write identity is unknown. Item policy cannot be saved yet.</p>}
    <fieldset disabled={!canManage || busy || !rec.productUuid}>
      <div className="lq-me-fields"><label>Target cost (%)<input aria-label="Target cost (%)" type="number" min="0.01" max="100" step="any" value={target} onChange={e => setTarget(e.target.value)} /></label>
        <label>Shrink multiplier<input aria-label="Shrink multiplier" type="number" min="1" max="5" step="any" value={shrink} onChange={e => setShrink(e.target.value)} /></label></div>
      <div className="lq-me-fields"><label>Floor ($)<input aria-label="Floor ($)" type="number" step="0.25" value={floor} onChange={e => setFloor(e.target.value)} /></label>
        <label>Market ceiling ($)<input aria-label="Market ceiling ($)" type="number" step="0.25" value={market} onChange={e => setMarket(e.target.value)} /></label>
        <label>Program cap ($)<input aria-label="Program cap ($)" type="number" step="0.25" value={cap} onChange={e => setCap(e.target.value)} /></label></div>
      <label>Policy reason<textarea aria-label="Policy reason" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="lq-btn" disabled={!valid} onClick={async () => { setBusy(true); setMessage(null); try {
        await saveMenuPricingPolicy({ productId: rec.productId, productUuid: rec.productUuid!, expectedRevision: saved?.revision ?? 0,
          targetCostPct: Number(target), shrinkMultiplier: Number(shrink), floorCents: cents(floor), marketCeilingCents: cents(market), programCapCents: cents(cap), reason: reason.trim() });
        await onSaved(); setReason(""); setMessage("Policy saved. Refresh analysis to get recommendations under this policy.");
      } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); } }}>{busy ? "Saving policy…" : "Save item policy"}</button>
    </fieldset>{message && <p role="status">{message}</p>}
  </details>;
}

function RecommendationCard({ rec, run, savedPolicy, canManage, reload, earlierPending = false, canWithdraw = false }: { rec: PriceRecommendation; run: MenuEconomicsRun;
  savedPolicy: PricingPolicy | null; canManage: boolean; reload: () => Promise<void>; earlierPending?: boolean; canWithdraw?: boolean }) {
  const { economics: row, proposal } = rec.payload;
  const [reason, setReason] = useState(""), [custom, setCustom] = useState(""), [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const [noPendingWrite, setNoPendingWrite] = useState(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const policyCap = savedPolicy?.marketCeilingCents != null && savedPolicy.programCapCents != null
    ? Math.min(savedPolicy.marketCeilingCents, savedPolicy.programCapCents) : null;
  const customCents = cents(custom), exceeds = policyCap != null && customCents > policyCap;
  const canCustom = ["raise", "over_target"].includes(proposal.kind);
  async function decide(action: PriceDecision["action"]) {
    const intent = { expectedRevision: rec.revision, runFingerprint: run.fingerprint, action, reason: reason.trim(),
      ...(action === "custom" ? { priceCents: customCents, capOverride: override } : {}) };
    const key = JSON.stringify(intent);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setMessage(null);
    try { await decideMenuPrice(rec.id, { ...intent, requestId: request.current.id }); await reload(); setReason("");
      setMessage(action === "ignore" ? "Ignored within the saved gap and cap scope." : "Decision saved. Change the price in GoTab, then verify it here.");
    } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); }
  }
  return <article className="lq-me-card" id={`menu-rec-${rec.id}`} data-recommendation-id={rec.id} tabIndex={-1} aria-label={`${row.product.name} product ${rec.productId}`}>
    <div className="lq-me-card-heading"><div><h3>{row.product.name}</h3><p className="lq-muted">Product {rec.productId} · {row.product.category ?? "Category unknown"}</p></div>
      <strong>{labels[proposal.kind] ?? proposal.kind}</strong></div>
    <dl className="lq-me-metrics"><div><dt>Current base price</dt><dd>{money(row.product.basePriceCents)}</dd></div>
      <div><dt>Physical units made</dt><dd>{row.physicalMadeQty.toLocaleString()}</dd></div><div><dt>Net financial units</dt><dd>{row.financialNetQty.toLocaleString()}</dd></div>
      <div><dt>Net sales</dt><dd>{money(row.netRevenueCents)}</dd></div><div><dt>Complete recipe cost</dt><dd>{money(row.completeRecipeCostCents)}</dd></div>
      <div><dt>Gross profit</dt><dd>{money(row.grossProfitCents)}</dd></div><div><dt>Realized cost</dt><dd>{pct(row.costPct)}</dd></div></dl>
    {row.missing.length > 0 && <p className="lq-me-warning">Missing evidence: {row.missing.join("; ")}. Known ingredient portion: {money(row.knownRecipeCostCents)}. Complete margin is unavailable.</p>}
    {proposal.missing.length > 0 && !row.missing.length && <p>{proposal.missing.join(" ")}</p>}
    {proposal.proposedCents != null && <p>Review {money(proposal.proposedCents)} · {pct(proposal.gapPct)} increase · {money(proposal.profitGainCents)} estimated gain at the saved 60-day net sales mix. Break-even volume loss: {pct(proposal.breakEvenVolumeDropPct)}.</p>}
    {proposal.capped && <p>Saved cap limits the recommendation. A custom price above the cap needs an explicit override.</p>}
    {rec.status !== "open" && <p><strong>{rec.status === "verified" ? "Verified in GoTab" : rec.status === "ignored" ? "Ignored" : rec.status === "stale" ? "Closed after review" : rec.status === "uncertain" ? "Uncertain: review GoTab before another action" : "Approved, pending GoTab verification"}</strong>{rec.appliedCents != null ? ` · ${money(rec.appliedCents)}` : ""}</p>}
    {earlierPending && <p>An earlier price decision for this product still needs GoTab verification. Resolve that decision before approving another price.</p>}
    {["accepted_pending_manual", "custom_pending_manual", "uncertain"].includes(rec.status) && <fieldset disabled={!canManage || busy}>
      {canWithdraw && <p>Set this exact product's base price to {money(rec.appliedCents)} in GoTab. Verification checks a fresh price read.</p>}
      {rec.readbackCents != null && <p>Last GoTab readback: {money(rec.readbackCents)}. This decision remains pending until the approved price is confirmed.</p>}
      {canWithdraw && <button className="lq-btn" onClick={async () => { setBusy(true); setMessage(null); try { const result = await verifyMenuPrice(rec.id, rec.revision); await reload();
        setMessage(result.verified ? "GoTab confirmed the approved price." : "GoTab still shows a different price. The decision remains pending.");
      } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); } }}>Verify GoTab price</button>}
      {canWithdraw && <><label>Withdrawal reason<textarea aria-label={`Withdrawal reason for ${rec.productId}`} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
        <button className="lq-btn" disabled={reason.trim().length < 3} onClick={async () => { setBusy(true); setMessage(null); try { await withdrawMenuPrice(rec.id, rec.revision, reason.trim()); await reload();
          setMessage("Unattempted approval withdrawn. Refresh analysis before another decision."); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); } }}>Withdraw saved approval</button></>}
      {rec.status === "uncertain" && <><label>Reconciliation reason<textarea aria-label={`Reconciliation reason for ${rec.productId}`} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
        <label className="lq-me-check"><input type="checkbox" aria-label={`No outstanding price change for ${rec.productId}`} checked={noPendingWrite} onChange={e => setNoPendingWrite(e.target.checked)} /> I checked GoTab and confirmed no price change remains outstanding.</label>
        <p>Reconciliation reads the current exact GoTab price. It closes this reviewed uncertainty and never retries a price write.</p>
        <button className="lq-btn" disabled={!noPendingWrite || reason.trim().length < 3} onClick={async () => { setBusy(true); setMessage(null); try { await reconcileMenuPrice(rec.id, rec.revision, reason.trim()); await reload();
          setMessage("Fresh GoTab evidence recorded. Refresh analysis before a new decision."); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); } }}>Reconcile uncertain price</button></>}
    </fieldset>}
    {rec.status === "open" && !earlierPending && proposal.gapPct != null && proposal.kind !== "suppressed" && <fieldset disabled={!canManage || busy}>
      <label>Decision reason<textarea aria-label={`Decision reason for ${rec.productId}`} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
      <div className="lq-me-actions">{proposal.kind === "raise" && <button className="lq-btn lq-btn-primary" disabled={reason.trim().length < 3} onClick={() => void decide("accept")}>Accept {money(proposal.proposedCents)}</button>}
        <button className="lq-btn" disabled={reason.trim().length < 3} onClick={() => void decide("ignore")}>Ignore this recommendation</button></div>
      {canCustom && <details><summary>Choose a custom price</summary><label>Custom price ($)<input aria-label={`Custom price for ${rec.productId}`} type="number" step="0.25" value={custom} onChange={e => { setCustom(e.target.value); setOverride(false); }} /></label>
        {exceeds && <label className="lq-me-check"><input type="checkbox" aria-label={`Override cap for ${rec.productId}`} checked={override} onChange={e => setOverride(e.target.checked)} /> I approve this price above the saved cap; the reason explains why.</label>}
        <p>Whole dollars, or quarter dollars below $5. Prices cannot be reduced here.</p>
        <button className="lq-btn" disabled={reason.trim().length < 3 || !housePrice(customCents) || customCents < Math.max(row.product.basePriceCents ?? Infinity, savedPolicy?.floorCents ?? Infinity) || (exceeds && !override)} onClick={() => void decide("custom")}>Save custom price decision</button></details>}
    </fieldset>}
    <PolicyEditor key={`${rec.productId}:${savedPolicy?.revision ?? 0}`} rec={rec} saved={savedPolicy} canManage={canManage} onSaved={reload} />
    {message && <p role="status">{message}</p>}
  </article>;
}

export default function MenuEconomics({ onDone, canManage, initialRecommendationId = null }: { onDone: () => void; canManage: boolean; initialRecommendationId?: string | null }) {
  const [data, setData] = useState<MenuEconomicsData | null>(null), [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [skuId, setSkuId] = useState(""), [newCost, setNewCost] = useState(""), [scenario, setScenario] = useState<PriceScenario | null>(null);
  const focusedRecommendation = useRef<string | null>(null);
  const currentRunId = useRef<string | null>(null);
  currentRunId.current = data?.run?.id ?? null;
  const reload = async () => { const next = await getMenuEconomics(); setData(next); setScenario(previous => previous?.runId === next.run?.id ? previous : null); return next; };
  useEffect(() => { let live = true; getMenuEconomics().then(value => { if (live) setData(value); }).catch(error => { if (live) setMessage(errorText(error)); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!initialRecommendationId || focusedRecommendation.current === initialRecommendationId) return;
    const target = document.getElementById(`menu-rec-${initialRecommendationId}`);
    if (target) { target.focus({ preventScroll: true }); target.scrollIntoView?.({ block: "start" }); focusedRecommendation.current = initialRecommendationId; }
  }, [data, initialRecommendationId]);
  const pendingIds = new Set(data?.pending?.map(p => p.recommendation.id) ?? []);
  const pendingProducts = new Set(data?.pending?.map(p => p.recommendation.productId) ?? []);
  const shown = data?.recommendations.filter(rec => !pendingIds.has(rec.id) && (filter === "all" || filter === "actionable" && ["raise", "over_target"].includes(rec.payload.proposal.kind)
    || filter === "incomplete" && rec.payload.proposal.kind === "cost_incomplete" || filter === "policy" && rec.payload.proposal.kind === "policy_needed"
    || filter === "manual" && rec.payload.proposal.kind === "manual_structure") && `${rec.payload.economics.product.name} ${rec.productId}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const used = new Set(data?.run?.rows.flatMap(row => row.ingredients.map(i => i.skuId)) ?? []);
  const ingredients = data?.run?.basis.prices.filter(p => used.has(p.skuId) && p.costUsd != null) ?? [];
  const ingredient = ingredients.find(p => p.skuId === skuId);
  const activeScenario = scenario?.runId === data?.run?.id ? scenario : null;
  return <section className="lq-me">
    <div className="lq-me-heading"><h2>Menu economics</h2><button className="lq-btn" onClick={onDone}>Back</button></div>
    <p>Recipe costs and price impact at the saved 60-day sales mix. Physical production preserves comps and refunds; net sales include each financial adjustment once.</p>
    <p>{data?.writer.message ?? "Price decisions are saved for a manual GoTab change and fresh verification."}</p>
    {!canManage && <p>An admin must save policies and price decisions.</p>}
    <div className="lq-me-actions"><button className="lq-btn" disabled={busy} onClick={async () => { setBusy(true); setMessage(null); try { await reload(); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); } }}>Reload saved state</button>
      <button className="lq-btn lq-btn-primary" disabled={!canManage || busy} onClick={async () => { setBusy(true); setMessage(null); try { await refreshMenuEconomics(); await reload(); setScenario(null); setMessage("Analysis refreshed with current recipes, costs and GoTab sales."); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); } }}>{busy ? "Loading…" : "Refresh analysis"}</button></div>
    {message && <p role="alert">{message}</p>}
    {!data && !message && <p>Loading saved analysis…</p>}
    {data && !data.run && <p>No saved analysis yet. An admin can refresh analysis to create the first review.</p>}
    {data && initialRecommendationId && !data.recommendations.some(r => r.id === initialRecommendationId)
      && !data.pending?.some(p => p.recommendation.id === initialRecommendationId) && <p>The linked recommendation is no longer active. Current and pending reviews appear below.</p>}
    {data && data.pending?.length > 0 && <section aria-label="Pending price decisions"><h3>Pending price decisions</h3>
      <p>These approvals keep their original saved evidence across analysis refreshes.</p>{data.pending.map(p => <RecommendationCard key={`${p.recommendation.id}:${p.recommendation.revision}`}
        rec={p.recommendation} run={p.run} savedPolicy={data.policies.find(policy => policy.productId === p.recommendation.productId)?.policy ?? null}
        canManage={canManage} canWithdraw={p.writeAttemptId === null && ["accepted_pending_manual", "custom_pending_manual"].includes(p.recommendation.status)} reload={async () => { await reload(); }} />)}</section>}
    {data?.run && <>
      <p className="lq-muted">Saved {new Date(data.run.createdAt).toLocaleString()} · {new Date(data.run.periodStart).toLocaleDateString()} through {new Date(data.run.periodEnd).toLocaleDateString()} · {data.run.basis.ledgerRows.toLocaleString()} ledger rows. Recommendations rank estimated gross profit dollars.</p>
      <details className="lq-me-scenario"><summary>Ingredient price impact</summary><p>This scenario holds the saved recipe demand and sales mix fixed. It changes the cost of one comparable physical count unit.</p>
        <fieldset disabled={busy}><label>Ingredient<select aria-label="Ingredient price impact ingredient" value={skuId} onChange={e => { setSkuId(e.target.value); setNewCost(""); setScenario(null); }}><option value="">Choose a priced ingredient</option>{ingredients.map(i => <option key={i.skuId} value={i.skuId}>{i.name}</option>)}</select></label>
          {ingredient && <p>Saved {money(ingredient.costUsd == null ? null : ingredient.costUsd * 100)} per {ingredient.unitLabel ?? ingredient.countUnit}{ingredient.yieldPerCount != null ? ` · ${ingredient.yieldPerCount} ${ingredient.recipeUnit} per count unit` : " · yield unknown"}.</p>}
          <label>New cost per saved count unit ($)<input aria-label="New ingredient cost" type="number" min="0" max="100000" step="any" value={newCost} onChange={e => { setNewCost(e.target.value); setScenario(null); }} /></label>
          <button className="lq-btn" disabled={!ingredient || newCost.trim() === "" || !Number.isFinite(Number(newCost)) || Number(newCost) < 0} onClick={async () => { if (!ingredient || !data.run) return; const requestRunId = data.run.id; setBusy(true); setMessage(null); try {
            const result = await previewIngredientPrice(data.run, ingredient, Number(newCost));
            if (currentRunId.current === requestRunId && result.runId === requestRunId) setScenario(result);
          } catch (error) { if (currentRunId.current === requestRunId) setMessage(errorText(error)); } finally { setBusy(false); } }}>Preview fixed mix impact</button>
        </fieldset>{activeScenario && <div aria-label="Ingredient price scenario"><p>Fixed saved recipes and sales mix; incomplete products retain unknown complete margin.</p>{activeScenario.rows.map(row => <p key={row.productId}>{row.name} · product {row.productId}: cost change {money(row.costDeltaCents)} · complete new cost {money(row.newRecipeCostCents)} · gross profit change {money(row.grossProfitDeltaCents)}</p>)}</div>}
      </details>
      <div className="lq-me-fields"><label>Search products<input aria-label="Search menu products" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Show<select aria-label="Menu economics filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All products</option><option value="actionable">Price reviews</option><option value="incomplete">Incomplete costs</option><option value="policy">Policy needed</option><option value="manual">Manual pricing structure</option></select></label></div>
      <p>{shown.length.toLocaleString()} products in this filter.</p>
      {shown.map(rec => <RecommendationCard key={`${rec.id}:${rec.revision}`} rec={rec} run={data.run!} savedPolicy={data.policies.find(p => p.productId === rec.productId)?.policy ?? null} canManage={canManage} earlierPending={pendingProducts.has(rec.productId)} reload={async () => { await reload(); }} />)}
    </>}
  </section>;
}
