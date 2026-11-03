import { useState, useCallback, useRef } from 'react';
import { X, Copy, Check, MessageCircle } from 'lucide-react';
import { builderSubmit } from 'zitejs/api';
import { bookingPolicy, canonicalBuild, reviewError, pricingContractError, RECALCULATE_MESSAGE, shortNoticeMessage, type PricingStatus, type ManualReason } from '../../lib/builderContract';
import { useEventClock } from '../../lib/useEventClock';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type SummaryData = {
  date: string;
  time: string;
  duration: number;
  guestCount: number;
  laneType: 'vip' | 'traditional';
  foodPackage: string | null;
  foodPackageSlug: string | null;
  foodEstimate: string;
  barSelection: string;
  barQty: number;
  addons: { label: string; slug: string; qty: number }[];
  notes: string;
  estimateTotal: string;
  estimateNum: number | null;
  depositNum: number | null;
  laneLabel: string | null;
  outsideHoursTime?: string;
  pricingStatus: PricingStatus;
  manualReason?: ManualReason;
  inputFingerprint?: string;
  reviewedDay: string;
  shortNotice: boolean;
};

type Props = {
  data: SummaryData;
  eid: string;
  onClose: () => void;
};

const PHONE = '+17793030261';

type SendState = 'idle' | 'sending' | 'success' | 'failure';

/* ── Build plain-text summary ──────────────────────────────────────────────── */

