-- Which version of the books each signature was made against.
--
-- ✅ ALREADY APPLIED to twistedpin-platform (project hdcoyqlskurvpjfrlnop) on
-- 2026-07-20 as migration `playbook_version_stamp`. Kept as the record.
--
-- WHY: a signature that records "George signed on 7/20" but not WHAT he signed
-- is worth much less than it looks. The Guidebook itself says the tip pool "may
-- be adjusted based on business needs" and that PLAWA is expected to change —
-- so the document will drift, and every prior acknowledgment silently becomes a
-- signature on something that no longer exists. If a tip-pool split is ever
-- disputed, you need to show what was actually agreed to.
--
-- Cheap to add now, impossible to reconstruct later, which is why it landed
-- before anyone outside the owners had signed.
--
-- The stamp is DERIVED FROM THE CONTENT (src/lib/playbook-version.ts), not a
-- hand-bumped number — a manual version would be forgotten on exactly the edit
-- that mattered. Computed server-side only; never accepted from the client,
-- where it would be trivially forgeable.

alter table public.playbook_acknowledgments
  add column if not exists playbook_version text;

comment on column public.playbook_acknowledgments.playbook_version is
  'Content-derived stamp (e.g. pb-3f2a91c4) of the Playbook+Guidebook as rendered when signed. Compare against the current version to find teammates who signed an outdated document.';

update public.playbook_acknowledgments
   set playbook_version = 'pre-versioning'
 where playbook_version is null;


-- ── Who signed a version that has since changed ────────────────────────────
-- (Substitute the current stamp, shown on /playbook/status.)
--
--   select full_name,
--          playbook_version,
--          to_char(signed_at at time zone 'America/Chicago', 'Mon FMDD, YYYY') as signed
--   from public.playbook_acknowledgments
--   where playbook_version is distinct from 'pb-xxxxxxxx'
--   order by signed_at desc;
--
-- A flagged teammate agreed to a document that has since been edited. Whether
-- that needs a re-read depends on whether the change was material — a typo fix
-- and a tip-pool change both move the stamp, and only one of them matters.
