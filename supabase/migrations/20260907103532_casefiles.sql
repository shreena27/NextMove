-- The casefiles table mirrors src/domain/casefile.ts; it does not
-- reinvent it. Three columns are promoted out of the Casefile object
-- because the SERVER needs them to enforce something (user_id for RLS,
-- engine_key/outcome for the partial unique index below); everything
-- else stays inside one opaque `data` JSONB blob. Postgres learns
-- nothing about diagnoses, and C8 adding fields to Casefile needs no
-- migration.
create table public.casefiles (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null,
  engine_key  text not null check (engine_key in ('passport','voter','sir')),
  outcome     text not null check (outcome in ('still_open','deliverable_received','closed_unresolved','superseded')),
  data        jsonb not null check (pg_column_size(data) < 65536),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
-- 'superseded' is included now, ahead of the TypeScript CaseOutcome union
-- (which gains it in Task 5, D3) — a migration is the one thing in this
-- chunk that is painful to amend later.

-- The ACTUAL guarantee of one-active-case-per-service. session/cases.ts's
-- completeSave enforces this client-side too, for instant UX, but the
-- client is never trusted — this is what makes the invariant real rather
-- than a suggestion. Both must exist; deleting either is a defect.
create unique index casefiles_one_open_per_service
  on public.casefiles (user_id, engine_key) where outcome = 'still_open';

alter table public.casefiles enable row level security;

create policy "own rows: select" on public.casefiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.casefiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- WITH CHECK here (not just USING) is the SOLE and SUFFICIENT protection
-- against a signed-in user updating one of their own rows and reassigning
-- its user_id to someone else's account. USING gates which existing rows
-- a user may touch; WITH CHECK gates what the row is allowed to become.
-- This file deliberately carries no PER-COLUMN privilege restriction on
-- user_id: in Postgres, revoking a privilege at column granularity has no
-- effect while the role still holds that same privilege at the table
-- level — which `authenticated` does, and must, because `upsert` sends
-- user_id in the row payload and an on-conflict update would otherwise be
-- denied outright. A column-scoped restriction here would be a no-op that
-- only LOOKS like defence in depth; this WITH CHECK clause is what
-- actually stops the reassignment.
create policy "own rows: update" on public.casefiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.casefiles for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Every `auth.uid()` above is wrapped as `(select auth.uid())`, never
-- called bare: the subselect form is evaluated once per query, the bare
-- form once per row. Invisible on a table this small — which is exactly
-- why it would get "simplified" back to the bare form later.

-- revoke + grant is the mechanism that makes "the diagnosis you just got
-- never required signing in" structurally true rather than a promise: an
-- anonymous browser cannot read or write a single row, whatever the
-- client code does. The grant is written explicitly, not relied on as a
-- Supabase base-image default — omitting it works only on Supabase;
-- replaying these migrations against a plain Postgres (exactly what a
-- fresh clone's `db reset` does) would then produce a table
-- `authenticated` cannot write, failing with an opaque permission error
-- far from its cause. Written after the revoke so the two read as
-- addressing different roles, not interacting with each other.
revoke all on public.casefiles from anon;
grant select, insert, update, delete on public.casefiles to authenticated;

-- No SECURITY DEFINER function is needed or added anywhere in this
-- migration. The whole path above runs as ordinary authenticated-client
-- upserts under the policies declared here. If a later chunk ever adds
-- one, it MUST be `security definer set search_path = ''` with every
-- identifier fully qualified (public.casefiles, auth.uid()) — enforced by
-- supabase/migrations.test.ts's SECURITY DEFINER guardrail.
