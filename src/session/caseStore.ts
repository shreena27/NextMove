// The device-local casefile store. This is the ONLY file in this codebase
// that touches `localStorage` — every read/write anywhere else goes through
// `loadCases()` / `saveCases()` below.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html (git tag
// v1-design-lock-2, commit 91ff7a1) — the `store` object (1956-1960) and the
// `nm_case` -> `nm_cases` migration (1975-1983).
import type { AnswerRecord } from '../domain/types'
import type { Casefile } from '../domain/casefile'
import { LOG_COPY } from '../domain/casefile'

const NM_CASE_KEY = 'nm_case'
const NM_CASES_KEY = 'nm_cases'

/** Browser storage: casefiles live in this device's browser storage — the
 *  device-local half of the account system (deviation D2 below). C7 adds a
 *  real server-side account (`session/caseSync.ts`'s `fetchRemoteCases`/
 *  `pushCases`/`runSignInMigration`), but this module deliberately stays
 *  account-agnostic: `loadCases()`/`saveCases()` behave identically whether
 *  or not anyone is signed in, and the decision of WHEN to read/write this
 *  store versus the server — the account gate — lives in `App.tsx`, where
 *  the auth state actually is (Task 8), not here. Every access is
 *  try/catch-guarded: storage can be absent, full, or throwing outright
 *  (Safari private browsing mode), and this app must never crash because of
 *  it — it fails soft instead, exactly as the prototype's own `store`
 *  object does. */
const store = {
  get(key: string): unknown {
    try {
      return JSON.parse(localStorage.getItem(key) as string)
    } catch {
      return null
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage absent, full, or disabled — nothing to recover here.
    }
  },
  del(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // As above.
    }
  },
}

/** The legacy single-case storage shape (`nm_case`), from before multi-case
 *  support existed. Loosely typed on purpose: an old stored value can be
 *  missing fields a current CaseSnapshot always carries — that is exactly
 *  what the migration's `||` fallback chain below defends against. Every
 *  `||` in that expression is a real defence against an older stored shape,
 *  not incidental — `engineKey` alone carries no fallback because the old
 *  shape always had one (whatever it held, right or wrong, is transcribed
 *  unchanged).
 *
 *  FIX WAVE (2026-09-06, whole-branch final review, Critical finding 1,
 *  symptom 2): `answers`/`prepChecks` are declared here — optional, because
 *  the OLD single-case storage format did not reliably store them, so a
 *  real stored value can genuinely lack either. Before this fix the
 *  migration's `{...old, ...}` spread carried whatever `old.answers` held
 *  (including `undefined`) straight through into a `Casefile` whose type
 *  claims `answers` is always present — so a migrated card with no
 *  `answers` reached `diagnose(engine, undefined)`, which calls
 *  `rule.condition(undefined)` on every playbook rule: a real `TypeError`
 *  crash the first time such a card was opened. See the `migrated` object
 *  below for the fix. */
interface LegacyCase {
  savedAt?: number
  returnScreen?: string
  engineKey: string
  stateLabel?: string
  answers?: AnswerRecord
  prepChecks?: Record<number, boolean>
}

/** The one-time `nm_case` -> `nm_cases` migration (prototype 1975-1983).
 *  Runs at the top of every `loadCases()` call but only ever does something
 *  once: after the first run, `nm_case` is deleted, so every later call's
 *  `if (!old) return` makes it a no-op. */
function migrateLegacyCase(): void {
  const existing = store.get(NM_CASES_KEY)
  if (Array.isArray(existing) && existing.length > 0) return
  const old = store.get(NM_CASE_KEY) as LegacyCase | null
  if (!old) return
  const now = Date.now()
  const migrated = {
    ...old,
    id: 'c' + (old.savedAt || now),
    outcome: 'still_open',
    returnScreen: old.returnScreen || (old.engineKey + '-nextmove'),
    // FIX WAVE (2026-09-06, whole-branch final review, Critical finding 1,
    // symptom 2): normalize a missing `answers`/`prepChecks` to `{}` rather
    // than transcribing `undefined` through — see this interface's own doc
    // comment above for exactly what crash this closes. `diagnose(engine,
    // {})` correctly resolves to the UNCLASSIFIED fallback rather than
    // throwing, matching what `loadCase`/`openCheckin` (session/cases.ts)
    // already do for a case with no meaningful answers.
    answers: old.answers || {},
    prepChecks: old.prepChecks || {},
    // Task 8: the legacy `nm_case` shape predates `caseFacts`/`appliedText`/
    // `interpProvenance` entirely — there is no old value to fall back to,
    // unlike `answers`/`prepChecks` above. Set explicitly rather than left
    // to fall out of `...old` as `undefined`: a `Casefile` with `undefined`
    // where `caseFacts` is typed as an array crashes the first `.map` a
    // prepare-screen render does over it.
    caseFacts: [],
    appliedText: null,
    interpProvenance: null,
    log: [
      { t: old.savedAt || now, kind: 'diagnosed', text: old.stateLabel || LOG_COPY.caseSaved },
    ],
  }
  store.set(NM_CASES_KEY, [migrated])
  store.del(NM_CASE_KEY)
}

/** Loads the device's casefile list, running the one-time legacy migration
 *  first. Fails closed on corrupt storage: a `nm_cases` value that parses to
 *  anything other than an array (a string, a number, an object — a
 *  malformed/hand-edited storage entry) yields `[]`, never a crash
 *  downstream.
 *
 *  C7 (Task 8): the account-scoping seam this comment used to name as
 *  future work is now filled — `nm_cases` migrates onto the account on
 *  first sign-in via `session/caseSync.ts`'s `runSignInMigration`, called
 *  from `App.tsx`'s auth lifecycle, and `clearLocalCases()` (below) is how
 *  that migration empties this store once the server push it depends on has
 *  succeeded. This function itself did not change: it still takes no user
 *  argument and never reads `nm_user` (deviation D2) — C5's device-local
 *  read/write behaviour is exactly what App.tsx now builds the account gate
 *  on top of, not something this function does itself. */
export function loadCases(): Casefile[] {
  migrateLegacyCase()
  const raw = store.get(NM_CASES_KEY)
  return Array.isArray(raw) ? (raw as Casefile[]) : []
}

/** Writes the device's casefile list. Fails soft on a throwing/full/absent
 *  store — see `store.set` above. */
export function saveCases(cases: Casefile[]): void {
  store.set(NM_CASES_KEY, cases)
}

/** C7 Task 7 dependency, pulled forward from Task 8's own file-modification
 *  scope (docs/superpowers/plans/2026-09-07-c7-auth.md, Task 8 design note
 *  1: "It gains exactly one function, `clearLocalCases()`
 *  (`store.del(NM_CASES_KEY)`)"). Task 7's `caseSync.ts` brief names this
 *  function as an existing export of this file and its single most
 *  important guarantee — `runSignInMigration` clearing `nm_cases` only
 *  after a successful server push — cannot be implemented or tested
 *  without it. Task 7's own report flags this pull-forward explicitly so
 *  Task 8 does not attempt to re-add it. Fails soft on a throwing/absent
 *  store, same discipline as `store.del` above. */
export function clearLocalCases(): void {
  store.del(NM_CASES_KEY)
}
