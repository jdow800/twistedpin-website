import { useState } from 'react';
import { ChevronDown, Circle, CheckCircle2 } from 'lucide-react';
import SpacePhoto from './SpacePhoto';
import { allowsManualQuote, shortNoticeMessage, type BookingPolicy } from '../../lib/builderContract';
import { type EstimateResponse, type EstimateOption, BUILDER_ADDON_GROUPS } from '../../data/builderData';

type Props = {
  response: EstimateResponse | null;
  bookingPolicy: BookingPolicy;
  staffRoute?: boolean;
  activeOption: string;
  isStale: boolean;
  isCalculating: boolean;
  pricingFailures?: number;
  onOptionChange: (opt: string) => void;
  onRecalculate: () => void;
  canCalculate: boolean;
  disabledMessage?: string;
  onNeighborTap: (guestCount: number) => void;
  onSend?: () => void;
  selectedAddons?: Record<string, number>;
  missingFields?: { label: string; done: boolean; scrollTo: string }[];
};

function formatDollars(n: number): string {
  return n >= 1000 ? `$${n.toLocaleString('en-US')}` : `$${n}`;
}

/* Skeleton for the loading state */
function EstimateSkeleton() {
  return (
    <div className="bg-tp-raised border-l-[3px] border-l-tp-glow rounded-[12px] p-5 space-y-4 animate-pulse">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex justify-between items-center py-2">
          <div className="h-4 bg-tp-warm/[0.08] rounded w-2/5" />
          <div className="h-4 bg-tp-warm/[0.08] rounded w-16" />
        </div>
      ))}
      <div className="flex justify-between items-baseline pt-3 border-t border-tp-warm/[0.10]">
        <div className="h-3 bg-tp-warm/[0.08] rounded w-24" />
        <div className="h-10 bg-tp-warm/[0.08] rounded w-32" />
      </div>
    </div>
  );
}

