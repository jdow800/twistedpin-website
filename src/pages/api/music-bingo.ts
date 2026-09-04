export const prerender = false;

/**
 * Singo music bingo status for Roy's `check_music_bingo` tool. All the
 * reasoning lives in src/lib/program-endpoint.ts; this file only names the
 * program. Source of truth: src/content/events/singo-sundays.md.
 *
 * ⚠️ The Retell tool URL is https://www.twistedpin.com/api/music-bingo/ WITH
 * the trailing slash — without it the request 308s, and a redirect-following
 * failure would be silent on a live call.
 */
import { programRoute } from '../../lib/program-endpoint';

const route = programRoute({
  tag: 'music-bingo',
  noun: 'music bingo',
  host: 'Tone Bar Games',
  cost: 'free to play',
});

export const GET = route.GET;
export const POST = route.POST;
