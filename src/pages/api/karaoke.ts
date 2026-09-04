export const prerender = false;

/**
 * Karaoke status for Roy's `check_karaoke` tool. All the reasoning lives in
 * src/lib/program-endpoint.ts; this file only names the program.
 *
 * ⚠️ The Retell tool URL is https://www.twistedpin.com/api/karaoke/ WITH the
 * trailing slash — without it the request 308s, and a redirect-following
 * failure would be silent on a live call.
 */
import { programRoute } from '../../lib/program-endpoint';

const route = programRoute({
  tag: 'karaoke',
  noun: 'karaoke',
  host: 'Joe Son',
  cost: 'free to sing',
});

export const GET = route.GET;
export const POST = route.POST;
