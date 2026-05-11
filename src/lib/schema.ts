/**
 * JSON-LD schema utilities. Single source of truth for everything
 * Twisted Pin tells AI assistants and search engines about the venue.
 *
 * Pattern (chosen 2026-05-08, "Option B"):
 *   - This module exports composable helpers — localBusinessBase(),
 *     addressNAP(), openingHoursSpec(), formatHoursAnswer(), etc.
 *   - Each page imports the helpers it needs and emits its own
 *     <script type="application/ld+json"> with the most-specific @type
 *     for that page.
 *   - Base.astro stays schema-free. Pillar pages each carry their own
 *     subtype: BarOrPub on /bar, Restaurant on /eat, BowlingAlley on
 *     /bowl, EntertainmentBusiness on /game, EventVenue on /events,
 *     /vip-suite. The homepage is BarOrPub (single type) per the
 *     locked bar-led thesis — schema teaches AI the entity model.
 *
 * Hours: same source the SnapFooter uses. getLiveHours() pulls
 * Google Places data when GOOGLE_MAPS_API_KEY + GOOGLE_PLACE_ID env
 * vars are set; falls back to src/data/hours.ts otherwise. FAQ
 * schema's "What are your hours?" answer is built from the same
 * data here so display copy and structured data cannot drift.
 *
 * Entity unification: every LocalBusiness-subtype JSON-LD on the
 * site uses the same @id (BUSINESS_ENTITY_ID). Schema.org convention
 * — same @id across pages = same entity. Lets AI Overviews / ChatGPT
 * /Perplexity unify the venue across surfaces.
 */

import { HOURS, parseTimeLabel, type DayKey } from "../data/hours";
import { getLiveHours } from "./google-hours";

// ── Canonical NAP ──────────────────────────────────────────────────
// Single source of truth. Schema, SnapFooter, and any future contact UI
// must read these constants — no hardcoded copies.

export const BUSINESS_NAME = "Twisted Pin";
export const BUSINESS_URL = "https://twistedpin.com";

export const STREET = "15610 Joliet Rd";
export const LOCALITY = "Plainfield";
export const REGION = "IL";
export const POSTAL_CODE = "60544";
export const COUNTRY = "US";

export const PHONE_DISPLAY = "(815) 782-7790";
export const PHONE_TEL = "+18157827790";

export const EMAIL = "contactus@twistedpin.com";

/** Google Place ID for the venue. Drives directions deep links and hasMap. */
export const PLACE_ID = "ChIJURI15Tr1DogRLKYdPWWuY-M";

/**
 * Canonical Google Maps URL for the venue page — Google's officially
 * documented `search/?api=1` deep-link pattern with `query_place_id`.
 *
 * Replaces the prior `maps.app.goo.gl/yyiVoLzTsHA2TNGW8` short URL
 * (Firebase Dynamic Links — Google sunset that platform Aug 25, 2025;
 * short links are on borrowed time). Also replaces the prior
 * `/maps/place/?q=place_id:...` form, which was flagged in earlier
 * testing as unreliable for venue-page surfaces (it landed on the
 * search list rather than the place card on some clients).
 *
 * Verified 2026-05-10: opens the Twisted Pin place card on iOS Safari
 * and Maps app deeplinks with Save / Share / Directions buttons exposed.
 *
 * Used by:
 *   - LocalBusiness JSON-LD `hasMap`
 *   - SnapFooter Google reviews card (the "see reviews on Google" link)
 *   - /pricing "verify on Google" caveat
 *
 * Different from the *directions* deep-link (which uses /maps/dir/ with
 * destination_place_id, defined per-page in service-area pages).
 */
export const MAPS_VENUE_URL = `https://www.google.com/maps/search/?api=1&query=Twisted+Pin&query_place_id=${PLACE_ID}`;

/**
 * @deprecated Use MAPS_VENUE_URL instead. Kept as an alias only because
 * `hasMap` already references this name in schema callers — single
 * source of truth, just one identifier short of consolidated.
 */
export const HAS_MAP_URL = MAPS_VENUE_URL;

/** Mirrors SnapFooter's social row. YouTube added 2026-05-08. */
export const SOCIAL_SAME_AS = [
  "https://www.instagram.com/twistedpinplainfield/",
  "https://www.facebook.com/twistedpin",
  "https://www.youtube.com/@TwistedPin",
];

/**
 * Schema.org priceRange string. $$ = moderate. Premium positioning per
 * voice.md but actual entree range is moderate-tier; cocktails are
 * upper-moderate. Adjust to "$$$" if ops wants the venue read as upscale.
 */
export const PRICE_RANGE = "$$";