export default function EstimatePanel({ response, bookingPolicy, staffRoute = false, activeOption, isStale, isCalculating, pricingFailures = 0, onOptionChange, onRecalculate, canCalculate, disabledMessage, onNeighborTap, onSend, selectedAddons, missingFields }: Props) {
  const [addonsExpanded, setAddonsExpanded] = useState(false);

  // ── State: Loading ─────────────────────────────────────────────────
  if (isCalculating) {
    return (
      <section id="estimate-panel">
        <p className="font-label text-[12px] font-bold tracking-[3px] text-tp-warm/[0.60] uppercase mb-1">Step 6</p>
        <h2 className="font-heading text-[34px] font-black text-tp-warm uppercase leading-none mb-4">Your Estimate</h2>
        <EstimateSkeleton />
      </section>
    );
  }

  // ── State: Pre-calculate — show checklist of what's needed ──────────
  if (!response) {
    if (!missingFields || missingFields.length === 0) return null;
    const allItems = [
      { label: 'A date', done: !missingFields.some(f => f.label === 'A date'), scrollTo: 'step-when' },
      { label: 'A start time', done: !missingFields.some(f => f.label === 'A start time'), scrollTo: 'step-when' },
      { label: 'A food package', done: !missingFields.some(f => f.label === 'A food package'), scrollTo: 'step-food' },
    ];
    const remaining = allItems.filter(i => !i.done).length;
    return (
      <section id="estimate-panel">
        <p className="font-label text-[12px] font-bold tracking-[3px] text-tp-warm/[0.60] uppercase mb-1">Step 6</p>
        <h2 className="font-heading text-[34px] font-black text-tp-warm uppercase leading-none mb-4">Your Estimate</h2>
        <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-5">
          <p className="font-body text-[15px] text-tp-warm/[0.92] mb-4">
            {remaining === 1 ? 'One thing left' : `${remaining} things left`} and we'll price it:
          </p>
          <ul className="space-y-3">
            {allItems.map(item => (
              <li key={item.label}>
                <button
                  onClick={() => {
                    if (item.done) return;
                    document.getElementById(item.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`flex items-center gap-3 w-full text-left ${item.done ? '' : 'cursor-pointer'}`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-5 h-5 text-tp-glow flex-shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-tp-warm/[0.60] flex-shrink-0" />
                  )}
                  <span className={`font-body text-[15px] ${item.done ? 'text-tp-warm/[0.55] line-through' : 'text-tp-warm'}`}>
                    {item.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  // ── State: Error ───────────────────────────────────────────────────
  if (!response.ok) {
    return (
      <section id="estimate-panel">
        <p className="font-label text-[12px] font-bold tracking-[3px] text-tp-warm/[0.60] uppercase mb-1">Step 6</p>
        <h2 className="font-heading text-[34px] font-black text-tp-warm uppercase leading-none mb-4">Your Estimate</h2>
        <div className="bg-tp-raised border-l-[3px] border-l-tp-copper rounded-[12px] p-5">
          <p className="font-body text-[15px] text-tp-warm/[0.92] mb-4">
            {allowsManualQuote(response.code)
              ? (pricingFailures >= 2
                ? 'Pricing is still unavailable. Try again, or ask our team for a quote without an estimate.'
                : "We couldn't get your estimate. Please retry.")
              : response.message || "That estimate is unavailable. Check your selections and try again."}
          </p>
          {!canCalculate && disabledMessage && (
            <p className="font-body text-[14px] text-tp-copper mb-3">{disabledMessage}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRecalculate}
              disabled={!canCalculate}
              className="bg-tp-glow text-tp-ground rounded-[7px] px-5 py-3 font-label text-sm font-bold min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-tp-warm"
            >
              Retry
            </button>
            {onSend && (
              <button
                onClick={onSend}
                className="border border-tp-warm/[0.16] text-tp-warm rounded-[7px] px-5 py-3 font-label text-sm font-bold min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-tp-glow"
              >
                Ask our team for a quote
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  const options = response.options;
  const currentOpt = options[activeOption as keyof typeof options] as EstimateOption;
  const currentLane = activeOption.startsWith('vip_') ? 'vip' : 'trad';
  const currentHours = activeOption.endsWith('_3h') ? 3 : 2;
  const { planned_for, deposit_shown, notices, neighbors, regime } = response;
  const spaces = [
    { prefix: 'vip', space: 'vip' as const, title: 'VIP Suite', description: 'Couches and tables.' },
    { prefix: 'trad', space: 'traditional' as const, title: 'Traditional lanes', description: 'Shared bowling space.' },
  ];

  const toggleActive = 'bg-tp-raised border-tp-glow shadow-[0_0_0_1px_#4EECC4] text-tp-warm';
  const toggleInactive = 'bg-tp-surface border-tp-warm/[0.16] text-tp-warm/[0.72]';

  return (
    <section id="estimate-panel">
      <p className="font-label text-[12px] font-bold tracking-[3px] text-tp-warm/[0.60] uppercase mb-1">Step 6</p>
      <h2 className="font-heading text-[34px] font-black text-tp-warm uppercase leading-none mb-3">Your Estimate</h2>

      {isStale && (
        <div className="bg-tp-surface border-l-[3px] border-l-tp-copper rounded-[10px] p-3 mb-4" role="status">
          <p className="font-body text-[14px] text-tp-copper">
            Update estimate to see current prices. Amounts below are from your previous estimate.
          </p>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={!canCalculate}
            className="mt-2 min-h-[44px] px-3 rounded-[7px] border border-tp-copper text-tp-warm font-label text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tp-glow"
          >
            Update estimate
          </button>
          {!canCalculate && disabledMessage && <p className="font-body text-[13px] text-tp-warm/[0.72] mt-2">{disabledMessage}</p>}
        </div>
      )}

      {/* One length control keeps both space prices comparable. A change never picks a different space. */}
      <div className="mb-3">
        <p className="font-label text-[14px] font-bold text-tp-warm mb-2">Compare spaces</p>
        <div role="group" aria-label="Compare event length" className="grid grid-cols-2 gap-2">
          {([2, 3] as const).map(hours => {
            const hasEstimate = !!(options[`vip_${hours}h`] || options[`trad_${hours}h`]);
            return (
              <button
                key={hours}
                type="button"
                aria-pressed={currentHours === hours}
                aria-label={`${hours} hours`}
                disabled={!hasEstimate}
                onClick={() => onOptionChange(`${currentLane}_${hours}h`)}
                className={`border rounded-[7px] px-3 py-2 min-h-[44px] font-label text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tp-glow disabled:opacity-50 disabled:cursor-not-allowed ${currentHours === hours ? toggleActive : toggleInactive}`}
              >
                {hours} hours
                {!hasEstimate && <span className="block font-body text-[12px] font-normal">No estimate</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-2" role="group" aria-label="Choose your space">
        {spaces.map(space => {
          const key = `${space.prefix}_${currentHours}h`;
          const option = options[key as keyof typeof options];
          const selected = activeOption === key;
          return (
            <article
              key={space.prefix}
              className={`min-w-0 rounded-[12px] border overflow-hidden ${selected ? toggleActive : toggleInactive}`}
            >
              <SpacePhoto space={space.space} compact />
              <button
                type="button"
                data-space-option
                aria-label={`Choose ${space.title} for ${currentHours} hours`}
                aria-describedby={`estimate-${space.prefix}-description estimate-${space.prefix}-price`}
                aria-pressed={selected}
                disabled={!option}
                onClick={() => onOptionChange(key)}
                className="w-full text-left p-3 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tp-glow disabled:cursor-not-allowed"
              >
                <span className="block font-label text-[14px] leading-snug font-bold text-tp-warm min-h-[36px]">{space.title}</span>
                <span id={`estimate-${space.prefix}-description`} className="block font-body text-[13px] leading-snug text-tp-warm/[0.72] mt-1 min-h-[34px]">{space.description}</span>
                {option ? (
                  <>
                    <span className={`block font-body text-[12px] mt-3 ${isStale ? 'text-tp-copper' : 'text-tp-warm/[0.72]'}`}>
                      {isStale ? 'Previous estimate' : 'Estimated total'}
                    </span>
                    <span id={`estimate-${space.prefix}-price`} className={`block font-label text-[21px] font-bold leading-tight mt-0.5 ${isStale ? 'text-tp-warm/[0.60]' : 'text-tp-warm'}`}>
                      {isStale && <span className="sr-only">Previous estimate: </span>}
                      {formatDollars(option.total)}
                    </span>
                    <span className={`flex items-center gap-1.5 mt-3 font-label text-[12px] font-bold ${selected ? 'text-tp-glow' : 'text-tp-warm'}`}>
                      {selected ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> : <Circle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
                      {selected ? 'Selected' : 'Choose this space'}
                    </span>
                  </>
                ) : (
                  <span id={`estimate-${space.prefix}-price`} className="block font-body text-[13px] text-tp-copper mt-3">
                    {selected && <span className="block font-label text-[12px] font-bold mb-1">Selected</span>}
                    No estimate for {currentHours} hours
                  </span>
                )}
              </button>
              {option?.notice && <p className="px-3 pb-3 font-body text-[12px] text-tp-copper">{option.notice}</p>}
            </article>
          );
        })}
      </div>
      <p className="font-body text-[13px] text-tp-warm/[0.72] mb-4">
        {isStale ? 'Previous totals' : 'Totals'} include your food and extras, sales tax and the Event Service Fee.
      </p>

      {/* Keep every API notice, including notices for comparisons that cannot be priced. */}
      {notices.length > 0 && (
        <div className="mb-4 space-y-2">
          {notices.map((notice, i) => (
            <p key={i} className="font-body text-[14px] text-tp-warm/[0.92] bg-tp-surface border border-tp-warm/[0.16] rounded-[10px] p-3">
              {notice}
            </p>
          ))}
        </div>
      )}

      {!currentOpt ? (
        <div className="bg-tp-surface border-l-[3px] border-l-tp-copper rounded-[12px] p-4">
          <p className="font-body text-[15px] text-tp-warm/[0.92]">
            Your selected option has no estimate. Choose another space or event length above, or change the event details.
          </p>
        </div>
      ) : (
        <div className={`bg-tp-raised border-l-[3px] rounded-[12px] p-4 sm:p-5 ${isStale ? 'border-l-tp-copper' : 'border-l-tp-glow'}`}>
          <p className="font-label text-[13px] font-bold text-tp-warm">
            {currentLane === 'vip' ? 'VIP Suite' : 'Traditional lanes'} · {currentOpt.hours} hours · up to {planned_for} guests
          </p>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-3">
            <span className="font-label text-[12px] font-bold tracking-[1px] text-tp-warm/[0.72] uppercase">
              {isStale ? 'Previous event total' : 'Event total'}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-label text-[13px] text-tp-warm/[0.72]">About</span>
              <span className={`font-heading text-[44px] font-black leading-none ${isStale ? 'text-tp-warm/[0.60]' : 'text-tp-glow'}`}>
                {formatDollars(currentOpt.total)}
              </span>
            </span>
          </div>
          <p className="font-body text-[13px] text-tp-warm/[0.72] mt-2">
            Includes sales tax and the Event Service Fee.
          </p>

          <div className="mt-4 border-t border-tp-warm/[0.10]">
            {currentOpt.lines.map(line => {
              const isAddons = line.key === 'addons' && selectedAddons && line.items && line.items.length > 0;
              // Existing per-item display only. The API owns every ledger amount and total.
              const addonBreakdown = isAddons
                ? Object.entries(selectedAddons)
                  .filter(([, qty]) => qty > 0)
                  .map(([key, qty]) => {
                    const def = BUILDER_ADDON_GROUPS.flatMap(group => group.addons).find(addon => addon.key === key);
                    return def ? { label: def.label, qty, lineCost: def.priceNum * qty } : null;
                  })
                  .filter(Boolean) as { label: string; qty: number; lineCost: number }[]
                : [];
              const rowContent = (
                <>
                  <span className="flex items-start gap-1.5 min-w-0">
                    <span className="font-label text-[14px] font-bold text-tp-warm">{line.label}</span>
                    {isAddons && <ChevronDown aria-hidden="true" className={`w-4 h-4 mt-0.5 flex-shrink-0 text-tp-warm/[0.72] transition-transform ${addonsExpanded ? 'rotate-180' : ''}`} />}
                  </span>
                  <span className="font-label text-[15px] font-bold text-tp-warm flex-shrink-0">{formatDollars(line.amount)}</span>
                </>
              );
              return (
                <div key={line.key} className="py-3 border-b border-tp-warm/[0.10]">
                  {isAddons ? (
                    <button
                      type="button"
                      onClick={() => setAddonsExpanded(value => !value)}
                      aria-expanded={addonsExpanded}
                      aria-controls="estimate-addon-details"
                      className="flex justify-between gap-3 w-full text-left min-h-[44px] items-center rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tp-glow"
                    >
                      {rowContent}
                    </button>
                  ) : <div className="flex justify-between gap-3">{rowContent}</div>}
                  {isAddons ? (
                    <div id="estimate-addon-details" hidden={!addonsExpanded} className="pt-2 space-y-2">
                      {line.sub && <p className="font-body text-[13px] text-tp-warm/[0.72]">{line.sub}</p>}
                      <p className="font-body text-[13px] text-tp-warm/[0.72]">{line.items?.join(' · ')}</p>
                      {addonBreakdown.map(item => (
                        <div key={item.label} className="flex justify-between gap-3 font-body text-[13px] text-tp-warm/[0.72]">
                          <span>{item.label}{item.qty > 1 ? ` × ${item.qty}` : ''}</span>
                          <span className="flex-shrink-0">{formatDollars(item.lineCost)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (line.sub || (line.items && line.items.length > 0)) && (
                    <details className="mt-1">
                      <summary className="font-body text-[13px] text-tp-copper cursor-pointer py-3 min-h-[44px] rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tp-glow">
                        What's included
                      </summary>
                      {line.sub && <p className="font-body text-[13px] text-tp-warm/[0.72]">{line.sub}</p>}
                      {line.items && line.items.length > 0 && <p className="font-body text-[13px] text-tp-warm/[0.72] mt-1">{line.items.join(' · ')}</p>}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Always visible: an estimate is a request, never a reservation. */}
      <p className="font-body text-[14px] text-tp-warm/[0.92] mt-4">
        {deposit_shown
          ? "Sending a request does not reserve your event. We'll confirm availability and reply by text or email."
          : shortNoticeMessage(bookingPolicy, staffRoute) + ' Sending a request does not reserve your event.'}
      </p>

      {!isStale && currentOpt && neighbors.length > 0 && (
        <div className="mt-4 bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-4">
          <p className="font-label text-[12px] font-bold tracking-[2px] text-tp-warm/[0.60] uppercase mb-2">If your count moves</p>
          <div className="font-body text-[14px] text-tp-warm flex flex-wrap gap-x-2 gap-y-1">
            {neighbors.map((neighbor, i) => (
              <span key={i}>
                {i > 0 && <span className="text-tp-warm/[0.60] mr-2">·</span>}
                <button
                  type="button"
                  onClick={() => onNeighborTap(neighbor.guests)}
                  className="text-tp-copper underline py-3 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tp-glow rounded-[4px]"
                >
                  {neighbor.guests} → about {formatDollars(neighbor.total)}
                </button>
                {neighbor.lane_label !== currentOpt.lane_label && <span className="text-[13px] text-tp-warm/[0.72] ml-1">({neighbor.lane_label})</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {!isStale && deposit_shown && (
        <details className="mt-4 bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] px-4">
          <summary className="font-label text-[14px] font-bold text-tp-warm cursor-pointer py-4 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tp-glow rounded-[4px]">
            Booking and payment details
          </summary>
          <div className="pb-4 space-y-3 font-body text-[14px] text-tp-warm/[0.72]">
            <p>After we confirm availability, we'll send your deposit link. A 50% deposit reserves your date, time and space and applies to your final balance.</p>
            <p>Final headcount and balance are due 7 days before your event. We'll reach out to confirm your numbers. Add-ons can be adjusted until then.</p>
            <p>Plan around your expected maximum. You can size down until we finalize; growing depends on the space available.</p>
          </div>
        </details>
      )}
      {!isStale && !deposit_shown && (
        <p className="mt-3 font-body text-[13px] text-tp-warm/[0.72]">
          {currentOpt ? 'Full payment at booking: about ' + formatDollars(currentOpt.total) + '. ' : ''}Confirm your final guest count before payment.
        </p>
      )}
      {regime === 'traditional_only' && (
        <p className="mt-3 font-body text-[13px] text-tp-warm/[0.72] bg-tp-surface border border-tp-warm/[0.16] rounded-[10px] p-3">
          {isStale ? 'Your previous estimate used' : 'Estimates at this size use'} the traditional lanes. We'll confirm the exact layout and whether the VIP Suite can be part of it.
        </p>
      )}
    </section>
  );
}
