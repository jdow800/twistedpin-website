export const prerender = false;

import type { APIRoute } from 'astro';
import { AVERY_REVIEW_COOKIE, verifyReviewToken } from '../../lib/avery-review-auth';
import { storeConfig, updateWhere } from '../../lib/playbook-store';

/**
 * /api/avery-review-decide — Accept / Reject / Undo one review recommendation.
 *
 * Writes avery_review_item.status. Decisions here drive the Apply step:
 * accepted items surface in the dashboard's copy-paste session brief
 * ("apply these diffs to brain/, run golden, deploy" — Apply v1 per
 * review/SPEC.md). Nothing is ever auto-applied from this endpoint.
 */
const DECISIONS: Record<string, { status: string; stamp: boolean }> = {
  accept: { status: 'accepted', stamp: true },
  reject: { status: 'rejected', stamp: true },
  reset: { status: 'proposed', stamp: false },
};

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const authed = await verifyReviewToken(cookies.get(AVERY_REVIEW_COOKIE)?.value);
  if (!authed) return redirect('/avery-review/?e=1', 303);

  let itemId = '';
  let decision = '';
  let report = '';
  try {
    const form = await request.formData();
    itemId = String(form.get('item_id') ?? '');
    decision = String(form.get('decision') ?? '');
    report = String(form.get('report') ?? '');
  } catch {
    return redirect('/avery-review/?e=3', 303);
  }

  const d = DECISIONS[decision];
  // Item ids are DB-minted uuids; anything else is a forged form.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId);
  if (!d || !isUuid) return redirect('/avery-review/?e=3', 303);

  const cfg = storeConfig();
  if (!cfg) return redirect('/avery-review/?e=4', 303);

  const ok = await updateWhere(cfg, 'avery_review_item', 'id', itemId, {
    status: d.status,
    decided_at: d.stamp ? new Date().toISOString() : null,
    decided_by: d.stamp ? 'jon' : null,
  });

  const params = new URLSearchParams();
  if (report && /^[0-9a-f-]{36}$/i.test(report)) params.set('report', report);
  if (!ok) params.set('e', '4');
  const qs = params.toString();
  return redirect(`/avery-review/${qs ? `?${qs}` : ''}#item-${itemId}`, 303);
};