/**
 * AggregateRating — Google review data, captured 2026-05-07 from the
 * Twisted Pin Business Profile. Drives the rich-result star display
 * in SERP listings.
 *
 * Update cadence: refresh annually or on any major review-velocity
 * change. Could be wired live via the Places API (`rating` +
 * `userRatingCount` fields) on the same key as google-hours.ts;
 * deferred for v1 — Google updates this monthly anyway and the cron
 * rebuild gives us a 24h refresh window if we wire it later.
 *
 * Yelp (4.1/99 as of 2026-05-07) intentionally omitted — Schema.org
 * `aggregateRating` is single-source; Google is the primary signal
 * for SERP rich results, and Yelp's own listing carries Yelp's data.
 */
export const GOOGLE_RATING = 4.5;
export const GOOGLE_REVIEW_COUNT = 1141;

/**
 * Canonical @id for the venue entity. Every LocalBusiness JSON-LD
 * across the site uses this same @id so crawlers unify pages into
 * one entity (Schema.org convention).
 */
export const BUSINESS_ENTITY_ID = `${BUSINESS_URL}/#business`;

// ── Address ────────────────────────────────────────────────────────

export function addressNAP() {
  return {
    "@type": "PostalAddress",
    streetAddress: STREET,
    addressLocality: LOCALITY,
    addressRegion: REGION,
    postalCode: POSTAL_CODE,
    addressCountry: COUNTRY,
  };
}

// ── Opening hours (single source: live → static fallback) ─────────

const SCHEMA_DAY_NAMES: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DAY_DISPLAY_ORDER: DayKey[] = [
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
];

/**
 * Wrap past-midnight close into 0-24h ISO time. Schema convention:
 * emit close in the open day's row even when close is technically the
 * next day — validators accept this and it keeps each weekly row
 * single-line.
 */
function minutesToISO(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface DayWindowMin {
  openMinutes: number;
  closeMinutes: number;
  closed: boolean;
  openLabel: string;
  closeLabel: string;
}

/**
 * Pull the canonical week of hours. Live Google Places data when env
 * vars are set; static src/data/hours.ts otherwise. Schema and FAQ
 * both read from here — divergence becomes structurally impossible.
 */
async function getHoursOfTruth(): Promise<Record<DayKey, DayWindowMin>> {
  const live = await getLiveHours();
  const out = {} as Record<DayKey, DayWindowMin>;

  for (const day of DAY_DISPLAY_ORDER) {
    if (live && live[day]) {
      const d = live[day];
      out[day] = {
        openMinutes: d.openMinutes,
        closeMinutes: d.closeMinutes,
        closed: d.closed,
        openLabel: d.openLabel,
        closeLabel: d.closeLabel,
      };
    } else {
      const h = HOURS[day];
      const openMin = parseTimeLabel(h.open) ?? 0;
      const closeRaw = parseTimeLabel(h.close) ?? 0;
      const closeMin = closeRaw <= openMin ? closeRaw + 24 * 60 : closeRaw;
      out[day] = {
        openMinutes: openMin,
        closeMinutes: closeMin,
        closed: false,
        openLabel: h.open,
        closeLabel: h.close,
      };
    }
  }
  return out;
}

/**
 * OpeningHoursSpecification array for LocalBusiness schema. Closed
 * days are omitted (Schema convention — no opens/closes row on a
 * closed day).
 */
export async function openingHoursSpec() {
  const week = await getHoursOfTruth();
  const spec: Array<Record<string, unknown>> = [];
  for (const day of DAY_DISPLAY_ORDER) {
    const w = week[day];
    if (w.closed) continue;
    spec.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: SCHEMA_DAY_NAMES[day],
      opens: minutesToISO(w.openMinutes),
      closes: minutesToISO(w.closeMinutes),
    });
  }
  return spec;
}

/**
 * FAQ "What are your hours?" answer, derived from the same hours
 * source the schema uses. Contiguous identical day-windows compress
 * into ranges (Mon–Thu 3pm–10pm) for clean copy.
 *
 * Returns both the plain-text schema form and the bolded HTML form
 * — FAQ Q&A consumes both shapes.
 */
export async function formatHoursAnswer(): Promise<{ schemaA: string; htmlA: string }> {
  const week = await getHoursOfTruth();

  type Range = { start: DayKey; end: DayKey; label: string };
  const ranges: Range[] = [];

  for (const day of DAY_DISPLAY_ORDER) {
    const w = week[day];
    const label = w.closed ? "closed" : `${w.openLabel}–${w.closeLabel}`;
    const last = ranges[ranges.length - 1];
    if (last && last.label === label) {
      last.end = day;
    } else {
      ranges.push({ start: day, end: day, label });
    }
  }

  const fullName = (k: DayKey) => SCHEMA_DAY_NAMES[k];

  const partsText = ranges.map((r) => {
    const dayPart = r.start === r.end ? fullName(r.start) : `${fullName(r.start)}–${fullName(r.end)}`;
    return `${dayPart} ${r.label}`;
  });
  const tail = "Hours may vary on holidays — check our Google listing for real-time updates.";
  const schemaA = `${partsText.join(". ")}. ${tail}`;

  const partsHtml = ranges.map((r) => {
    const dayPart = r.start === r.end ? fullName(r.start) : `${fullName(r.start)}–${fullName(r.end)}`;
    return r.label === "closed"
      ? `${dayPart} <strong>closed</strong>`
      : `${dayPart} <strong>${r.label}</strong>`;
  });
  const htmlA = `<p>${partsHtml.join(". ")}.</p><p>${tail}</p>`;

  return { schemaA, htmlA };
}

