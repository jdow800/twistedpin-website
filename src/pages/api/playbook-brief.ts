export const prerender = false;

import type { APIRoute } from 'astro';
import { PLAYBOOK_ADMIN_COOKIE, verifyAdminToken } from '../../lib/playbook-auth';

/**
 * /api/playbook-brief — the "Playbook is live" announcement / access brief.
 *
 * Sends managers the links, the passwords, what they'll receive when a teammate
 * signs, and what to do next. Triggered from the status page so re-sending it
 * when someone joins management never needs a developer.
 *
 * ⚠️ IDEMPOTENCY IS LOAD-BEARING HERE, NOT DECORATION.
 * On 2026-07-20 info@ received this twice, because a deploy-polling loop
 * retried the endpoint every 12s until it saw a JSON success — while the
 * then-deployed version answered with a 303 and an empty body, having already
 * sent the mail. Same failure is one double-tap away for any manager using the
 * status-page button. Resend's Idempotency-Key, bucketed per recipient per
 * 5 minutes, collapses accidental repeats while still allowing a deliberate
 * re-send a few minutes later.
 *
 * ⚠️ CONTAINS BOTH PASSWORDS. Internal only. If it leaks, change
 * PLAYBOOK_PASSWORD / PLAYBOOK_ADMIN_PASSWORD in Vercel (changing
 * PLAYBOOK_SESSION_SECRET too additionally logs everyone out).
 *
 * `to` is restricted to @twistedpin.com — the endpoint is admin-gated, but an
 * unrestricted recipient field becomes an open relay the moment that password
 * gets out, and this has no business emailing anyone off-domain.
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

  let to = import.meta.env.PLAYBOOK_NOTIFY_TO || 'info@twistedpin.com';
  let wantsJson = false;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      wantsJson = true;
      const b = await request.json();
      if (typeof b?.to === 'string' && /^[^@\s]+@twistedpin\.com$/i.test(b.to)) to = b.to;
    } else {
      const form = await request.formData();
      const t = form.get('to');
      if (typeof t === 'string' && /^[^@\s]+@twistedpin\.com$/i.test(t)) to = t;
    }
  } catch { /* no body — default recipient */ }

  const from =
    import.meta.env.PLAYBOOK_NOTIFY_FROM ||
    'Twisted Pin <playbook@mail.twistedpin.com>';
  const teamPw = import.meta.env.PLAYBOOK_PASSWORD || 'onefamily';
  const adminPw = import.meta.env.PLAYBOOK_ADMIN_PASSWORD || '(not set)';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // 5-minute bucket per recipient — see the idempotency note above.
      'Idempotency-Key': `pb-brief-${to}-${Math.floor(Date.now() / 300_000)}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Twisted Pin Playbook Now Live',
      html: html(teamPw, adminPw),
      text: plain(teamPw, adminPw),
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

/* ────────────────────────────────────────────────────────────────────────
   The email.
   ────────────────────────────────────────────────────────────────────────
   TLDR box first: a manager who reads only the top 6 lines has everything
   they need to actually use this. Everything below is optional depth.

   Built with tables and INLINE styles because that's what email clients
   reliably render — Gmail strips <style> blocks in several contexts, and
   flexbox/grid are unsupported in Outlook. Ugly to author, but it's the
   difference between "designed" and "collapsed into a column of text".
   No external CSS, no web fonts (they won't load), no background images. */

const INDIGO = '#200F53';
const DEEP = '#0E0A1F';
const INK = '#1A1526';
const MUTED = '#5C5470';
const RULE = '#E4E0EA';
/* Screen Glow (#4EECC4) is unreadable as text on white — darkened for light
   backgrounds, kept bright only where it sits on the dark band. */
const ACCENT = '#0E9B7E';
const GLOW = '#4EECC4';

function html(teamPw: string, adminPw: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#EDEAF2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDEAF2;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- header -->
  <tr><td style="background:${DEEP};padding:26px 30px 24px;">
    <img src="https://www.twistedpin.com/logo/twisted-pin-horizontal-white.png" width="150" alt="Twisted Pin" style="display:block;border:0;width:150px;height:auto;margin-bottom:16px;">
    <div style="color:#ffffff;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.01em;">The Playbook is live.</div>
    <div style="color:${GLOW};font-size:14px;line-height:1.5;margin-top:8px;">Our culture book and staff guidebook — on every teammate's phone.</div>
  </td></tr>

  <!-- TLDR -->
  <tr><td style="padding:26px 30px 6px;">
    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};font-weight:700;margin-bottom:12px;">The short version</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${RULE};border-radius:8px;margin-bottom:10px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};font-weight:700;">For teammates</div>
        <div style="margin-top:6px;"><a href="https://www.twistedpin.com/welcome" style="color:${INDIGO};font-size:17px;font-weight:700;text-decoration:none;">twistedpin.com/welcome</a></div>
        <div style="margin-top:8px;font-size:14px;color:${INK};">Password <b style="color:${ACCENT};font-size:16px;letter-spacing:0.03em;">${esc(teamPw)}</b></div>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${RULE};border-radius:8px;margin-bottom:16px;">
      <tr><td style="padding:16px 18px;">
        <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};font-weight:700;">For managers — who's read it</div>
        <div style="margin-top:6px;"><a href="https://www.twistedpin.com/playbook/status" style="color:${INDIGO};font-size:17px;font-weight:700;text-decoration:none;">twistedpin.com/playbook/status</a></div>
        <div style="margin-top:8px;font-size:14px;color:${INK};">Password <b style="color:${ACCENT};font-size:16px;letter-spacing:0.03em;">${esc(adminPw)}</b></div>
        <div style="margin-top:8px;font-size:12.5px;color:${MUTED};line-height:1.5;">Different on purpose — this page lists every teammate's name, and the whole team knows the other password.</div>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2F8;border-left:3px solid ${ACCENT};border-radius:4px;">
      <tr><td style="padding:14px 18px;font-size:14.5px;line-height:1.55;color:${INK};">
        <b>Please read both halves yourself and sign it.</b> You'll know what your team is being asked to read — and where to point them when they ask.
      </td></tr>
    </table>
  </td></tr>

  <!-- detail -->
  <tr><td style="padding:26px 30px 0;">
    <div style="height:1px;background:${RULE};margin-bottom:22px;"></div>

    <div style="font-size:15px;font-weight:700;color:${INDIGO};margin-bottom:6px;">Two halves</div>
    <div style="font-size:14.5px;line-height:1.6;color:${INK};margin-bottom:20px;">
      <b>The Playbook</b> is the culture book — our story, our values, and the real moments behind them. Read once, signed at the end.<br><br>
      <b>The Guidebook</b> is the practical half — scheduling, calling off, time off, uniforms, pay and tips, benefits, safety, perks. No signature; it has a search box, so a teammate can type “call off” or “when do I get paid” and land on the answer.
    </div>

    <div style="font-size:15px;font-weight:700;color:${INDIGO};margin-bottom:6px;">What you'll get when someone signs</div>
    <div style="font-size:14.5px;line-height:1.6;color:${INK};margin-bottom:10px;">info@ gets an email the moment a teammate signs:</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6FA;border-radius:6px;margin-bottom:12px;">
      <tr><td style="padding:12px 16px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;color:${INK};">
        George Smith signed the Playbook — 22 minutes of reading, 19 of 19 pages
      </td></tr>
    </table>
    <div style="font-size:14.5px;line-height:1.6;color:${INK};margin-bottom:10px;">
      Who signed, when (Central), how long they actually read, and how much they opened. We also record their device and <b>which version</b> of the books they signed — so if a policy changes, we know who agreed to the old one.
    </div>
    <div style="font-size:14.5px;line-height:1.6;color:${INK};margin-bottom:10px;">
      <b>The important part isn't the emails that arrive. It's the one that doesn't.</b> A new hire who never signs never sends one — and the status page lists anyone who started and stalled.
    </div>
    <div style="font-size:12.5px;line-height:1.55;color:${MUTED};margin-bottom:22px;">
      One caveat: reading time can be lost if someone reads on two devices or clears their browser, so a low number usually means the tracking dropped, not that they skimmed. It's a coaching signal, never proof.
    </div>

    <div style="font-size:15px;font-weight:700;color:${INDIGO};margin-bottom:6px;">Coming soon — the QR code</div>
    <div style="font-size:14.5px;line-height:1.6;color:${INK};margin-bottom:24px;">
      A printable sign is ready at <a href="https://www.twistedpin.com/playbook/poster" style="color:${ACCENT};">twistedpin.com/playbook/poster</a>. The plan is to frame it near the time clock so onboarding becomes “scan this” — and so any teammate can scan it months later to search the Guidebook for an answer, standing right there.
    </div>
  </td></tr>

  <!-- footer -->
  <tr><td style="padding:0 30px 28px;">
    <div style="height:1px;background:${RULE};margin-bottom:16px;"></div>
    <div style="font-size:12.5px;line-height:1.55;color:${MUTED};">
      <b style="color:${INK};">Keep this internal.</b> It contains both passwords. If it gets out, they can be changed without touching anything else.<br><br>
      If something in either book reads wrong or is out of date, say so — it's meant to be corrected.
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Plain-text alternative. Not a throwaway: some clients show it, and it's
 *  what screen readers and text-only previews use. */
function plain(teamPw: string, adminPw: string): string {
  return `THE PLAYBOOK IS LIVE
