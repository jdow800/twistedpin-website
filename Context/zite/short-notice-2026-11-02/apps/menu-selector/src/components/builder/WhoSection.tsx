import { useEffect, useState } from 'react';
import { normalizeGuestCount, OVER_100, useNumericDraft } from '../../lib/builderEditing';
import { type VipBands } from '../../data/builderData';

import SpacePhoto from './SpacePhoto';

type Props = {
  guestCount: number;
  laneType: 'vip' | 'traditional';
  bands: VipBands;
  onGuestCount: (n: number) => void;
  onLaneType: (t: 'vip' | 'traditional') => void;
  traditionalDelta: string | null;
  daysUntilEvent: number | null;
};

const STEPS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105];

function stepUp(n: number): number {
  const idx = STEPS.indexOf(n);
  if (idx < 0) return STEPS[0];
  return idx < STEPS.length - 1 ? STEPS[idx + 1] : n;
}
function stepDown(n: number): number {
  const idx = STEPS.indexOf(n);
  if (idx < 0) return STEPS[0];
  return idx > 0 ? STEPS[idx - 1] : n;
}

export default function WhoSection({
  guestCount, laneType, bands,
  onGuestCount, onLaneType, traditionalDelta, daysUntilEvent,
}: Props) {
  const isOver100 = guestCount >= OVER_100;
  const [roundedCount, setRoundedCount] = useState<number | null>(null);
  useEffect(() => { setRoundedCount(previous => previous === guestCount ? previous : null); }, [guestCount]);
  const roundingMessage = roundedCount === guestCount ? 'Rounded up to ' + guestCount + ' guests for this estimate.' : '';
  const input = useNumericDraft(guestCount, normalizeGuestCount, (count, raw) => {
    setRoundedCount(raw > 100 || raw === count ? null : count);
    onGuestCount(count);
  });
  const changeStep = (direction: 'up' | 'down') => {
    const committed = input.commit();
    setRoundedCount(null);
    onGuestCount(direction === 'up' ? stepUp(committed) : stepDown(committed));
  };
  const countHelp = daysUntilEvent === null
    ? 'Plan around your expected maximum.'
    : daysUntilEvent < 10
      ? 'Use your final expected guest count. For events within nine days, we confirm that count and collect full payment at booking.'
      : 'Plan around your expected maximum. Before finalization and final payment, you can reduce your headcount until seven days before your event. Increasing it later depends on available space.';

  // Lane type visibility rules
  const showLanes = guestCount < OVER_100;
  const showVip = guestCount <= bands.vipCeiling;
  const vipGreyed = guestCount >= bands.tradOnlyFloor && guestCount <= bands.vipCeiling;
  const tradOnly = guestCount > bands.vipCeiling;

  /* Selection ring classes */
  const selectedCls = 'bg-tp-raised border-tp-glow shadow-[0_0_0_2px_#4EECC4]';
  const unselectedCls = 'bg-tp-surface border-tp-warm/[0.16]';

  return (
    <section>
      <p className="font-label text-[12px] font-bold tracking-[3px] text-tp-warm/[0.60] uppercase mb-1">Step 2</p>
      <h2 className="font-heading text-[34px] font-black text-tp-warm uppercase leading-none mb-4">Who</h2>

      <div className="space-y-3">
        {/* Guest stepper — typeable */}
        <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[10px] p-4">
          <p className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase mb-3">Planned for up to</p>
          <div className="flex items-center justify-center gap-4">
            <button
              onPointerDown={event => event.preventDefault()}
              onClick={() => changeStep('down')}
              disabled={input.proposedValue <= 10}
              className="w-[56px] h-[44px] rounded-[7px] bg-tp-raised border border-tp-warm/[0.16] flex items-center justify-center text-tp-warm text-[19px] font-label font-bold disabled:opacity-30 transition-all active:shadow-[0_0_0_2px_#4EECC4] active:duration-150 flex-shrink-0"
            >−</button>
            {isOver100 ? (
              <span className="font-heading text-[40px] font-black text-tp-warm leading-none">100+</span>
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={input.draft}
                aria-label="Planned guest count"
                onChange={input.onChange}
                onBlur={input.onBlur}
                onKeyDown={input.onKeyDown}
                className="font-heading text-[40px] font-black text-tp-warm leading-none bg-transparent text-center w-[100px] focus:outline-none"
                style={{ fontSize: '40px' }}
              />
            )}
            <button
              onPointerDown={event => event.preventDefault()}
              onClick={() => changeStep('up')}
              disabled={input.proposedValue >= OVER_100}
              className="w-[56px] h-[44px] rounded-[7px] bg-tp-raised border border-tp-warm/[0.16] flex items-center justify-center text-tp-warm text-[19px] font-label font-bold disabled:opacity-30 transition-all active:shadow-[0_0_0_2px_#4EECC4] active:duration-150 flex-shrink-0"
            >+</button>
          </div>
          {roundingMessage && (
            <p role="status" className="font-body text-[13px] text-tp-copper mt-3">{roundingMessage}</p>
          )}
          <p data-testid="headcount-help" className="font-body text-[14px] text-tp-warm/[0.72] mt-3">
            {countHelp}
          </p>
        </div>

        {/* Helper lines */}
        <div className="space-y-1">
          <p className="font-body text-[14px] text-tp-warm/[0.72]">
            We count seats, not bowlers — every guest gets a seat, and bowling rotates.
          </p>
        </div>

        {/* Whole-suite line — 60–75 guests */}
        {guestCount >= 60 && guestCount <= 75 && (
          <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[10px] p-3">
            <p className="font-body text-[14px] text-tp-warm/[0.92] leading-snug">
              Groups of 60 to 75 take the whole suite, all six lanes. The suite opens onto our main bar and beer wall, shared with all our guests, so there's room to spread out when not everyone is bowling.
            </p>
          </div>
        )}

        {/* Lane selection and photo preview are separate actions. */}
        {showLanes && (
          <div className={`grid gap-3 mt-1 ${showVip ? 'grid-cols-2' : 'grid-cols-1'}`} role="group" aria-label="Choose your space">
            {showVip && (
              <div className={`min-w-0 flex flex-col rounded-[10px] border overflow-hidden ${laneType === 'vip' && !vipGreyed ? selectedCls : unselectedCls}`}>
                <SpacePhoto space="vip" />
                <button
                  type="button"
                  onClick={() => !vipGreyed && onLaneType('vip')}
                  disabled={vipGreyed}
                  aria-label="Choose VIP Suite"
                  aria-pressed={laneType === 'vip' && !vipGreyed}
                  className="flex-1 p-3 text-left min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tp-glow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="block font-label text-[16px] font-bold text-tp-warm leading-snug">VIP Suite</span>
                  <span className="block font-body text-[14px] text-tp-warm/[0.80] mt-1 leading-snug">
                    {vipGreyed ? 'Sometimes possible at this size. Ask us.' : 'Couches and tables.'}
                  </span>
                  <span className={`block font-label text-[12px] font-semibold mt-2 ${laneType === 'vip' && !vipGreyed ? 'text-tp-glow' : 'text-tp-warm/[0.72]'}`}>
                    {vipGreyed ? 'Team review needed' : laneType === 'vip' ? 'Selected' : 'Choose VIP Suite'}
                  </span>
                </button>
              </div>
            )}
            <div className={`min-w-0 flex flex-col rounded-[10px] border overflow-hidden ${laneType === 'traditional' || tradOnly ? selectedCls : unselectedCls}`}>
              <SpacePhoto space="traditional" />
              <button
                type="button"
                onClick={() => onLaneType('traditional')}
                aria-label="Choose Traditional lanes"
                aria-pressed={laneType === 'traditional' || tradOnly}
                className="flex-1 p-3 text-left min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tp-glow"
              >
                <span className="block font-label text-[16px] font-bold text-tp-warm leading-snug">Traditional lanes</span>
                <span className="block font-body text-[14px] text-tp-warm/[0.80] mt-1 leading-snug">Shared bowling space.</span>
                {traditionalDelta && laneType !== 'traditional' && !tradOnly && (
                  <span className="block font-label text-[13px] text-tp-copper font-bold mt-1">{traditionalDelta}</span>
                )}
                <span className={`block font-label text-[12px] font-semibold mt-2 ${laneType === 'traditional' || tradOnly ? 'text-tp-glow' : 'text-tp-warm/[0.72]'}`}>
                  {laneType === 'traditional' || tradOnly ? 'Selected' : 'Choose traditional'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export { OVER_100 };
