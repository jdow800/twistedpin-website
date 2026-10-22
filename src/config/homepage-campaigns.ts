import { PROMOS, type Promo } from "./promos.ts";

export const HOMEPAGE_TIME_ZONE = "America/Chicago";
export interface HomepageCampaign {
  id: "nye-mirrorball-2026" | "jingle-2026";
  enabled: boolean;
  publicPageReady: boolean;
  startsAt: string | null;
  endsAt: string | null;
  href: string | null;
  priority: number;
}

/** One promotion owner, independent of sales opening or live inventory.
 * Retirement uses the current final 10pm party / VIP 30-minute cutoff.
 * Traditional closes earlier (60 minutes). Revisit this static retirement if
 * the final party or sales cutoffs change; checkout remains authoritative. */
export const HOMEPAGE_CAMPAIGNS: readonly HomepageCampaign[] = [
  { id: "nye-mirrorball-2026", enabled: true, publicPageReady: true,
    startsAt: "2026-12-07T06:00:00Z", endsAt: "2027-01-01T03:30:00Z", href: "/new-years-eve/", priority: 20 },
  // Jingle's start and retirement remain unselected. Its protected review URL
  // must never become a public promotion just because December has arrived.
  { id: "jingle-2026", enabled: false, publicPageReady: false,
    startsAt: null, endsAt: null, href: null, priority: 10 },
];

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: HOMEPAGE_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit" });
const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: HOMEPAGE_TIME_ZONE, timeZoneName: "longOffset" });
export const homepageDate = (now: number) => dateFormatter.format(new Date(now));

/** Date-only generic promos also use venue midnight, including DST. */
function chicagoMidnight(date: string): number {
  const wall = Date.parse(`${date}T00:00:00Z`);
  let instant = wall;
  for (let pass = 0; pass < 2; pass++) {
    const offset = offsetFormatter.formatToParts(new Date(instant)).find(p => p.type === "timeZoneName")!.value;
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)!;
    instant = wall - (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
  }
  return instant;
}
const dayAfter = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function selectHomepageCampaign(now = Date.now(), campaigns = HOMEPAGE_CAMPAIGNS): HomepageCampaign | null {
  if (!Number.isFinite(now)) return null;
  return campaigns.filter(c => c.enabled && c.publicPageReady && c.href?.startsWith("/") && c.startsAt && c.endsAt
    && now >= Date.parse(c.startsAt) && now < Date.parse(c.endsAt))
    .sort((a, b) => b.priority - a.priority)[0] ?? null;
}

export function homepagePromotions(now = Date.now(), candidates: readonly Promo[] = PROMOS): { campaign: HomepageCampaign | null; promos: Promo[]; nextChange: number | null } {
  if (!Number.isFinite(now)) return { campaign: null, promos: [], nextChange: null };
  const campaign = selectHomepageCampaign(now), today = homepageDate(now);
  const eligible = candidates.filter(p => {
    const target = p.hideOnPath ?? p.href;
    return (target.endsWith("/") ? target : `${target}/`) !== "/";
  });
  const promos = campaign ? [] : eligible.filter(p => (!p.showFrom || today >= p.showFrom) && (!p.showUntil || today <= p.showUntil));
  const boundaries = [
    ...HOMEPAGE_CAMPAIGNS.filter(c => c.enabled && c.publicPageReady).flatMap(c => [c.startsAt, c.endsAt].filter((s): s is string => !!s).map(Date.parse)),
    ...eligible.flatMap(p => [p.showFrom ? chicagoMidnight(p.showFrom) : null, p.showUntil ? chicagoMidnight(dayAfter(p.showUntil)) : null]),
  ].filter((n): n is number => n !== null && Number.isFinite(n) && n > now);
  return { campaign, promos, nextChange: boundaries.length ? Math.min(...boundaries) : null };
}
