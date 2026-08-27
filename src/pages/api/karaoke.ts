export const prerender = false;

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildProgram, type ProgramEvent } from '../../lib/programs';

/**
 * Karaoke status for Roy, the Retell phone agent.
 *
 * WHY A DEDICATED ENDPOINT. Roy calls this mid-conversation via his
 * `check_karaoke` tool when a caller asks about karaoke, and the whole
 * response lands in his context window. /api/hours/ carries the same data
 * under `programs.karaoke`, but it also carries a week of opening hours and
 * a Google snapshot — several KB of JSON for a question about one thing.
 * This returns ~8 fields.
 *
 * WHY A TOOL AND NOT A PRE-CALL VARIABLE. Roy's pre-call webhook (n8n) could
 * inject this on every call, but karaoke comes up on a minority of them, so
 * that's payload spent on nothing. A tool costs one fast GET, only when
 * someone actually asks. It also keeps n8n out of the path: the phone answer
 * depends on this repo and Retell, nothing else.
 *
 * THE FIELD THAT MATTERS IS `answer` — a finished sentence, already correct
 * for the moment the call is happening ("tonight", "going on right now",
 * "not this week, the next one is..."). Roy speaks it. He is explicitly
 * instructed not to do date arithmetic, because that's the thing an LLM gets
 * confidently wrong on a phone call, and the caller then drives to Plainfield
 * on a night we're dark.
 *
 * Source of truth is src/content/events/*.md — the same markdown the public
 * calendar renders. Cancelling a night updates the website AND the phone.
 *
 * Accepts GET and POST: Retell custom tools post a (here empty) JSON body of
 * their arguments, and a plain GET is what anything else would use.
 */

const TAG = 'karaoke';

async function payload() {
  const events: ProgramEvent[] = (await getCollection('events'))
    .filter((e) => !e.data.draft && e.data.tags.includes(TAG))
    .map((e) => ({
      id: e.id,
      title: e.data.title,
      tags: e.data.tags,
      start: e.data.start,
      end: e.data.end,
      recurring: e.data.recurring,
    }));

  const p = buildProgram(events, TAG, new Date());

  // No karaoke events at all — say so plainly rather than 404ing, so Roy
  // gets a usable sentence instead of a tool error.
  if (!p) {
    return {
      running: false,
      answer: "We're not running karaoke right now.",
      summary: "We're not running karaoke right now.",
      link: 'https://www.twistedpin.com/upcoming-events/',
    };
  }

  return {
    running: p.season.in_season,
    /** Speak this. Already accounts for tonight, dark weeks, and the season. */
    answer: p.answer,
    /** The standing cadence, for "do you host karaoke?" with no date attached. */
    summary: p.summary,
    host: 'Joe Son',
    cost: 'free to sing',
    weekday: p.weekday,
    usual_time: p.usual_time.spoken,
    next_date: p.next?.spoken_date ?? null,
    next_time: p.next?.spoken_time ?? null,
    is_tonight: p.next_is_today,
    happening_now: p.next_in_progress,
    link: 'https://www.twistedpin.com/upcoming-events/',
  };
}

const headers = {
  'Content-Type': 'application/json',
  // Short cache: `answer` flips at event boundaries ("tonight" → "going on
  // right now" → "not this week"), so it can't be cached for long. 60s is
  // well inside the granularity anyone speaks in.
  'Cache-Control': 'public, max-age=60, s-maxage=60',
  // Machine doorway for the phone agent, not a page anyone should land on.
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await payload()), { status: 200, headers });

// Retell custom tools POST their arguments; this one takes none, so the body
// is ignored entirely and never parsed (a malformed body must not 500 a
// live phone call).
export const POST: APIRoute = async () =>
  new Response(JSON.stringify(await payload()), { status: 200, headers });