// ── LocalBusiness foundation ──────────────────────────────────────

interface LocalBusinessBaseOptions {
  /** Canonical URL of the page emitting this schema. */
  url: string;
  /** Page-specific representative image (absolute URL). */
  image?: string;
  /** Page-specific description override. */
  description?: string;
}

/**
 * Common fields shared across every LocalBusiness subtype. Spread into
 * a page-specific schema and set the @type:
 *
 *   const schema = {
 *     ...await localBusinessBase({ url: "https://twistedpin.com/bar/" }),
 *     "@type": "BarOrPub",
 *   };
 *
 * @id is canonical and shared across pages so crawlers unify pages
 * into one entity. url is per-page.
 */
export async function localBusinessBase(opts: LocalBusinessBaseOptions) {
  return {
    "@context": "https://schema.org",
    "@id": BUSINESS_ENTITY_ID,
    name: BUSINESS_NAME,
    url: opts.url,
    telephone: PHONE_DISPLAY,
    email: EMAIL,
    priceRange: PRICE_RANGE,
    address: addressNAP(),
    hasMap: HAS_MAP_URL,
    sameAs: SOCIAL_SAME_AS,
    openingHoursSpecification: await openingHoursSpec(),
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: GOOGLE_RATING,
      reviewCount: GOOGLE_REVIEW_COUNT,
      bestRating: 5,
      worstRating: 1,
    },
    ...(opts.image ? { image: opts.image } : {}),
    ...(opts.description ? { description: opts.description } : {}),
  };
}

// ── BreadcrumbList ───────────────────────────────────────────────

export interface BreadcrumbCrumb {
  /** Display name for this hop. Title-case, matches nav labels where possible. */
  name: string;
  /**
   * Site-relative path with leading + trailing slash, e.g. "/" or "/bar/"
   * or "/menu/cocktails/". Resolved against BUSINESS_URL — every item in
   * the emitted JSON-LD carries an absolute URL.
   */
  path: string;
}

/**
 * BreadcrumbList JSON-LD for Google rich-result eligibility (the small
 * "Home > Bar" trail that appears under SERP listings instead of the
 * raw URL). Homepage doesn't get one — breadcrumbs only make sense on
 * pages with a parent.
 *
 * Two-crumb chains (Home → Self) are valid per Google's spec; we use
 * those when the natural intermediate parent doesn't exist as a real
 * URL on the site (no /blog/ index, no /why-us/ index — emitting a
 * link to a 404 is worse than skipping the hop).
 */
export function breadcrumbList(crumbs: BreadcrumbCrumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${BUSINESS_URL}${c.path}`,
    })),
  };
}

// ── Event helper ─────────────────────────────────────────────────

export interface EventInput {
  /** Event name (Schema.org `name`). */
  name: string;
  /** Event start. ISO string preferred (preserves timezone offset);
   *  Date works too. */
  start: Date | string;
  /** Optional end. */
  end?: Date | string;
  /** Body / description (plain text). */
  description?: string;
  /** Representative image (absolute URL). */
  image?: string;
  /** Canonical event URL. */
  url?: string;
}

/**
 * Build an Event JSON-LD object referencing the venue via @id for both
 * `location` and `organizer`. Defaults `eventStatus: EventScheduled` —
 * Google's documented recommendation so the rich result remains valid
 * through future cancellation/postponement state changes (flip the
 * field rather than restructuring the schema).
 *
 * Returned object has no `@context` — caller decides whether this is a
 * top-level emission (add `@context`) or nested inside an ItemList
 * (omit `@context`).
 *
 * `offers` is intentionally NOT modeled here. Add per-page only when
 * real ticket / package data exists — Schema.org `Offer` requires
 * price + availability that ops needs to confirm per event.
 */
export function eventSchema(input: EventInput): Record<string, unknown> {
  const startISO = typeof input.start === "string" ? input.start : input.start.toISOString();
  const obj: Record<string, unknown> = {
    "@type": "Event",
    name: input.name,
    startDate: startISO,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@id": BUSINESS_ENTITY_ID },
    organizer: { "@id": BUSINESS_ENTITY_ID },
  };
  if (input.end) {
    obj.endDate = typeof input.end === "string" ? input.end : input.end.toISOString();
  }
  if (input.description) obj.description = input.description;
  if (input.image) obj.image = input.image;
  if (input.url) obj.url = input.url;
  return obj;
}
