export const prerender = false;

import type { APIRoute } from 'astro';
import { PLAYBOOK_ADMIN_COOKIE, verifyAdminToken } from '../../lib/playbook-auth';

/**
 * /api/playbook-brief — emails managers how the Playbook works and how to get in.
 *
 * Triggered from the status page button, so it's manager-gated and re-sendable
 * whenever someone new joins management. Deliberately NOT a one-off script: the
 * information goes stale in people's inboxes, and "resend it" should not require
 * a developer.
 *
 * ⚠️ THIS EMAIL CONTAINS BOTH PASSWORDS. That's the point — it's an internal
 * brief to info@ — but it also means: don't forward it outside management, and
 * if it ever leaks, rotate PLAYBOOK_PASSWORD / PLAYBOOK_ADMIN_PASSWORD on Vercel
 * (rotating PLAYBOOK_SESSION_SECRET additionally logs everyone out).
 *
 * Sends from mail.twistedpin.com — the apex is NOT verified on Resend and
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

  const to = import.meta.env.PLAYBOOK_NOTIFY_TO || 'info@twistedpin.com';
  const from =
    import.meta.env.PLAYBOOK_NOTIFY_FROM ||
    'Twisted Pin <playbook@mail.twistedpin.com>';

  const teamPw = import.meta.env.PLAYBOOK_PASSWORD || 'onefamily';
  const adminPw = import.meta.env.PLAYBOOK_ADMIN_PASSWORD || '(not set)';

  const body = `THE TWISTED PIN PLAYBOOK — MANAGEMENT INFORMATION

WHAT IT IS
An internal website with two halves. Part One, The Playbook, is the culture
book — our story, our values, and the moments behind them. Every teammate reads
it once and signs at the end. Part Two, The Guidebook, is the practical
reference — scheduling, time off, uniforms, pay, safety, perks. No signature;
it's there to be looked things up in, and it has a search box.


FOR TEAMMATES
Link:      https://www.twistedpin.com/welcome
Password:  ${teamPw}

They enter the password, tell us their name, and choose a book. The Playbook
ends with a signature. There's a printable sign for the time clock at
https://www.twistedpin.com/playbook/poster (scan-to-open QR code).


FOR MANAGERS
Status:    https://www.twistedpin.com/playbook/status
Password:  ${adminPw}

This is a DIFFERENT password on purpose. The status page shows every
teammate's name, whether they've finished, and how long they read — the team
password is known by the whole team, so this page is kept behind its own.


HOW YOU KNOW SOMEONE DID IT
info@ gets an email the moment anyone signs, so a new hire who never signs
never generates one. The status page answers the same question the other way
round: it lists anyone who started and stalled, flagged once they're 3+ days
in.


ABOUT THE READING TIME
It counts only while the page is actually open in front of them, so it
survives someone reading across two shifts. It is client-side and lossy —
reading on two devices, private browsing, or clearing site data all lose it.
When the numbers look implausible we print "not captured" rather than a low
figure, because anyone who reached the signature page got there by advancing
through the book.

Treat it as a coaching signal, never as evidence. A low number is worth a
friendly "give it a proper read" and nothing more.


WHEN A POLICY CHANGES
Every signature records which VERSION of the books it was made against. If the
tip pool or a policy changes, the status page flags everyone who signed the
older document, so you can ask for a re-read when the change is material.


KEEP THIS INTERNAL
This message contains both passwords. Don't forward it outside management. If
it gets out, the passwords can be changed in Vercel without touching anything
else.
`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Twisted Pin Playbook - Management Information!',
      text: body,
    }),
  });

  if (!res.ok) {
    console.error('[playbook-brief] resend failed', res.status, await res.text());
    return redirect('/playbook/status/?e=3', 303);
  }
  return redirect('/playbook/status/?sent=1', 303);
};

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}