Our culture book and staff guidebook — on every teammate's phone.

THE SHORT VERSION

  Teammates:  twistedpin.com/welcome
  Password:   ${teamPw}

  Managers:   twistedpin.com/playbook/status
  Password:   ${adminPw}
  (Different on purpose — that page lists every teammate's name.)

  Please read both halves yourself and sign it.

TWO HALVES
The Playbook is the culture book — our story, our values, and the real moments
behind them. Read once, signed at the end. The Guidebook is the practical half
— scheduling, calling off, time off, uniforms, pay and tips, benefits, safety,
perks. No signature; it has a search box.

WHAT YOU'LL GET WHEN SOMEONE SIGNS
info@ gets an email the moment a teammate signs:

  "George Smith signed the Playbook — 22 minutes of reading, 19 of 19 pages"

Who signed, when (Central), how long they actually read, how much they opened,
their device, and which version of the books they signed.

The important part isn't the emails that arrive. It's the one that doesn't. A
new hire who never signs never sends one — and the status page lists anyone who
started and stalled.

Caveat: reading time can be lost if someone reads on two devices or clears
their browser, so a low number usually means the tracking dropped, not that
they skimmed. Coaching signal, never proof.

COMING SOON — THE QR CODE
A printable sign is ready at twistedpin.com/playbook/poster. The plan is to
frame it near the time clock so onboarding becomes "scan this" — and so any
teammate can scan it later to search the Guidebook for an answer.

KEEP THIS INTERNAL
It contains both passwords. If it gets out, they can be changed without
touching anything else. If something in either book reads wrong or is out of
date, say so — it's meant to be corrected.
`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
