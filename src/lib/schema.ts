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
import { getLiveHours, getLiveReviews } from "./google-hours";

// ── Canonical NAP ──────────────────────────────────────────────────
// Single source of truth. Schema, SnapFooter, and any future contact UI
// must read these constants — no hardcoded copies.

export const BUSINESS_NAME = "Twisted Pin";
// www.* form matches astro.config.mjs `site` + every canonical/og:url
// tag emitted by Base.astro. Was bare `twistedpin.com` until 2026-05-17;
// the mismatch meant every JSON-LD `@id` resolved via a 308 redirect on
// crawl rather than matching the canonical exactly. Single-line fix
// propagates to BUSINESS_ENTITY_ID, BRIAN_ID, MENU_*_ID, every event
// `@id`, every service `@id`, every video sitemap URL.
export const BUSINESS_URL = "https://www.twistedpin.com";

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
 * AggregateRating — Google review data. Wired live via Google Places API
 * 2026-05-18 (`rating` + `userRatingCount` fields, fetched in the same
 * daily Places call as live hours — see src/lib/google-hours.ts).
 *
 * These constants are the FALLBACK values, used when the live snapshot
 * is missing/stale or env vars aren't configured. Initial capture from
 * the Twisted Pin Business Profile 2026-05-07. Update annually as a
 * floor; live data takes over when present.
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

/**
 * Canonical @id for Brian Van Flandern's Person entity.
 *
 * Brian is a CONSULTANT who curated the cocktail program — not staff,
 * not an owner. Schema.org relationships must reflect that:
 *   - Menu.contributor: ✅ accurate ("secondary contributor to the CreativeWork")
 *   - Menu.creator / Menu.author: ❌ overclaims authorship
 *   - LocalBusiness.employee: ❌ employment claim he isn't
 *   - LocalBusiness.member: ❌ membership claim he isn't
 *
 * The Person entity itself is defined on `/bar` (the page that carries
 * the credential as primary positioning). Other pages reference Brian
 * via this @id only — `contributor: { "@id": BRIAN_ID }` is the canonical
 * cross-document reference.
 *
 * See memory: project_brian_van_flandern_relationship.md
 */
export const BRIAN_ID = `${BUSINESS_URL}/#brian-van-flandern`;

/**
 * Canonical @id values for the three Menu entities.
 *
 * Defined on `/menu/cocktails`, `/menu/food`, `/menu/taps` respectively
 * (each page emits the full Menu → MenuSection → MenuItem tree at its
 * own @id). LocalBusiness subtype pages (homepage BarOrPub, /bar
 * BarOrPub) reference these via `hasMenu: [{ "@id": MENU_COCKTAILS_ID }, ...]`
 * to close the entity graph — Brian is a contributor to the Menu, the
 * Menu is owned by the BarOrPub, the BarOrPub is the same entity as
 * the homepage business.
 */
export const MENU_COCKTAILS_ID = `${BUSINESS_URL}/#menu-cocktails`;
export const MENU_FOOD_ID = `${BUSINESS_URL}/#menu-food`;
export const MENU_TAPS_ID = `${BUSINESS_URL}/#menu-taps`;

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
 *
 * **VALID @type VALUES**: this helper carries `aggregateRating`, which
 * Google's Review Snippet policy only permits under `LocalBusiness` (and
 * its subtypes), `Organization`, `Product`, `Service`, `Event`, and a
 * handful of other types. Spreading this into a node typed `Place`,
 * `EventVenue`, `CivicStructure`, or `TouristAttraction` will fail GSC
 * validation with "Invalid object type for field <parent_node>" — this
 * happened on /events 2026-05-13. Stick to `LocalBusiness` subtypes:
 * BarOrPub, Restaurant, BowlingAlley, EntertainmentBusiness, NightClub,
 * FoodEstablishment, SportsActivityLocation, etc. If a page is
 * semantically an `EventVenue`, use a type array
 * `["EventVenue", "EntertainmentBusiness"]` so the AR parent is valid.
 */
