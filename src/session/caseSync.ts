// Remote casefile read/write, and the pure sign-in migration plan. This is
// the riskiest module in C7 — an independent assessment of this chunk named
// this file specifically as the piece most likely to lose a citizen's data.
// Built and tested with no UI attached (Task 7); Task 8 wires it into
// App.tsx's auth lifecycle.
//
// This is the second of the two files allowed to import `getClient()`
// (supabase.ts's own doc comment names both `auth.ts` and this file).
import type { Casefile } from '../domain/casefile'
import { LOG_COPY } from '../domain/casefile'
import { appendLog } from './cases'
import { getClient } from './supabase'
import { loadCases, clearLocalCases } from './caseStore'

// =============================================================================
// The row shape <-> Casefile adapter pair (design note 1)
// =============================================================================

/** The `casefiles` table row shape (supabase/migrations/…_casefiles.sql).
 *  `data` carries the WHOLE Casefile, including the three fields also
 *  promoted into columns (`engine_key`, `outcome`, and `user_id`/`id`
 *  implicitly via `id`/`user_id`) — the duplication is deliberate: the
 *  columns exist for the server's constraints, `data` is the client's
 *  record, and a round trip must be lossless without the client
 *  reassembling an object from columns. */
export interface CasefileRow {
  user_id: string
  id: string
  engine_key: Casefile['engineKey']
  outcome: Casefile['outcome']
  data: Casefile
  updated_at: string
}

/** `unsaved?: true` must never reach the server: a working case is by
 *  definition not saved, and a row carrying `unsaved` would come back and
 *  make a saved case render as unsaved. Stripped here, not at each call
 *  site, so every caller of `caseToRow` gets this for free. */
export function caseToRow(userId: string, c: Casefile): CasefileRow {
  const { unsaved: _unsaved, ...rest } = c
  return {
    user_id: userId,
    id: c.id,
    engine_key: c.engineKey,
    outcome: c.outcome,
    data: rest as Casefile,
    updated_at: new Date().toISOString(),
  }
}

/** The inverse of `caseToRow`. `data` is already the full, lossless
 *  client record — nothing is reassembled from the promoted columns. */
export function rowToCase(row: CasefileRow): Casefile {
  return row.data
}

// =============================================================================
// Discriminated results, matching auth.ts's convention exactly.
// =============================================================================

export type FetchCasesResult = { ok: true; cases: Casefile[] } | { ok: false; error: string }
export type PushCasesResult = { ok: true } | { ok: false; error: string }
export type MigrationResult = { ok: true; cases: Casefile[] } | { ok: false; error: string }

/** Converts BOTH failure channels a Supabase call can produce into the
 *  same `{ ok: false, error }` shape — a resolved `{ error }` (handled
 *  inline at each call site) AND a genuinely thrown/rejected promise
 *  (handled here), mirroring `auth.ts`'s own `guardResult`. This module
 *  does not import that one (it is module-private there) — same shape,
 *  duplicated once rather than exported across an unrelated surface. */
async function guardResult<R extends FetchCasesResult | PushCasesResult>(fn: () => Promise<R>): Promise<R> {
  try {
    return await fn()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) } as R
  }
}

// =============================================================================
// fetchRemoteCases / pushCases — the impure I/O boundary (design notes 2, 3)
// =============================================================================

/** `select('*')` — RLS scopes it to the caller, so no `.eq('user_id', …)`
 *  is added; adding one would imply the filter is what protects the data,
 *  which it is not. Sorted newest-first by `savedAt`, matching the order
 *  `completeSave` maintains locally with its `unshift` and that Home
 *  renders directly. Returns `{ ok: false }` with NO call attempted when
 *  there is no session — the Global Constraint. */
export async function fetchRemoteCases(): Promise<FetchCasesResult> {
  return guardResult(async () => {
    const { data: sessionData, error: sessionError } = await getClient().auth.getSession()
    if (sessionError) return { ok: false, error: sessionError.message }
    if (!sessionData.session) return { ok: false, error: 'not signed in' }

    const { data, error } = await getClient().from('casefiles').select('*')
    if (error) return { ok: false, error: error.message }
    const cases = ((data ?? []) as CasefileRow[]).map(rowToCase)
    cases.sort((a, b) => b.savedAt - a.savedAt)
    return { ok: true, cases }
  })
}

/** A single `upsert(rows, { onConflict: 'user_id,id' })` — one call, not
 *  N. Same no-session guard as `fetchRemoteCases`.
 *
 *  Design note 3 — `caseToRow`'s `userId` comes from the very same read
 *  that implements the no-session guard: this function calls
 *  `getClient().auth.getSession()` ONCE, returns `{ ok: false }` when
 *  there is no session, and otherwise uses that session's `user.id` as
 *  the `userId` for every `caseToRow` call. One read, one source — the
 *  guard and the id can never disagree. */
