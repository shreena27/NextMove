// The device-local casefile store. This is the ONLY file in this codebase
// that touches `localStorage` — every read/write anywhere else goes through
// `loadCases()` / `saveCases()` below.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html (git tag
// v1-design-lock-2, commit 91ff7a1) — the `store` object (1956-1960) and the
// `nm_case` -> `nm_cases` migration (1975-1983).
import type { Casefile } from '../domain/casefile'
import { LOG_COPY } from '../domain/casefile'

const NM_CASE_KEY = 'nm_case'
const NM_CASES_KEY = 'nm_cases'

/** Browser storage: casefiles live only in this device's browser storage
 *  (device-local, per deviation D2 below — no server-side account exists
 *  yet). Every access is try/catch-guarded: storage can be absent, full, or
 *  throwing outright (Safari private browsing mode), and this app must
 *  never crash because of it — it fails soft instead, exactly as the
 *  prototype's own `store` object does. */
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
 *  unchanged). */
interface LegacyCase {
  savedAt?: number
  returnScreen?: string
  engineKey: string
  stateLabel?: string
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
 *  C7: account-scoping goes here — `nm_cases` becomes account-scoped
 *  server-side and this device-local set migrates on first sign-in
 *  (roadmap issue #8, C7). Deviation D2: this takes no user argument and
 *  never reads `nm_user` — C5 is explicitly device-local. */
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