export async function localBusinessBase(opts: LocalBusinessBaseOptions) {
  // Live Google review data — pulled from the same Places API snapshot
  // as live hours. Falls back to GOOGLE_RATING / GOOGLE_REVIEW_COUNT
  // constants when snapshot is missing/stale. Memoized inside
  // getLiveReviews() — at most one Places fetch per build process,
  // shared with getLiveHours().
  const liveReviews = await getLiveReviews();
  const ratingValue = liveReviews?.rating ?? GOOGLE_RATING;
  const reviewCount = liveReviews?.reviewCount ?? GOOGLE_REVIEW_COUNT;

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
    // Venue-level full-venue-buyout capacity. The /vip-suite sub-location
    // separately claims maximumAttendeeCapacity: 80 for the suite alone
    // (see src/pages/vip-suite.astro). This number is the whole-venue cap
    // — 17 traditional lanes + the VIP suite when an organization takes
    // over the building. "Up to 200" hedges the same way our copy does:
    // 200 is the upper tolerance; situational but achievable. Adding
    // 2026-05-18 to unlock "venue 200 capacity Plainfield" type SERP
    // eligibility and to back the capacity copy across event-funnel pages.
    maximumAttendeeCapacity: 200,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue,
      reviewCount,
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

// ── WebPage entity helper ─────────────────────────────────────────
//
// Stage 7 addition (2026-05-18). Every page emits a WebPage node that
// wraps the page's primary content as a typed entity. This is a small
// SEO signal (1-3% per page, compounding) plus a meaningful clarity
// boost for AI Overviews / ChatGPT / Perplexity entity recognition.
//
// Critical design constraints captured here so future maintainers
// don't accidentally trigger Google's date-manipulation detection:
//
//   - `inLanguage` is emitted on EVERY page. Zero staleness risk.
//     "en-US" for everything under `/`, "es-US" for `/es/*`. Auto-
//     detected by Base.astro from Astro.url.pathname.
//
//   - `dateModified` is emitted ONLY on pages where content genuinely
//     refreshes. As of Phase 1 (2026-05-18):
//       * /menu/cocktails — daily GoTab cron pulls real menu changes
//       * /menu/food — same
//       * /menu/taps — daily Untappd cron pulls beer rotation
//     Everywhere else: omit dateModified. The Vercel shallow-clone
//     (depth=1) defeats git-mtime as a source; manual per-page dates
//     decay into stale signals; build-timestamp without real content
//     change is Google's "content flapping" pattern, which is
//     algorithmically detected and penalized. Conservative is correct.
//
//   - `speakable` is emitted on pages where voice-assistant queries
//     map to specific on-page content:
//       * /faq — questions + answers (.t2-faq-q-text, .t2-faq-a)
//       * / (homepage) — NAP address block (.footer-address)
//     Per Google's spec, speakable content should be readable in
//     ~20-30 seconds. Keep selector list short and bounded.
//
//   - `about` references BUSINESS_ENTITY_ID — the WebPage is about
//     the business. Closes the entity graph (WebPage → LocalBusiness).
//     Crawlers + LLMs use this to unify the page-vs-business signal.
//
// **What this is NOT:**
//   - Not a major SEO lever. ~1-3% per page; cumulative across 25
//     pages = measurable in 30-60 days, not transformative.
//   - Not a substitute for real content freshness. Pillar pages
//     should still get genuine content refreshes (live review-count
//     widget, "this week's events" teaser, quarterly content reviews).
//     The WebPage schema doesn't replace that work; it makes the
//     existing freshness signal honest.

export interface WebPageOptions {
  /** Canonical absolute URL of the page. */
  url: string;
  /** Page name (typically the meta title, possibly trimmed). */
  name: string;
  /** Page description (typically the meta description). */
  description: string;
  /** Language code. "en-US" for English pages, "es-US" for /es/* pages. */
  inLanguage: "en-US" | "es-US";
  /**
   * ISO date when the page's content last meaningfully changed. **Only set
   * on pages where this is HONEST.** Menu pages use today() at build time
   * because cron-driven refresh is real. Other pages: omit entirely.
   */
  dateModified?: string;
  /**
   * CSS selectors identifying content suitable for voice-assistant
   * read-aloud. Keep the list short — 1-3 selectors max. Per Google's
   * Speakable spec, the content these select should be 20-30 seconds
   * when spoken.
   */
  speakable?: string[];
}

/**
 * Emit a WebPage JSON-LD entity for the current page. Wired into
 * Base.astro so every page gets one automatically; specific pages
 * pass extra opts (dateModified, speakable) when applicable.
 */
export function webPageSchema(opts: WebPageOptions): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${opts.url}#webpage`,
    url: opts.url,
    name: opts.name,
    description: opts.description,
    inLanguage: opts.inLanguage,
    about: { "@id": BUSINESS_ENTITY_ID },
  };
  if (opts.dateModified) {
    node.dateModified = opts.dateModified;
  }
  if (opts.speakable && opts.speakable.length > 0) {
    node.speakable = {
      "@type": "SpeakableSpecification",
      cssSelector: opts.speakable,
    };
  }
  return node;
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
 *
 * `location` inlines name + address alongside @id rather than emitting
 * a bare @id reference. Google's Event rich-result validator has been
 * flagged in the wild for "Missing field 'name' in location" when
 * `location` is a pure @id ref — crawlers don't always traverse the @id
 * graph to resolve it. Inlining the canonical NAP is cheap and removes
 * the validator footgun. The shared @id still ties this Place node back
 * to the unified business entity for AI-surface entity resolution.
 */
