export const prerender = false;

import type { APIRoute } from 'astro';
import { PLAYBOOK_ADMIN_COOKIE, verifyAdminToken } from '../../lib/playbook-auth';

/**
 * /api/playbook-brief — the management announcement / access brief.
 *
 * Sends managers what the Playbook is, how to get in, what they'll receive when
 * a teammate signs, and what to do next. Triggered from the status page so
 * re-sending it when someone joins management never needs a developer.
 *
 * Accepts an optional `to` override so the email can be PREVIEWED into one
 * inbox before going to the whole management alias — reviewing a draft in the
 * medium it'll actually be read in is the only way to catch formatting that
 * looks fine in a code editor.
 *
 * ⚠️ CONTAINS BOTH PASSWORDS. That's the point — it's internal — but don't
 * forward it outside management. If it leaks, change PLAYBOOK_PASSWORD /
 * PLAYBOOK_ADMIN_PASSWORD in Vercel (changing PLAYBOOK_SESSION_SECRET as well
 * additionally logs everyone out).
 *
 * `to` is RESTRICTED to @twistedpin.com. The endpoint is admin-gated, but an
 * unrestricted recipient field would turn it into an open relay the moment
 * that password got out — and it has no business emailing anyone else.
 *
 * Sends from mail.twistedpin.com; the apex is NOT verified on Resend and
 * returns a silent 403.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const cookies = parseCookie(request.headers.get('cookie'));
  if (!(await verifyAdminToken(cookies[PLAYBOOK_ADMIN_COOKIE]))) {
    return redirect('/playbook/status/', 303);
  }

  const key = import.meta.env.RESEND_API_KEY;
  if (!key) {
    console.error('[playbook-brief] RESEND_API_KEY not set');
    return redirect('/playbook/status/?e=3', 303);
  }

  // Optional recipient override (preview). Same-domain only.
  let to = import.meta.env.PLAYBOOK_NOTIFY_TO || 'info@twistedpin.com';
  let wantsJson = false;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      wantsJson = true;
      const body = await request.json();
      if (typeof body?.to === 'string' && /^[^@\s]+@twistedpin\.com$/i.test(body.to)) {
        to = body.to;
      }
    } else {
      const form = await request.formData();
      const t = form.get('to');
      if (typeof t === 'string' && /^[^@\s]+@twistedpin\.com$/i.test(t)) to = t;
    }
  } catch { /* no body — use the default recipient */ }

  const from =
    import.meta.env.PLAYBOOK_NOTIFY_FROM ||
    'Twisted Pin <playbook@mail.twistedpin.com>';

  const teamPw = import.meta.env.PLAYBOOK_PASSWORD || 'onefamily';
  const adminPw = import.meta.env.PLAYBOOK_ADMIN_PASSWORD || '(not set)';

  const body = `The Twisted Pin Playbook is live.

It's the culture book we've been building, and it's now something every
teammate can read on their phone in about twenty minutes.

There are two halves.

PART ONE — THE PLAYBOOK
Our story, our values, and the real moments behind them. The graduation party
where mom finally got to be a guest. The birthday nobody showed up to. The
proposal on lane 12. Every teammate reads this once and signs at the end.

PART TWO — THE GUIDEBOOK
The practical half. Scheduling, calling off, time off and PLAWA, uniforms,
pay and tips, benefits, safety, and the perks. Nobody signs this one — it's
built to be looked things up in, and it has a search box. A teammate can type
"call off" or "what do I wear" or "when do I get paid" and land on the exact
answer.


─────────────────────────────────────────
FOR TEAMMATES
─────────────────────────────────────────
Link:      twistedpin.com/welcome
Password:  ${teamPw}

They enter the password, tell us their name, and pick a book.


─────────────────────────────────────────
FOR MANAGERS
─────────────────────────────────────────
Status:    twistedpin.com/playbook/status
Password:  ${adminPw}

A different password on purpose — this page lists every teammate's name and
whether they've finished, and the team password is known by the whole team.


─────────────────────────────────────────
WHAT YOU'LL GET WHEN SOMEONE SIGNS
─────────────────────────────────────────
info@ receives an email the moment a teammate signs. It looks like:

    Subject: George Smith signed the Playbook — 22 minutes of reading,
             19 of 19 pages

    George Smith signed the Twisted Pin Playbook on 7/20 at 7:30 PM
    (Central) — 22 minutes of reading, 19 of 19 pages.

So you get: who signed, exactly when (Central time), how long they spent
actually reading, and how much of the book they opened. We also quietly record
the IP address and device, and which VERSION of the books they signed — so if
a policy changes later, we can tell who agreed to the old one.

The important part isn't the emails that arrive. It's the one that doesn't.
If a new hire never triggers one, they never finished — and the status page
lists anyone who started and stalled, flagged once they're three days in.

One caveat worth knowing: the reading time only counts while the page is
actually open in front of them, and it can be lost if someone reads across two
devices or clears their browser. When the number looks off, the email says
"reading time not captured" instead of guessing low. Treat it as a coaching
signal — a friendly "give it a proper read" — never as proof of anything.


─────────────────────────────────────────
COMING SOON — THE QR CODE
─────────────────────────────────────────
There's a printable 8.5x11 sign ready at twistedpin.com/playbook/poster.

The plan: frame it and hang it somewhere accessible near the time clock.
Onboarding then gets easy — a new teammate scans it with their phone camera
and they're in, no link to type and nothing for us to remember to send.

It's not just for new hires either. The same code gets any teammate into the
Guidebook to search for an answer, months later, standing right there at the
clock. Point the camera, type "shift swap", done.

(Print to Letter, no scaling, and turn ON "Background graphics" in the print
settings or the panels come out blank.)


─────────────────────────────────────────
WHAT WE'D LIKE FROM YOU
─────────────────────────────────────────
Please walk through the whole thing yourself — both halves — and sign it.

Two reasons. You'll know exactly what your team is being asked to read before
you ask them to read it. And when someone comes to you with a question, you'll
know whether the answer is already in there and where to point them.

If anything reads wrong, is out of date, or is just missing, say so. It's
meant to be corrected.


Thanks,
Twisted Pin
`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Twisted Pin Playbook Now Live',
      text: body,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('[playbook-brief] resend failed', res.status, detail);
    return wantsJson
      ? json({ ok: false, status: res.status, detail }, 200)
      : redirect('/playbook/status/?e=3', 303);
  }
  return wantsJson
    ? json({ ok: true, to }, 200)
    : redirect('/playbook/status/?sent=1', 303);
};

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}
