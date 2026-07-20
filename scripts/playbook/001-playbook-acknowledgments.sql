-- Playbook acknowledgments — who signed the culture book, and when.
--
-- Target: the `twistedpin-platform` Supabase project (same Postgres that
-- Loyalty and Avery use). Public schema with a descriptive table name, per the
-- ADR-0012 amendment convention already in force there.
--
-- Written by /api/playbook-ack (Website repo) using the SERVICE ROLE key.
-- Read by whoever asks "did the new hire finish onboarding?" — see the query
-- at the bottom of this file.
--
-- ✅ ALREADY APPLIED to twistedpin-platform (project hdcoyqlskurvpjfrlnop) on
-- 2026-07-19 as migration `playbook_acknowledgments`. Verified after apply:
-- RLS enabled, 0 policies, 7 columns, 2 indexes. This file is kept as the
-- record of what was run — you do NOT need to run it again. Every statement is
-- idempotent (`if not exists`) if you ever rebuild the project from scratch.

create table if not exists public.playbook_acknowledgments (
  id          bigint generated always as identity primary key,

  -- Typed by the teammate on the final page. Free text on purpose: matching it
  -- against a roster would mean maintaining a roster, and the human reading the
  -- notification email already knows who they just hired.
  full_name   text        not null,

  -- When they signed. Stored UTC (timestamptz); rendered Central everywhere a
  -- human sees it.
  signed_at   timestamptz not null default now(),

  -- Evidence fields. Not identity — the gate is a SHARED password, so these
  -- corroborate a signature rather than prove one. Same standard as a typical
  -- e-signed handbook.
  ip_address  text,
  user_agent  text,
  page_url    text,

  created_at  timestamptz not null default now()
);

comment on table public.playbook_acknowledgments is
  'One row per teammate acknowledgment of the Twisted Pin Playbook (/playbook). Written by the Website /api/playbook-ack endpoint.';

-- The only query anyone actually runs: most recent signatures first.
create index if not exists playbook_ack_signed_at_idx
  on public.playbook_acknowledgments (signed_at desc);

-- RLS on with NO policies = deny-all to anon/authenticated clients. The
-- service role bypasses RLS, so the API endpoint still writes fine. This is
-- what keeps the table unreadable if the publishable key ever leaks — nothing
-- here is meant to be reachable from a browser.
alter table public.playbook_acknowledgments enable row level security;


-- ── Handy reads ────────────────────────────────────────────────────────────
--
-- Recent signatures, in Central time:
--   select full_name,
--          to_char(signed_at at time zone 'America/Chicago', 'Mon FMDD, YYYY FMHH12:MI AM') as signed,
--          ip_address
--   from public.playbook_acknowledgments
--   order by signed_at desc
--   limit 50;
--
-- Anyone who signed more than once (re-reads, or two people sharing a device):
--   select full_name, count(*), max(signed_at)
--   from public.playbook_acknowledgments
--   group by full_name
--   having count(*) > 1
--   order by max(signed_at) desc;