export function eventSchema(input: EventInput): Record<string, unknown> {
  const startISO = typeof input.start === "string" ? input.start : input.start.toISOString();
  const obj: Record<string, unknown> = {
    "@type": "Event",
    name: input.name,
    startDate: startISO,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@id": BUSINESS_ENTITY_ID,
      "@type": "Place",
      name: BUSINESS_NAME,
      address: addressNAP(),
    },
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

// ── VideoObject helper ────────────────────────────────────────────

import type { VideoEntry } from "../data/videos";
import { isoDuration, thumbnailUrl, contentUrl, primaryPageUrl } from "../data/videos";

/**
 * Build a Schema.org `VideoObject` JSON-LD object for a video registry
 * entry. Emit at the top level on the video's primary page only —
 * cross-page video instances are visual; only one canonical schema
 * exists per video entity.
 *
 * Required fields per Google's video best-practices doc: `name`,
 * `description`, `thumbnailUrl`. Strongly recommended: `uploadDate`,
 * `contentUrl`, `duration`. All present here.
 *
 * `publisher` references the canonical LocalBusiness entity via @id —
 * entity graph closes through to the homepage BarOrPub.
 *
 * `expires` populated only for seasonal videos (NYE, summer-pass,
 * free-kids-bowling). Google drops VideoObject from results past that
 * date, so the video stops surfacing after the program window ends.
 *
 * @example
 * ```astro
 * import { BEERWALL_VIDEO } from "../data/videos";
 * import { videoObjectSchema } from "../lib/schema";
 * const beerwallSchema = videoObjectSchema(BEERWALL_VIDEO);
 * ---
 * <script type="application/ld+json" set:html={JSON.stringify(beerwallSchema)} />
 * ```
 */
export function videoObjectSchema(v: VideoEntry): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `${BUSINESS_URL}/#video-${v.slug}`,
    name: v.name,
    description: v.description,
    thumbnailUrl: thumbnailUrl(v),
    contentUrl: contentUrl(v),
    uploadDate: v.uploadDate,
    duration: isoDuration(v.durationSeconds),
    publisher: { "@id": BUSINESS_ENTITY_ID },
    // Page that owns this video — closes the page→video association.
    // Note: Schema.org `isPartOf` accepts WebPage; the page itself is
    // not separately schema'd, so we reference its URL.
    isPartOf: {
      "@type": "WebPage",
      url: primaryPageUrl(v),
    },
  };
  if (v.expires) obj.expires = v.expires;
  return obj;
}
