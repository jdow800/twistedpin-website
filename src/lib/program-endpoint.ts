/**
 * One-program status endpoints for Roy, the Retell phone agent.
 *
 * Roy has one custom tool per standing program (`check_karaoke`,
 * `check_music_bingo`) and calls it mid-conversation when a caller asks.
 * The whole response lands in his context window, so each endpoint returns
 * ~10 fields about ONE program — not the week of opening hours and Google
 * snapshot that /api/hours/ carries alongside the same data.
 *
 * THE FIELD THAT MATTERS IS `answer` — a finished sentence, already correct
 * for the moment the call is happening ("tonight", "going on right now",
 * "tomorrow", "the next one is..."). Roy speaks it. He is explicitly told
 * not to do date arithmetic, because that is the thing an LLM gets
 * confidently wrong on a phone call, and the caller then drives to
 * Plainfield on a night we're dark.
 *
 * Source of truth is src/content/events/*.md — the same markdown the public
 * calendar renders. Cancelling a night updates the website AND the phone.
 *
 * WHY A TOOL AND NOT A PRE-CALL VARIABLE. Roy's pre-call webhook (n8n)
 * could inject this on every call, but any one program comes up on a
 * minority of them, so that is payload spent on nothing. A tool costs one
 * fast GET, only when someone asks — and keeps n8n out of the path.
 *
 * Adding a program: tag its event markdown, then create
 * `src/pages/api/<slug>.ts` with three lines (see music-bingo.ts), then add
 * a `check_<slug>` tool + prompt rule to Roy. The route module must still
 * declare `export const prerender = false` itself — Astro reads that
 * statically from the route file.
 */
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { buildProgram, type ProgramEvent } from './programs';

export type ProgramEndpointConfig = {
  /** The `tags:` value in the event markdown. */
  tag: string;
  /** How a caller says it — used in the no-events fallback sentence. */
  noun: string;
  /** Who runs the night. Spoken if a caller asks; null if unknown. */
  host: string | null;
  /** "free to sing" / "free to play". Spoken if asked. */
  cost: string;
};

const LINK = 'https://www.twistedpin.com/upcoming-events/';

export async function programPayload(cfg: ProgramEndpointConfig) {
  const events: ProgramEvent[] = (await getCollection('events'))
    .filter((e) => !e.data.draft && e.data.tags.includes(cfg.tag))
    .map((e) => ({
      id: e.id,
      title: e.data.title,
      tags: e.data.tags,
      start: e.data.start,
      end: e.data.end,
      recurring: e.data.recurring,
    }));

  const p = buildProgram(events, cfg.tag, new Date());

  // No tagged events at all — say so plainly rather than 404ing, so Roy
  // gets a usable sentence instead of a tool error.
  if (!p) {
    const answer = `We're not running ${cfg.noun} right now.`;
    return { running: false, answer, summary: answer, link: LINK };
  }

  return {
    running: p.season.in_season,
    /** Speak this. Already accounts for tonight, dark weeks, and the season. */
    answer: p.answer,
    /** The standing cadence, for "do you host X?" with no date attached. */
    summary: p.summary,
    host: cfg.host,
    cost: cfg.cost,
    weekday: p.weekday,
    usual_time: p.usual_time.spoken,
    next_date: p.next?.spoken_date ?? null,
    next_time: p.next?.spoken_time ?? null,
    is_tonight: p.next_is_today,
    happening_now: p.next_in_progress,
    link: LINK,
  };
}

const headers = {
  'Content-Type': 'application/json',
  // Short cache: `answer` flips at event boundaries ("tonight" → "going on
  // right now" → "the next one is"), so it can't be cached for long. 60s is
  // well inside the granularity anyone speaks in.
  'Cache-Control': 'public, max-age=60, s-maxage=60',
  // Machine doorway for the phone agent, not a page anyone should land on.
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/**
 * GET and POST handlers for one program. Retell custom tools POST their
 * arguments; these take none, so the body is ignored entirely and never
 * parsed (a malformed body must not 500 a live phone call). A plain GET is
 * what anything else would use.
 */
export function programRoute(cfg: ProgramEndpointConfig): { GET: APIRoute; POST: APIRoute } {
  const respond: APIRoute = async () =>
    new Response(JSON.stringify(await programPayload(cfg)), { status: 200, headers });
  return { GET: respond, POST: respond };
}