export function buildSummaryText(d: SummaryData, staffRoute = false, now = new Date()): string {
  const lines: string[] = [];

  if (d.date) {
    const dt = new Date(d.date + 'T12:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    lines.push(`Date: ${dayNames[dt.getDay()]} ${monthNames[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`);
  }

  if (d.time && d.time !== '__outside__') {
    const [hStr, m] = d.time.split(':');
    let h = parseInt(hStr, 10);
    if (h >= 24) h -= 24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = `${h12}:${m} ${ampm}`;
    lines.push(`Start: ${timeStr} · ${d.duration} hours`);
  } else if (d.time === '__outside__') {
    const req = d.outsideHoursTime ? ` (requested: ${d.outsideHoursTime})` : '';
    lines.push(`Start: Outside regular hours${req} · ${d.duration} hours`);
  }

  const laneLabel = d.laneType === 'vip' ? 'VIP Suite' : 'Traditional Lanes';
  if (d.guestCount > 100) {
    lines.push(`Guests: 100+`);
  } else {
    lines.push(`Guests: ${d.guestCount} (${laneLabel})`);
  }

  if (d.foodPackage) {
    const est = d.foodEstimate ? ` (About ${d.foodEstimate})` : '';
    lines.push(`Food: ${d.foodPackage}${est}`);
  }

  if (d.barSelection === 'own_tab') {
    lines.push('Drinks: Guests run their own tabs');
  } else if (d.barSelection === '10_card') {
    lines.push(`Drinks: $10 Beer Wall Cards × ${d.barQty}`);
  } else if (d.barSelection === '15_card') {
    lines.push(`Drinks: $15 Beer Wall Cards × ${d.barQty}`);
  } else if (d.barSelection === 'individual') {
    lines.push('Drinks: Not sure yet');
  }

  if (d.addons.length > 0) {
    const parts = d.addons.map(a => a.qty > 1 ? `${a.label} × ${a.qty}` : a.label);
    lines.push(`Add-ons: ${parts.join(' · ')}`);
  }

  if (d.notes) lines.push(`Notes: ${d.notes}`);

  if (d.pricingStatus === 'estimate_shown' && d.estimateTotal && d.guestCount <= 100 && d.time !== '__outside__') {
    lines.push('');
    lines.push(`Estimate: About ${d.estimateTotal}`);
  }

  if (d.pricingStatus === 'manual_quote_required') lines.push('\nManual quote request — no event estimate included.');
  const policy = bookingPolicy(d.date, d.time, d.foodPackageSlug, now);
  if (policy.shortNotice) lines.push('\n' + shortNoticeMessage(policy, staffRoute || d.pricingStatus === 'manual_quote_required'));
  return lines.join('\n');
}


export function linkedPayload(data: SummaryData, eid: string, submittedAt: string) {
  const build = canonicalBuild(data);
  let notes = data.notes || null;
  if (data.time === '__outside__' && data.outsideHoursTime) {
    notes = 'Requested time: ' + data.outsideHoursTime + (notes ? '\n' + notes : '');
  }
  return {
    eid, source: 'zite-builder' as const, submitted_at: submittedAt, ...build,
    pricing_status: data.pricingStatus,
    ...(data.manualReason ? { manual_reason: data.manualReason } : {}),
    estimate: data.pricingStatus === 'estimate_shown' && data.estimateNum !== null
      ? { total: data.estimateNum, deposit: data.depositNum ?? 0, lane_label: data.laneLabel ?? '', input_fingerprint: data.inputFingerprint }
      : null,
    notes,
  };
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function SendSummarySheet({ data, eid, onClose }: Props) {
  const [sendState, setSendState] = useState<SendState>('idle');
  const [copied, setCopied] = useState(false);
  const policyNow = useEventClock(data.date, data.time);
  const [sendError, setSendError] = useState('');
  const frozenPayload = useRef<ReturnType<typeof linkedPayload> | null>(null);
  const expired = sendState !== 'success' ? reviewError(data) : '';
  const summary = expired ? expired : buildSummaryText(data, false, policyNow);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = summary;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [summary]);

  const smsHref = `sms:${PHONE}?&body=${encodeURIComponent(summary)}`;

  const isOver100 = data.guestCount > 100;
  const isOutsideHours = data.time === '__outside__';

  const handleSubmitLinked = useCallback(async () => {
    if (sendState === 'sending' || sendState === 'success') return;
    const expired = reviewError(data);
    if (expired) { setSendError(expired); return; }
    frozenPayload.current ??= linkedPayload(data, eid, new Date().toISOString());
    const payload = frozenPayload.current;
    const error = pricingContractError(payload);
    if (error) { setSendError(error); return; }
    setSendError('');
    setSendState('sending');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const expired = reviewError(data);
        if (expired) { setSendError(expired); setSendState('idle'); return; }
        await builderSubmit(payload);
        setSendState('success');
        return;
      } catch (err) {
        const e = err as { code?: string; userFacingMessage?: string; message?: string };
        if (e.code === 'BAD_REQUEST' || /recalculate|refreshed|tomorrow/i.test(e.userFacingMessage || e.message || '')) {
          setSendError(e.userFacingMessage || RECALCULATE_MESSAGE);
          setSendState('idle');
          return;
        }
        if (attempt === 1) { setSendState('failure'); }
      }
    }
  }, [sendState, eid, data]);

  return (
    <div className="fixed inset-0 z-50 bg-tp-ground overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-lg mx-auto px-5 py-8">
        {/* Close — hidden during sending */}
        {sendState !== 'sending' && (
          <div className="flex justify-end mb-6">
            <button
              onClick={onClose}
              className="w-[44px] h-[44px] rounded-full border border-tp-warm/[0.16] flex items-center justify-center text-tp-warm/[0.60] hover:text-tp-warm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-tp-glow"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {(expired || sendError) && <p role="alert" className="font-body text-[15px] text-tp-copper mb-5">{expired || sendError}</p>}
        {/* ── SUCCESS state ──────────────────────────────────────────── */}
        {sendState === 'success' && (
          <>
            <div className="text-center pt-6 pb-6">
              <div className="w-14 h-14 rounded-full bg-tp-glow flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-tp-ground" />
              </div>
              <h2 className="font-heading text-[24px] font-black text-tp-warm uppercase leading-none mb-2">Sent</h2>
              <p className="font-body text-[15px] text-tp-warm/[0.72] max-w-[320px] mx-auto">
                Request sent. We'll confirm availability and reply with the next steps by text or email.
              </p>
            </div>

            {/* Summary */}
            <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-4 mb-6">
              <pre className="font-body text-[14px] text-tp-warm/[0.92] whitespace-pre-wrap leading-relaxed">
                {summary}
              </pre>
            </div>

            {/* Copy only — no "text it to us" on success */}
            <button
              onClick={handleCopy}
              className="w-full rounded-[7px] py-3 border border-tp-warm/[0.16] text-tp-warm font-label text-[15px] font-bold min-h-[48px] flex items-center justify-center gap-2 hover:border-tp-warm/[0.30] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-tp-glow"
            >
              {copied ? (
                <><Check className="w-4 h-4" /> Copied ✓</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy to clipboard</>
              )}
            </button>

            <p className="font-body text-[13px] text-tp-warm/[0.55] text-center mt-5">
              We'll confirm everything by text or email.
            </p>
          </>
        )}

        {/* ── FAILURE state ──────────────────────────────────────────── */}
        {sendState === 'failure' && (
          <>
            <h2 className="font-heading text-[24px] font-black text-tp-warm uppercase leading-none mb-1">Hmm</h2>
            <p className="font-body text-[15px] text-tp-warm/[0.72] mb-5">
              That didn't go through — here are your event details; copy it or text it to us and we'll take it from there.
            </p>

            <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-4 mb-6">
              <pre className="font-body text-[14px] text-tp-warm/[0.92] whitespace-pre-wrap leading-relaxed">
                {summary}
              </pre>
            </div>

            <div className="space-y-3">
              {!expired && <button onClick={handleSubmitLinked} className="w-full rounded-[7px] py-3 bg-tp-glow text-tp-ground font-label font-bold min-h-[48px]">Try sending again</button>}
              <button
                onClick={handleCopy}
                className="w-full rounded-[7px] py-3 bg-tp-glow text-tp-ground font-label text-[15px] font-bold min-h-[48px] flex items-center justify-center gap-2 active:bg-tp-glow/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-tp-warm"
              >
                {copied ? (
                  <><Check className="w-4 h-4" /> Copied ✓</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy to clipboard</>
                )}
              </button>
              <a
                href={smsHref}
                className="w-full rounded-[7px] py-3 border border-tp-warm/[0.16] text-tp-warm font-label text-[15px] font-bold min-h-[48px] flex items-center justify-center gap-2 hover:border-tp-warm/[0.30] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-tp-glow"
              >
                <MessageCircle className="w-4 h-4" />
                Text it to us
              </a>
            </div>

            <p className="font-body text-[13px] text-tp-warm/[0.55] text-center mt-5">
              We'll confirm everything by text or email.
            </p>
          </>
        )}

        {/* ── IDLE / SENDING state (pre-send confirmation) ───────────── */}
        {(sendState === 'idle' || sendState === 'sending') && (
          <>
            <h2 className="font-heading text-[28px] font-black text-tp-warm uppercase leading-none mb-1">Your event submission</h2>
            <p className="font-body text-[15px] text-tp-warm/[0.72] mb-5">
              Review your selections and estimate before sending your request.
            </p>

            <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-4 mb-6">
              <pre className="font-body text-[14px] text-tp-warm/[0.92] whitespace-pre-wrap leading-relaxed">
                {summary}
              </pre>
            </div>

            <button
              onClick={handleSubmitLinked}
              disabled={sendState === 'sending' || !!expired || !!sendError}
              className="w-full rounded-[7px] py-3 bg-tp-glow text-tp-ground font-label text-[15px] font-bold min-h-[48px] flex items-center justify-center gap-2 active:bg-tp-glow/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-tp-warm disabled:bg-tp-glow/50 disabled:cursor-not-allowed"
            >
              {sendState === 'sending' ? (
                <>
                  <div className="w-4 h-4 border-2 border-tp-ground border-t-transparent rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                data.pricingStatus === 'estimate_shown' ? 'Send request with this estimate' : 'Ask our team for a quote'
              )}
            </button>

            <p className="font-body text-[13px] text-tp-warm/[0.55] text-center mt-5">
              We'll confirm everything by text or email.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
