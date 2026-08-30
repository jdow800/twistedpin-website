# Digital invitations / RSVP product — maintenance handoff (2026-08-28)

**Read this first for anything touching invitations, RSVPs, guest email, the host dashboard, the seven looks, or Avery's invitation knowledge.** It is the map; the append-only chronology lives in memory `tprs-invitations-rsvp-build`, the rulings in CLAUDE.md's In Progress bullet, and the KB text in `Marketing Avery/brain/kb/Avery_KB.md` (Section 20 subsection "Digital invitations and RSVPs").

Status at hand-off: **LIVE for real guests** (allowlist removed 8/28 evening). Everything below is deployed on tprs `main` (last PR #138; the hardening commits #128-#131 had their own adversarial second pass, #132; #137 Customize open by default; #138 naming gate) and Render `srv-d8i3mgmrnols73baqth0`.

---

## 1. What it is, in one paragraph

Every catered event (once its deposit is paid), every kids party, and every fundraiser gets an `event_invitation` row: a **host dashboard** (`/m/host/<slug>-<12-char token>`, money may render) and a **guest invitation link** (`/i/<8-char token>`, money can never render — the view model has no field for it). Hosts name the event, pick one of seven looks, edit tagline/note, upload a photo, share the guest link themselves, watch RSVPs, download a CSV. Guests RSVP coming/can't (with party size), get a confirmation email + a day-of reminder + cancel/move notices from a **separate Resend team** on `invites.twistedpin.com`. Guest rows are purged 14 days after event end. Avery delivers the dashboard URL once on the deposit-paid turn and answers support questions from the KB. Twisted Pin never sends invitations to guests; hosts do.

---

## 2. File map (tprs `apps/backend`)

| Concern | File |
|---|---|
| Schema | `src/db/schema/invitations/event_invitation.ts`, `event_invitee.ts`; migrations `drizzle/0148`–`0158` |
| Mint / revoke / tokens / slugs | `src/services/invitations.ts` (`issueInvitation`, `hostTokenCandidates`, `buildHostDashboardPath`, `cleanInvitationDetail`, `stepperMaxFor`, `resolveInvitationShape`) |
| RSVP write path | `src/services/invitation-rsvp.ts` (`submitRsvp`, `declineByManageToken`, `listInvitees`, `rsvpSummary`, `INVITATION_TERMINAL_STATUSES`, `MAX_INVITEES_PER_INVITATION`) |
| Read models (the two projections) | `src/services/invitation-read-models.ts` (`loadHostDashboard`, `loadGuestInvitation`, `rsvpOpenFor`) |
| Routes (host + guest) | `src/invitation.routes.ts` (dashboard, details POST, photo POST/remove, guests.csv, preview, guest page, RSVP POST, .ics, manage page GET/POST, `clientIp`) |
| Themes | `src/services/invitation-themes.ts` (registry), `views/guest/_themes/*.eta` (7 partials), `views/guest/invitation.eta` (shell + kicker + og tags) |
| Host dashboard | `views/guest/host-dashboard.eta` (picker, preview iframe, Customize fold, photo control, RSVP list fold, CSV link) |
| Guest emails | `src/services/invitation-emails.ts` (confirmation, reminder, `fanOutInvitationChange`), templates `views/emails/guest-*.eta`, `src/services/email-orchestration.ts` (`fanOutToInvitees`, `invitationLinksExtra`, `sendInvitationLinkEmail`) |
| Crons | `src/workers/invitation-reminder-cron.ts`, `src/workers/invitee-purge-cron.ts` (mounted in `src/workers/main.ts`) |
| Photo pipeline | `src/services/product-images.ts` (kind `invitation`), `src/lib/storage.ts` (public bucket) |
| Admin | `src/admin/bookings.ts` (Invitation & RSVPs card, mint/revoke/re-mint, Email links to host, reactivate hook) |
| Auto-mint | `src/services/staff-direct-booking.ts` (kids + fundraiser at creation), `src/services/rail-webhook-handler.ts` + `services/payment.ts` (catered at deposit; kids at full pay) |
| Dev preview (no DB needed) | `/admin/dev/invitation-preview` → `src/admin/dev-invitation-preview.ts` |
| Tests | `src/invitation.routes.test.ts`, `src/services/invitation-*.test.ts`, `src/workers/invit*.test.ts` |

Website repo: `/invite-previews/` gallery (static renders of the real templates, unindexed) — `src/pages/invite-previews.astro` + `public/invite-previews/`.

Marketing Avery: KB subsection (~line 2697), fundraiser mention (~520), WF2 prompt `brain/prompts/build-avery-request.js` (`_bkInviteClause`), `brain/wf2/pre-assemble-context.js` (`ctx.invitation_host_url`), patch scripts `brain/deploy/patch-outbox-ack-invitation.mjs`, `patch-wf2-fundraiser-booked-reply.mjs`, `patch-wf2-invitation-context.mjs`.

---

## 3. Invariants (break one and something leaks or lies)

1. **Money is a property of the surface.** `GuestInvitationView` has no money field; never add one. The host token is the only thing that may see money. The dashboard link goes to the booker only.
2. **Never mint these tokens in `magic_link_token`.** They have no expiry, no consume, no session.
3. **Every host write route resolves through `hostTokenCandidates` and filters `revoked_at IS NULL`.** A guest token on a host route must 404. Test: "guest token never takes uploads".
4. **The guest page is a LIVE view, never a snapshot** — cancellation renders as cancellation, a move self-heals, a purge shows "cleared". No 404s on a link sitting in a group chat.
5. **Terminal booking statuses** (`cancelled`, `refunded`, `failed_payment`, `no_show`) close everything via `isInvitationTerminalStatus` — used by the read model, `submitRsvp`, and the reminder cron. Add a status there, not in three places.
6. **Guest emails send only when the rail is configured** (`INVITATIONS_RESEND_API_KEY` + `INVITATION_BASE_URL`/`MAGIC_LINK_BASE_URL`). Fan-outs are SAVEPOINT-wrapped and fail-open: an invitation bug can never block a cancel, refund, or move.
7. **Manage-page GET is read-only** (mail scanners prefetch). All mutations are POST and go through `submitRsvp` so every gate applies.
8. **Reminder is once-only** via `UPDATE … WHERE reminder_sent_at IS NULL RETURNING`; reschedule clears stamps; the tick re-reads the window under the stamp.
9. **Purge at 14 days past event END** deletes invitee rows, the photo blob, and redacts guest addresses/names from `guest.*` outbox rows. A stamped invitation is never re-scanned; a reschedule into the future clears the stamp; RSVPs refuse while purged.
10. **Re-mint is fresh**: rotates both tokens, resets title/host/theme/tagline/note, deletes invitee rows, nulls + deletes the photo, clears the purge stamp, re-resolves shape/cap.
11. **Host dashboard and guest page both key "cancelled" on `isInvitationTerminalStatus`** (`HostDashboardView.cancelled`), never on the raw status string.
12. **Rate limits key on `clientIp()`** (first `x-forwarded-for` hop) — `request.ip` is Render's load balancer.
13. **The guest-page money-leak test bans the literal words `$`, `balance`, `total`** in the rendered HTML. `text-wrap: balance` cannot ship; use `pretty`.
14. **Theme ids are duplicated in a SQL CHECK (0156).** Adding a look in `invitation-themes.ts` without a migration makes the host's Save 500.

---

## 4. Rulings of record (don't re-pitch)

- Guest emails: **in the CSV download, disclosed to the guest on the form** ("shared with your event host, who may reach out"); never on the dashboard screen. Reversed the earlier "never" ruling the same night.
- **No host blast through our platform, ever.** Hosts use the download and their own email ("they can CC ppl, that is their problem").
- Party-size caps: kids **6** (count kids only), fundraiser **12** (people), catered **4** (a colleague plus coworkers, migration 0158). Clamp, never reject.
- RSVPs close at START for kids/catered, at **END for fundraisers** (walk-up = staffing signal). A **can't-make-it on an existing row stays allowed until END** on every shape (the day-of reminder's manage link exists for that; declines never add heads). Nothing is ever reserved off a tally; RSVP counts are never the booked headcount.
- Late-addition alert: **catered only**, after final payment, head-adding yes → sticky tag + host banner + one staff email.
- Fundraisers get invitations **at creation regardless of deposit/full-pay setup**. Catered full-pay never gets one automatically (staff mint by hand).
- Retention **14 days** ("2 weeks of an off-ramp").
- Kicker: "*Host* invited you to a fundraiser / a party" (kids) / plain for catered. Looks are vibes, not occasion categories; the title carries the occasion.
- **Naming gate (2026-08-30, tprs #138):** the invitation link (dashboard share box AND the confirmation-email guest link) is withheld until the host saves an Event name. Tagline/note/photo stay optional. Trigger: the first real host read the fallback "<First name>'s event at Twisted Pin" as a name we chose. The fallback is never shown as the input placeholder any more (example names per shape instead).
- Customize the wording fold opens by default (#137).
- Defaults: kids → Confetti Strike, else Classic (Jon hasn't ruled further).
- Answered Poster ignores the host photo **by design**.
- Reactivation after cancel → guests re-notified as "moved" (#131). Package change after mint → ignored by ruling.
- Avery: delivers the hub URL herself once on the deposit-paid turn (SMS or email), never types a link she wasn't given, never gives a numbered walkthrough at inquiry stage. The staff `$/head` anchor and "slot/window" bans from other sessions still apply.

---

## 5. Troubleshooting — symptom → where to look

| Symptom | First checks |
|---|---|
| "Guest didn't get the confirmation" | Only sent on a **coming** answer with an email, only when coming is *established* (a same-name resubmit is an edit and does not resend). Resend invites-team dashboard → delivered/bounced. Outbox: `email_outbox_event` where `email_type LIKE 'guest.%'` and `subject_booking_id`. Bounces now arrive via `/webhooks/email/resend/invitations`. Fix for a typo: guest answers can't-make-it then coming again. No resend button exists. |
| "Reminder came the day before / didn't come" | `computeReminderDueAt`: start − 4.5h; if before 9am CT → 6pm CT the day before. Guests who RSVP'd after the due moment are stamped-not-mailed. Cron only logs when it sends; 17 workers at boot = mounted. |
| "Link says cancelled, we didn't cancel" | Booking status is read live. Check `bookings.status` — auto-expiry (lapsed deposit link), refund-to-zero (`refunded`), or no-show all close it. Reactivate re-notifies guests. |
| "Link not found" | Revoked + re-minted (old links die), or a malformed slug. Host re-shares the new link. |
| "Guest list cleared / empty" | 14-day purge (`invitees_purged_at` set). Unrecoverable by design. CSV must be downloaded inside the window. |
| "Photo didn't show / upload failed" | 25 MB, PNG/JPEG/WebP/GIF, 30 MP decode ceiling, rate-limited. Stored in the public Supabase bucket (`SUPABASE_PUBLIC_BUCKET`); dev serves `/api/product-images/`. Answered Poster never shows it. |
| "This invitation has hit its RSVP limit" | `MAX_INVITEES_PER_INVITATION` (300 rows). Raise the constant or clean junk rows. |
| "Too many attempts" for real guests | `clientIp()` — confirm `x-forwarded-for` is present in prod; 30 writes/min per client. |
| "Where is my invitation link?" / "it says my name for the event" | Naming gate: the host has not saved an Event name yet. Dashboard shows Step 1; link appears after Save. The fallback title is never a choice. |
| "Preview looks different from the link" | Host didn't press **Save details**; tagline/note don't change the title. |
| "RSVP count ≠ headcount" | By design; late additions tagged. |
| Dashboard shows money to the wrong person | The host URL was shared beyond the booker — revoke + re-mint from the admin card. |
| Same guest twice | Different spelling = new row (normalized-name upsert). Add a last initial. |

Prod checks: `select shape, max_party_size, invitees_purged_at, revoked_at, theme, photo_key from event_invitation`; Render logs filter `invitation-reminder-cron|invitee-purge-cron` (silent on quiet ticks).

---

## 6. Runbooks

**Add / change a look.** Edit `views/guest/_themes/<id>.eta` on the four-part contract (`head` / `pre` / `masthead` / `post`); shared blocks (`.when`, `.cal-row`, `.banner`, `.rsvp`, `h2 + ul.know`, `.foot`, `.preview-ribbon`, `.slot-hint`) are styled, never re-rendered. New id → add to `THEME_IDS` + `THEMES` **and** a migration widening the `event_invitation_theme_known` CHECK. Run `invitation.routes.test.ts` (the every-look sweep asserts money-free rendering). Then re-render the Website gallery (below). Verify at a true 390px: headless Chrome floors the viewport at 500px, so wrap the page in a 390px iframe (or use DevTools device mode).

**Re-render `/invite-previews/`.** `PREVIEW=1 node scripts/render-invite-previews.cjs` (Website repo; renders the real tprs templates from the sibling `../tprs` checkout, 7 looks × 3 shapes, into `public/invite-previews/`); commit + push (Vercel auto-deploys).

**Change Avery's invitation knowledge.** Edit `brain/kb/Avery_KB.md` (facts in her voice, no numbered scripts, no em dashes), add a `kb/CHANGELOG.md` entry, `node brain/deploy/deploy-kb.mjs --yes --skip-golden`. Prompt changes: `brain/prompts/build-avery-request.js` then `node brain/deploy/deploy-n8n.mjs --only WF2 --skip-golden --yes`. The deposit-ack and fundraiser Booked Reply link sentences are **patch scripts on n8n nodes**, not KB text — re-run them after editing those nodes. Deploy KB text about a feature only after the Render deploy is live.

**Guest email rail env (Render).** `INVITATIONS_RESEND_API_KEY` (second Resend team), `INVITATION_BASE_URL` (falls back to `MAGIC_LINK_BASE_URL`), `INVITATIONS_RESEND_WEBHOOK_SECRET` (webhook at `/webhooks/email/resend/invitations`; mounts independently of the main `RESEND_WEBHOOK_SECRET`). `INVITATIONS_EMAIL_ALLOWLIST` = test mode only; **absent in prod since 8/28**. Setting it again silently suppresses guest mail to everyone not listed.

**Retention / caps knobs.** `RETENTION_DAYS` (purge cron), `KIDS/FUNDRAISER/CATERED_STEPPER_MAX` (invitations.ts; changing only affects new mints — backfill with SQL), `MAX_INVITEES_PER_INVITATION`, `TAGLINE_MAX`/`NOTE_MAX`.

---

## 7. Watch items (first real occurrences, nothing to build)

- Fake fundraiser reminder fires **Thu Sept 3 12:30pm CT** — first live reminder-cron send.
- First real DEPOSIT PAID Avery turn sharing the hub URL (Justine E-1240170 / Bri E-8556125 qualify); first deposit-ack SMS with the link; first Avery-booked fundraiser confirmation with the link.
- First fundraiser share burst (new-domain deliverability; Google Postmaster Tools optional).
- First real cancel/reschedule fan-out; first late-addition alert.
- Adoption: are hosts pressing Create → naming → sharing? (`event_invitation` rows with `display_title` set + invitee counts.)

## 8. Deliberately not built

Host blast · email column on the dashboard screen · guests seeing the going-count · confirm-headcount signal · per-look rendered OG cards (title in each look's type) · package-change re-resolve after mint · a "resend confirmation" button.
