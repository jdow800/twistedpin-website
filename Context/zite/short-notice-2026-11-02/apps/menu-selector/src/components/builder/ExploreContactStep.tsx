import { useState, useCallback, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { exploreSubmit } from 'zitejs/api';
import { buildSummaryText, linkedPayload, type SummaryData } from './SendSummarySheet';

import { reviewError, pricingContractError, RECALCULATE_MESSAGE, REQUEST_SENT_MESSAGE } from '../../lib/builderContract';
import { useEventClock } from '../../lib/useEventClock';

type Props = {
  data: SummaryData;
  onClose: () => void;
};

type SendState = 'idle' | 'sending' | 'locked';

export default function ExploreContactStep({ data, onClose }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sendState, setSendState] = useState<SendState>('idle');
  const [validationError, setValidationError] = useState('');

  const policyNow = useEventClock(data.date, data.time);
  const submittedAt = useRef<string | null>(null);
  const frozenPayload = useRef<Parameters<typeof exploreSubmit>[0] | null>(null);
  const expired = sendState !== 'locked' ? reviewError(data) : '';
  const summary = expired || buildSummaryText(data, true, policyNow);
  const editContact = () => {
    // A deliberate contact correction starts a new logical attempt; ordinary retries reuse the same payload.
    frozenPayload.current = null;
    submittedAt.current = null;
    setValidationError('');
  };

  const handleSubmit = useCallback(async () => {
    if (sendState === 'sending' || sendState === 'locked') return;

    if (!firstName.trim()) { setValidationError('First name is required.'); return; }
    if (!lastName.trim()) { setValidationError('Last name is required.'); return; }
    if (!phone.trim()) { setValidationError('Phone number is required.'); return; }
    if (!email.trim()) { setValidationError('Email is required.'); return; }

    const expired = reviewError(data);
    if (expired) { setValidationError(expired); return; }
    submittedAt.current ??= new Date().toISOString();
    const pricing = linkedPayload(data, '', submittedAt.current);
    const error = pricingContractError(pricing);
    if (error) { setValidationError(error); return; }
    setValidationError('');
    setSendState('sending');

    const barMap: Record<string, string> = {
      '10_card': '10_card',
      '15_card': '15_card',
      'own_tab': 'own_tab',
      'individual': 'individual',
      'none': 'none',
    };

    try {
      // Build notes with outside-hours time prepended if applicable
      let finalNotes = data.notes;
      if (data.time === '__outside__' && data.outsideHoursTime) {
        const timeLine = `Requested time: ${data.outsideHoursTime}`;
        finalNotes = data.notes ? `${timeLine}\n${data.notes}` : timeLine;
      }

      frozenPayload.current ??= {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        date: data.date,
        time: data.time,
        duration: data.duration,
        guestCount: data.guestCount,
        laneType: data.laneType,
        foodPackage: data.foodPackage,
        foodEstimate: data.foodEstimate,
        barSelection: barMap[data.barSelection] ?? data.barSelection,
        barQty: data.barQty,
        addons: data.addons.map(a => ({ label: a.label, slug: a.slug, qty: a.qty })),
        foodPackageSlug: data.foodPackageSlug,
        pricing_status: pricing.pricing_status,
        manual_reason: pricing.manual_reason,
        estimate: pricing.estimate,
        submitted_at: pricing.submitted_at,
        notes: finalNotes,
        estimateTotal: data.estimateTotal,
      };
      await exploreSubmit(frozenPayload.current);
      setSendState('locked');
    } catch (err) {
      setSendState('idle');
      const e = err as { code?: string; userFacingMessage?: string; message?: string };
      setValidationError(e.code === 'BAD_REQUEST' || /recalculate|refreshed|tomorrow/i.test(e.userFacingMessage || e.message || '')
        ? e.userFacingMessage || RECALCULATE_MESSAGE
        : "That didn't go through. Try again, or call the venue at (815) 782-7790.");
    }
  }, [sendState, firstName, lastName, phone, email, data]);

  /* ── SUCCESS ──────────────────────────────────────────────────────── */
  if (sendState === 'locked') {
    return (
      <div className="fixed inset-0 z-50 bg-tp-ground overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-lg mx-auto px-5 py-8">
          <div className="text-center pt-10 pb-6">
            <div className="w-14 h-14 rounded-full bg-tp-glow flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-tp-ground" />
            </div>
            <h2 className="font-heading text-[24px] font-black text-tp-warm uppercase leading-none mb-2">We got it!</h2>
            <p className="font-body text-[15px] text-tp-warm/[0.72] max-w-[320px] mx-auto">
              {REQUEST_SENT_MESSAGE}
            </p>
          </div>
          <p className="font-body text-[13px] text-tp-warm/[0.55] text-center mt-5">
            Check your email and phone for our response. This request does not reserve your event.
          </p>
        </div>
      </div>
    );
  }

  /* ── CONTACT FORM ────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-tp-ground overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-lg mx-auto px-5 py-8">
        {/* Close */}
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

        <h2 className="font-heading text-[24px] font-black text-tp-warm uppercase leading-none mb-1">Review your request</h2>
        <p className="font-body text-[15px] text-tp-warm/[0.72] mb-6">
          Review your selections below and tell us how to reach you.
        </p>

        {/* Menu summary */}
        <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-4 mb-6">
          <pre className="font-body text-[14px] text-tp-warm/[0.92] whitespace-pre-wrap leading-relaxed">
            {summary}
          </pre>
        </div>

        {/* YOUR INFO header */}
        <p className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase mb-3">Your Info</p>

        {/* Name row */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase block mb-1">First name *</label>
            <input
              type="text"
              value={firstName}
              onChange={e => { editContact(); setFirstName(e.target.value); }}
              disabled={sendState === 'sending'}
              className="w-full bg-tp-well border border-tp-warm/[0.16] rounded-[7px] px-4 py-3 font-body text-[16px] text-tp-warm placeholder:text-tp-warm/[0.30] outline-none focus:border-tp-warm/[0.40] transition-colors"
              placeholder="First"
            />
          </div>
          <div className="flex-1">
            <label className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase block mb-1">Last name *</label>
            <input
              type="text"
              value={lastName}
              onChange={e => { editContact(); setLastName(e.target.value); }}
              disabled={sendState === 'sending'}
              className="w-full bg-tp-well border border-tp-warm/[0.16] rounded-[7px] px-4 py-3 font-body text-[16px] text-tp-warm placeholder:text-tp-warm/[0.30] outline-none focus:border-tp-warm/[0.40] transition-colors"
              placeholder="Last"
            />
          </div>
        </div>

        {/* Phone */}
        <div className="mb-4">
          <label className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase block mb-1">Phone *</label>
          <input
            type="tel"
            value={phone}
            onChange={e => { editContact(); setPhone(e.target.value); }}
              disabled={sendState === 'sending'}
            className="w-full bg-tp-well border border-tp-warm/[0.16] rounded-[7px] px-4 py-3 font-body text-[16px] text-tp-warm placeholder:text-tp-warm/[0.30] outline-none focus:border-tp-warm/[0.40] transition-colors"
            placeholder="(555) 555-5555"
          />
        </div>

        {/* Email */}
        <div className="mb-5">
          <label className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase block mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={e => { editContact(); setEmail(e.target.value); }}
              disabled={sendState === 'sending'}
            className="w-full bg-tp-well border border-tp-warm/[0.16] rounded-[7px] px-4 py-3 font-body text-[16px] text-tp-warm placeholder:text-tp-warm/[0.30] outline-none focus:border-tp-warm/[0.40] transition-colors"
            placeholder="you@example.com"
          />
        </div>

        {/* Validation error */}
        {(expired || validationError) && (
          <p className="font-body text-[14px] text-red-400 mb-4">{expired || validationError}</p>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={sendState === 'sending' || !!expired}
          className="w-full rounded-[7px] py-3 bg-tp-glow text-tp-ground font-label text-[15px] font-bold min-h-[48px] flex items-center justify-center gap-2 active:bg-tp-glow/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-tp-warm disabled:bg-tp-glow/50 disabled:cursor-not-allowed"
        >
          {sendState === 'sending' ? (
            <>
              <div className="w-4 h-4 border-2 border-tp-ground border-t-transparent rounded-full animate-spin" />
              Submitting…
            </>
          ) : (
            data.pricingStatus === 'estimate_shown' ? 'Send request with this estimate' : 'Ask our team for a quote'
          )}
        </button>

        <p className="font-body text-[13px] text-tp-warm/[0.55] text-center mt-5">
          Our team will review your request and confirm availability and payment details.
        </p>
      </div>
    </div>
  );
}
