export const prerender = false;

import type { APIRoute } from 'astro';
import { AVERY_REVIEW_COOKIE, verifyReviewToken } from '../../lib/avery-review-auth';
import { storeConfig } from '../../lib/playbook-store';

/**
 * /api/avery-review-decide — Accept / Reject / Undo one review recommendation.
 *
 * Writes avery_review_item.status. Decisions here drive the Apply step:
 * accepted items surface in the dashboard's copy-paste session brief
 * ("apply these diffs to brain/, run golden, deploy" — Apply v1 per
 * review/SPEC.md). Nothing is ever auto-applied from this endpoint.
 */
/**
 * Legal transitions only, enforced in the PATCH where-clause — the UI hides
 * buttons for terminal states, but the endpoint is the contract (audit
 * 2026-08-15): a stale tab resetting an 'applied' item would silently destroy
 * the regression signal the carryover pass keys on, and resetting a
 * 'superseded' item would fork its thread. Zero matched rows = the item moved
 * on since the page loaded; surfaced as e=5, never applied blind.
 */
const DECISIONS: Record<string, { status: string; stamp: boolean; from: string[] }> = {
  accept: { status: 'accepted', stamp: true, from: ['proposed', 'stale'] },
  reject: { status: 'rejected', stamp: true, from: ['proposed', 'stale'] },
  reset: { status: 'proposed', stamp: false, from: ['accepted', 'rejected', 'stale'] },
};

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const authed = await verifyReviewToken(cookies.get(AVERY_REVIEW_COOKIE)?.value);
  if (!authed) return redirect('/avery-review/?e=1', 303);

  let itemId = '';
  let decision = '';
  let report = '';
  let reason = '';
  try {
    const form = await request.formData();
    itemId = String(form.get('item_id') ?? '');
    decision = String(form.get('decision') ?? '');
    report = String(form.get('report') ?? '');
    // Optional one-liner. Rejection reasons feed the next review's carryover
    // block (a re-proposal must address them) and are the raw material for
    // future taste-learning — unlabeled rejections can't carry taste.
    reason = String(form.get('reason') ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  } catch {
    return redirect('/avery-review/?e=3', 303);
  }

  const d = DECISIONS[decision];
  // Item ids are DB-minted uuids; anything else is a forged form.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId);
  if (!d || !isUuid) return redirect('/avery-review/?e=3', 303);

  const cfg = storeConfig();
  if (!cfg) return redirect('/avery-review/?e=4', 303);

  const res = await fetch(
    `${cfg.url}/rest/v1/avery_review_item?id=eq.${itemId}&status=in.(${d.from.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: d.status,
        decided_at: d.stamp ? new Date().toISOString() : null,
        decided_by: d.stamp ? 'jon' : null,
        decided_reason: d.stamp && reason ? reason : null,
      }),
    },
  );
  const rows = res.ok ? ((await res.json()) as unknown[]) : [];

  const params = new URLSearchParams();
  if (report && /^[0-9a-f-]{36}$/i.test(report)) params.set('report', report);
  if (!res.ok) params.set('e', '4');
  else if (rows.length === 0) params.set('e', '5'); // state changed under this tab
  const qs = params.toString();
  return redirect(`/avery-review/${qs ? `?${qs}` : ''}#item-${itemId}`, 303);
};