export async function pushCases(cases: Casefile[]): Promise<PushCasesResult> {
  return guardResult(async () => {
    const { data: sessionData, error: sessionError } = await getClient().auth.getSession()
    if (sessionError) return { ok: false, error: sessionError.message }
    const session = sessionData.session
    if (!session) return { ok: false, error: 'not signed in' }

    const rows = cases.map(c => caseToRow(session.user.id, c))
    const { error } = await getClient().from('casefiles').upsert(rows, { onConflict: 'user_id,id' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  })
}

// =============================================================================
// migrateLocalCases — the PURE sign-in migration plan (design notes 4-7, 10)
// =============================================================================

export interface MigrationPlan {
  toUpload: Casefile[]
  adopted: Casefile[]
  merged: Casefile[]
}

/** PURE. No I/O, no clock calls, no id minting, no storage access — every
 *  value it needs (including the clock, `now`) comes in as an argument.
 *  All impure orchestration (fetch, plan, push, then clear local) lives
 *  separately in `runSignInMigration` below.
 *
 *  `adopted` is what the server already held (design note 4): the
 *  ENTIRE `remote` list — every remote row is something the citizen
 *  already has account access to, whatever its outcome, and nothing on
 *  the local side ever removes or edits a remote row (the conflict path
 *  uploads a NEW row under the local case's own id; it never touches the
 *  account's row). `toUpload` is what this device just contributed.
 *  `merged` is the union, newest-first by `savedAt` — computed HERE, not
 *  assembled at the call site, so the union cannot be got wrong by a
 *  caller: `ADOPT_CASES` takes `merged` verbatim. A citizen signing in
 *  for the first time with local-only cases has `adopted === []`, so
 *  dispatching `adopted` there would silently show them an empty Home
 *  while their cases sit safely on the server. */
export function migrateLocalCases(local: Casefile[], remote: Casefile[], now: number): MigrationPlan {
  // Rule zero (design note 5), checked first and unconditionally: a local
  // case whose id already exists in remote is the SAME case (ids are
  // stable), not a conflict. Dropped from toUpload; its remote copy is
  // already part of `adopted` below. This is what makes a retry after a
  // crash between push and clear idempotent instead of self-corrupting —
  // without it, the retry would see the same still_open case on both
  // sides and mark the citizen's own case superseded against itself.
  const remoteIds = new Set(remote.map(c => c.id))

  // The account's still_open case per engine, for the conflict table
  // (design note 6) — applies only to what survives rule zero, and only
  // to still_open cases.
  const remoteOpenByEngine = new Map<Casefile['engineKey'], Casefile>()
  for (const c of remote) {
    if (c.outcome === 'still_open') remoteOpenByEngine.set(c.engineKey, c)
  }

  const toUpload: Casefile[] = []
  for (const c of local) {
    if (remoteIds.has(c.id)) continue // rule zero

    // Design note 7: everything that is not still_open uploads
    // unconditionally — it can never collide with the partial unique
    // index, so it needs no conflict logic at all.
    if (c.outcome !== 'still_open') {
      toUpload.push(c)
      continue
    }

    const conflictingRemote = remoteOpenByEngine.get(c.engineKey)
    if (conflictingRemote) {
      // The conflict row (design note 6, "yes/yes"): the account's case
      // stays still_open (it is already part of `adopted` below,
      // untouched). The local case uploads with outcome: 'superseded'
      // and exactly one appended LOG_COPY.superseded entry, kind
      // 'closed', at the injected `now` (design note 10) — the existing
      // `appendLog` helper's shape, never Date.now().
      toUpload.push(appendLog({ ...c, outcome: 'superseded' }, { kind: 'closed', text: LOG_COPY.superseded }, now))
    } else {
      // "no/yes": the local case uploads as-is, unchanged.
      toUpload.push(c)
    }
  }

  const adopted = [...remote]
  const merged = [...adopted, ...toUpload]
  merged.sort((a, b) => b.savedAt - a.savedAt)

  return { toUpload, adopted, merged }
}

// =============================================================================
// runSignInMigration — the thin, impure orchestrator (design notes 8, 9)
// =============================================================================

/** The single entry point that actually talks to the network and to
 *  `localStorage`. Its only logic is ordering and failure handling —
 *  every decision about WHAT to upload/adopt lives in the pure
 *  `migrateLocalCases` above.
 *
 *  Design note 9, the single most important line in this file: `nm_cases`
 *  is cleared ONLY after `pushCases` has resolved `{ ok: true }`. Never
 *  before. Never on `{ ok: false }`. The push is one `upsert` call, so its
 *  failure is whole-batch, never partial — there is no half-written
 *  server state to reconcile. */
export async function runSignInMigration(now: number): Promise<MigrationResult> {
  const remoteResult = await fetchRemoteCases()
  if (!remoteResult.ok) return { ok: false, error: remoteResult.error }

  const local = loadCases()
  const plan = migrateLocalCases(local, remoteResult.cases, now)

  const pushResult = await pushCases(plan.toUpload)
  if (!pushResult.ok) return { ok: false, error: pushResult.error }

  clearLocalCases()
  return { ok: true, cases: plan.merged }
}
