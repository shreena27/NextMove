import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Live-stack integration test. The static test (migrations.test.ts) can
// only prove the SQL is worded the load-bearing way; it cannot prove a
// policy does what it says. This exercises RLS against two REAL signed-in
// sessions on the running local stack — the two `test_otp` numbers Task 1
// configured (919876543210 / 919876543211, "123456").
//
// Gated behind NEXTMOVE_SUPABASE_LIVE so `npm test` and CI stay hermetic:
//   NEXTMOVE_SUPABASE_LIVE=1 npx vitest run supabase/rls.live.test.ts
//
// A skipped test that has never been run is not evidence — this file was
// run by hand, both before the migration existed (all fail, on
// "relation \"public.casefiles\" does not exist") and after applying it
// (`npx supabase db reset`), and the real output of both runs is recorded
// in the Task 2 completion note, not just this comment.

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..')

// Read the local Supabase URL/anon key straight out of .env.local, the
// same way config-auth.test.ts reads config.toml directly rather than
// depending on how any particular test runner exposes import.meta.env —
// this file wants ONE clear, inspectable source for "what stack am I
// talking to", not an assumption about Vite env injection reaching a
// node:fs-importing test file under supabase/ (which sits outside
// tsconfig.app.json's own "include": ["src"], per design note 5).
function readEnvLocal(key: string): string {
  const text = readFileSync(resolve(projectRoot, '.env.local'), 'utf-8')
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(text)
  if (!match) throw new Error(`${key} not found in .env.local`)
  return match[1].trim()
}

const SUPABASE_URL = readEnvLocal('VITE_SUPABASE_URL')
const SUPABASE_ANON_KEY = readEnvLocal('VITE_SUPABASE_ANON_KEY')

// Task 1's two test_otp fixtures. E.164 with the leading "+" for
// signInWithOtp (GoTrue requires it); the config.toml keys themselves are
// stored WITHOUT it (D12) — that distinction lives in auth.ts (Task 3),
// not here, and this file only ever uses the E.164 form to sign in.
const PHONE_A = '+919876543210'
const PHONE_B = '+919876543211'
const OTP = '123456'

function newAnonClient(): SupabaseClient {
  // A unique storageKey per client avoids GoTrue's "multiple client
  // instances share a storage key" console warning — this file
  // deliberately creates several independent clients (A, B, and one or
  // more anonymous ones) in the same Node process, which is exactly the
  // shape that warning exists to catch in a browser but is expected and
  // harmless here.
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `sb-test-${randomUUID()}` },
  })
}

async function signInTestUser(phone: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = newAnonClient()
  const { error: otpError } = await client.auth.signInWithOtp({ phone })
  if (otpError) throw new Error(`signInWithOtp(${phone}) failed: ${otpError.message}`)
  const { data, error } = await client.auth.verifyOtp({ phone, token: OTP, type: 'sms' })
  if (error) throw new Error(`verifyOtp(${phone}) failed: ${error.message}`)
  if (!data.user) throw new Error(`verifyOtp(${phone}) returned no user`)
  return { client, userId: data.user.id }
}

