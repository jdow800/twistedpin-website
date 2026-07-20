-- Playbook reading sessions + the link from a signature back to its session.
--
-- ✅ ALREADY APPLIED to twistedpin-platform (project hdcoyqlskurvpjfrlnop) on
-- 2026-07-20 as migration `playbook_sessions`. Kept as the record of what ran;
-- every statement is idempotent if the project is ever rebuilt.
--
-- WHY A SECOND TABLE rather than more columns on playbook_acknowledgments:
-- the acknowledgment is the SIGNATURE — a deliberate act, and the record. This
-- is reading telemetry. Keeping them apart means the signature table stays
-- exactly what it claims to be, and it makes the question Jon actually cares
-- about answerable: "who started and never finished?" No completion-only table
-- can answer that, because you cannot notify someone about an event that
-- never happened.

create table if not exists public.playbook_sessions (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,

  -- Accumulated ONLY while the tab is visible (visibilitychange handler on
  -- /playbook). Wall-clock would report a teammate who read across two shifts
  -- as a 19-hour scholar and rate a speed-runner the same as someone who
  -- actually read it.
  --
  -- ⚠️ CLIENT-REPORTED AND THEREFORE FORGEABLE. Leaving the tab open inflates
  -- it. This is a coaching signal ("worth a proper read"), NOT evidence, and
  -- must never be used as the basis for discipline.
  active_seconds integer,
  pages_viewed   integer,
  total_pages    integer,

  ip_address    text,
  user_agent    text
);

comment on table public.playbook_sessions is
  'Playbook reading sessions. completed_at IS NULL = started but never signed.';

create index if not exists playbook_sessions_started_idx
  on public.playbook_sessions (started_at desc);
create index if not exists playbook_sessions_incomplete_idx
  on public.playbook_sessions (started_at desc) where completed_at is null;

alter table public.playbook_acknowledgments
  add column if not exists session_id uuid references public.playbook_sessions(id);

alter table public.playbook_sessions enable row level security;

-- Grants FIRST. Tables created through the Supabase MCP connection do NOT
-- receive the default role grants, and because service_role bypasses RLS the
-- resulting 42501 looks like a policy problem when it is not. This cost a
-- debugging round on 001 — see that file's history.
grant insert, select, update on public.playbook_sessions to service_role;
revoke all on public.playbook_sessions from anon, authenticated;
grant update on public.playbook_acknowledgments to service_role;


-- ── The two reads that matter ──────────────────────────────────────────────
--
-- Started but never signed (the whole reason this table exists):
--   select full_name,
--          to_char(started_at at time zone 'America/Chicago', 'Mon FMDD FMHH12:MI AM') as started,
--          age(now(), started_at) as waiting
--   from public.playbook_sessions
--   where completed_at is null
--   order by started_at desc;
--
-- Completions with reading time, fastest first (a very low number is worth a
-- friendly "give it a proper read" — nothing more than that):
--   select full_name,
--          round(active_seconds / 60.0, 1) as minutes,
--          pages_viewed || ' / ' || total_pages as pages,
--          to_char(completed_at at time zone 'America/Chicago', 'Mon FMDD FMHH12:MI AM') as signed
--   from public.playbook_sessions
--   where completed_at is not null
--   order by active_seconds asc nulls last;