describe.skipIf(!process.env.NEXTMOVE_SUPABASE_LIVE)('casefiles RLS — live stack (Task 2)', () => {
  let clientA: SupabaseClient
  let clientB: SupabaseClient
  let userIdA: string
  let userIdB: string

  // A single shared row id, reused across the ordered tests below that
  // narrate one story (A inserts -> B can't see/touch it -> A can't
  // reassign it). Randomised per run so re-running this file without a
  // `db reset` in between never collides with a previous run's leftovers.
  const caseIdA1 = `passport-${randomUUID()}`
  const caseIdA2 = `passport-${randomUUID()}`
  const caseIdA3 = `passport-${randomUUID()}`

  beforeAll(async () => {
    const a = await signInTestUser(PHONE_A)
    const b = await signInTestUser(PHONE_B)
    clientA = a.client
    userIdA = a.userId
    clientB = b.client
    userIdB = b.userId

    // Clean slate for THIS test file's own data, scoped to each user's own
    // rows only (RLS itself enforces that — a user can only delete their
    // own rows), so re-running this file is idempotent without needing a
    // full db reset every time.
    //
    // Errors here are NOT swallowed, deliberately: several tests below
    // assert "expect an error" (the anon-denied tests, the unique-index
    // rejection). If this cleanup step silently ignored a missing-table
    // error, every one of those "expect an error" tests would trivially
    // pass before the migration exists too — for the WRONG reason (the
    // whole table is gone, not the specific protection under test) — which
    // is exactly the "RED not genuinely observed" shape this project's own
    // review has flagged before. Throwing here instead fails beforeAll,
    // which fails every test in this file, so "all fail before the
    // migration is applied" is actually true rather than accidentally true
    // for 6 of 9 and vacuously true for the other 3.
    const { error: cleanupA } = await clientA.from('casefiles').delete().neq('id', '')
    if (cleanupA) throw new Error(`setup: could not clear user A's existing casefiles rows: ${cleanupA.message}`)
    const { error: cleanupB } = await clientB.from('casefiles').delete().neq('id', '')
    if (cleanupB) throw new Error(`setup: could not clear user B's existing casefiles rows: ${cleanupB.message}`)
  }, 30_000)

  it('user A inserts a row and can select it back', async () => {
    const { error: insertError } = await clientA
      .from('casefiles')
      .insert({ id: caseIdA1, engine_key: 'passport', outcome: 'still_open', data: { note: 'A owns this' } })
    expect(insertError, insertError?.message).toBeNull()

    const { data, error } = await clientA.from('casefiles').select('*').eq('id', caseIdA1)
    expect(error, error?.message).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].engine_key).toBe('passport')
    expect(data![0].user_id).toBe(userIdA)
  })

  it('user B selects and gets zero rows — not an error, zero rows (this is what RLS looks like when it works)', async () => {
    const { data, error } = await clientB.from('casefiles').select('*')
    expect(error, error?.message).toBeNull()
    expect(data).toEqual([])
  })

  it("user B cannot update A's row — zero rows affected, not an error", async () => {
    const { data, error } = await clientB
      .from('casefiles')
      .update({ outcome: 'closed_unresolved' })
      .eq('id', caseIdA1)
      .select()
    expect(error, error?.message).toBeNull()
    // Not attributed to the UPDATE policy's USING clause specifically:
    // this file never isolates whether USING or the SELECT policy (also
    // applied when a RETURNING/select() is requested) is what's zeroing
    // out the result — see the WITH CHECK test below for that isolation
    // work. Either way, RLS as a whole must keep B off A's row.
    expect(data, "B's update must match zero rows — RLS scopes casefiles to the owning user, so B's update touches none of A's rows").toEqual([])

    const { data: check } = await clientA.from('casefiles').select('outcome').eq('id', caseIdA1)
    expect(check![0].outcome, "A's row must be unaffected by B's attempted update").toBe('still_open')
  })

  it("user B cannot delete A's row — zero rows affected, not an error", async () => {
    const { data, error } = await clientB.from('casefiles').delete().eq('id', caseIdA1).select()
    expect(error, error?.message).toBeNull()
    expect(data).toEqual([])

    const { data: check } = await clientA.from('casefiles').select('id').eq('id', caseIdA1)
    expect(check, "A's row must still exist after B's attempted delete").toHaveLength(1)
  })

  it("user A cannot change their own row's user_id to B's — the WITH CHECK test, the single most important assertion in this file", async () => {
    const { data, error } = await clientA
      .from('casefiles')
      .update({ user_id: userIdB })
      .eq('id', caseIdA1)
      .select()

    // USING (auth.uid() = user_id, evaluated on the OLD row) passes here —
    // A currently owns this row, so the row is visible to the update. The
    // reassignment is then rejected with a genuine RLS-violation error
    // (42501) rather than silently affecting zero rows, because there WAS
    // a matching row; the proposed new state of it is what's illegal.
    //
    // TWICE-CORRECTED account of the mechanism, both corrections
    // empirically verified against the live stack rather than assumed:
    //
    // 1) The implementer removed this policy's explicit `with check (...)`
    //    (leaving `using ((select auth.uid()) = user_id)` in place) and
    //    found the reassignment STILL rejected — psql-inspected
    //    `pg_policy.polwithcheck` was genuinely null. That matches
    //    documented PostgreSQL RLS behaviour (an UPDATE policy with no
    //    WITH CHECK reuses USING as the implicit check on the new row),
    //    and was read as proof that the explicit clause isn't the sole
    //    thing blocking reassignment here.
    // 2) The Task 2 reviewer mutation-tested that claim in isolation and
    //    found it doesn't hold up: mutating this UPDATE policy to
    //    `using (true)` with NO with check at all (removing the fallback
    //    path too) STILL rejects the reassignment — 9/9 green. Only
    //    loosening the SELECT policy's own `using` clause lets the
    //    reassignment actually go through (verified via psql: the row
    //    genuinely moves to B). So in experiment 1, both the UPDATE
    //    policy's implicit-check fallback AND the SELECT policy applied
    //    to the touched row would have independently rejected the
    //    reassignment — the experiment left USING owner-scoped throughout,
    //    so it could not distinguish which one was actually doing the
    //    work. The SELECT policy is the layer this specific mutation
    //    sequence isolates as sufficient on its own; this file does not
    //    isolate the UPDATE policy's own using/with-check clauses from the
    //    SELECT policy the same way, so it cannot claim credit for either
    //    one specifically — a real, documented coverage gap, not a
    //    vulnerability (every layer involved is present and correct as
    //    shipped). The explicit WITH CHECK clause stays exactly as
    //    written regardless: correct practice, self-documenting intent,
    //    and it stops being redundant the moment USING is ever loosened
    //    independently without WITH CHECK deliberately following. See the
    //    Task 2 completion note and its Fix Round 1 section for the full
    //    experiment history (with-check removed, then using(true) with no
    //    check, then SELECT loosened — each re-run against a fresh
    //    `db reset`, pg_policy inspected via psql, all reverted after).
    expect(
      error,
      'expected the reassignment to be rejected by RLS as a whole (the UPDATE policy directly, and/or the SELECT policy applied to the touched row — see the comment above for what this specific test can and cannot isolate); if this is null the reassignment silently succeeded, which is the exact privilege-escalation footgun design note 2 exists to prevent',
    ).not.toBeNull()
    expect(data).toBeNull()

    const { data: check } = await clientA.from('casefiles').select('user_id').eq('id', caseIdA1)
    expect(check![0].user_id, "A's row must still belong to A after the rejected reassignment attempt").toBe(userIdA)
  })

  it('a second still_open row for the same (user_id, engine_key) is rejected by the partial unique index', async () => {
    const { error } = await clientA
      .from('casefiles')
      .insert({ id: caseIdA2, engine_key: 'passport', outcome: 'still_open', data: {} })
    expect(
      error,
      'expected a unique-index violation on a second still_open passport row for the same user, but the insert succeeded — casefiles_one_open_per_service is missing, wrong, or not partial',
    ).not.toBeNull()
  })

  it('a second row for the same service with outcome=superseded IS accepted — proving the index is partial, which is the whole point', async () => {
    const { error } = await clientA
      .from('casefiles')
      .insert({ id: caseIdA3, engine_key: 'passport', outcome: 'superseded', data: {} })
    expect(error, error?.message).toBeNull()
  })

  it('an anonymous client (anon key, no session) gets an error on select — anon holds no table privilege at all after "revoke all ... from anon", so the failure happens before RLS is ever consulted', async () => {
    const anon = newAnonClient()
    const { data, error } = await anon.from('casefiles').select('*')
    // NOTE on this assertion vs. the brief's literal wording ("zero rows
    // on select"): with `revoke all on public.casefiles from anon` and no
    // matching grant, Postgres denies SELECT at the table-privilege layer,
    // BEFORE row-level security policies are ever evaluated — this is a
    // real, correctly-diagnosed permission error (PostgREST/PostgreSQL
    // 42501), not an empty result set. An empty array would actually mean
    // anon still HAS select privilege and RLS alone is doing the work,
    // which is a weaker guarantee than what this migration's revoke
    // actually provides. Verified empirically against the running stack
    // (see the Task 2 completion note) rather than assumed either way.
    expect(data).toBeNull()
    expect(error, 'anonymous select must be denied outright by the table-level revoke, not merely filtered to zero rows by RLS').not.toBeNull()
  })

  it('an anonymous client (anon key, no session) gets an error on insert', async () => {
    const anon = newAnonClient()
    const { error } = await anon
      .from('casefiles')
      .insert({ id: `anon-${randomUUID()}`, engine_key: 'passport', outcome: 'still_open', data: {} })
    expect(error, 'an anonymous browser must not be able to write a casefiles row under any circumstances').not.toBeNull()
  })
})
