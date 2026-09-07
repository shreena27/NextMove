// The casefile model — the shape a saved or in-progress case takes, the
// journey-log entry types, and the fixed copy strings the reducer composes
// journey-log entries from.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html (git tag
// v1-design-lock-2, commit 91ff7a1) — `caseSnapshot` (2053-2067),
// `completeSave` (2072-2091), the journey-log entry strings at 2645, 2650,
// 2689/2692, 2709/2710, 2697, 2699, 2728, 2185 and the migration seed at 1980.
//
// This is playbook-adjacent DATA, not screen chrome: LOG_COPY is data-shaped
// copy attached to a persisted record (the same class prep.ts's PREP map
// occupies), so it lives here, next to JourneyEntry, and is scanned by the
// same §7 content-safety guardrail suite rule copy is (via
// casefileCopyExtras(), shaped exactly like prep.ts's prepCopyExtras()).
import type { AnswerRecord, Classification, Diagnosis } from './types'
import { prepPlanFor } from '../playbooks/prep'
import { SIR_STATES } from '../playbooks/sirPlaybook'
import { sirCoverage } from './sirConfig'

/** Local {at,text}. MUST NOT import CopyString from ../guardrails/ — this is
 *  application/domain-data code and guardrails/isolation.test.ts walks it
 *  (its regex does not exempt `import type`). Same pattern as prep.ts's own
 *  CopyLocation and sirPlaybook.ts's / screenCopy.ts's. */
export interface CopyLocation { at: string; text: string }

/** Mirrors src/session/session.ts's own `ServiceKey` union. Declared locally,
 *  not imported, on purpose: `src/session/` imports only from `domain/` and
 *  `playbooks/` (never the reverse), and `caseSnapshot` below must stay a
 *  pure function with no dependency on `session/` at all — importing even a
 *  *type* from session.ts here would invert that layering and set up a real
 *  cycle the moment session.ts starts importing `Casefile` from this file
 *  (it does, from Task 4 on). Same reasoning `session.ts`'s own doc comment
 *  gives for not deriving ServiceKey from DEPS_FOR. */
/** Task 5 (design note 2): the runtime companion to `ServiceKey` —
 *  `supabase/migrations.test.ts`'s `engine_key` check-constraint assertion
 *  imports THIS array (not a hand-typed list) so the SQL constraint and this
 *  union can never drift apart. */
export const SERVICE_KEYS = ['passport', 'voter', 'sir'] as const
export type ServiceKey = typeof SERVICE_KEYS[number]

// `CaseSnapshot.returnScreen` (below) is deliberately typed as plain
// `string`, not session.ts's `ScreenId` union — for the same layering
// reason as ServiceKey above, and because (unlike ServiceKey, which is
// frozen at 3 services) ScreenId grows every chunk (C5 alone adds 4
// members in Task 4). A local duplicate of ScreenId here would silently
// drift stale the next time a screen id is added anywhere else in the
// app, and this file never switches on the value — it only stores and
// returns it. Every real call site (session.ts, App.tsx) narrows it back
// to ScreenId, which is a subtype of `string`.

/** The spec's own three case-outcome values, plus Task 5's own fourth
 *  (D3): 'superseded', for a case the sign-in migration (a later task)
 *  merges away because the signed-in account already had an open case for
 *  that service. Task 5 (design note 2): the runtime companion,
 *  `CASE_OUTCOMES` — `supabase/migrations.test.ts`'s `outcome`
 *  check-constraint assertion imports THIS array (not a hand-typed list) so
 *  the SQL constraint and this union can never drift apart — "one source of
 *  truth across TypeScript and Postgres". */
export const CASE_OUTCOMES = ['still_open', 'deliverable_received', 'closed_unresolved', 'superseded'] as const
export type CaseOutcome = typeof CASE_OUTCOMES[number]

/** The five `kind` values the prototype's journey-log writes ever use. */
export type JourneyEntryKind = 'diagnosed' | 'reported' | 'checked' | 'closed' | 'reopened'

/** One journey-log entry. `noChange` is a TYPED flag, set only by the
 *  reducer at the moment a "no change reported" check-in is logged — never
 *  recovered by parsing `text` (spec: "Entry semantics are TYPED … never
 *  recovered by parsing"). The prose fallback survives only for migrated
 *  legacy entries (Task 8), which predate the typed flag entirely. */
export interface JourneyEntry {
  t: number
  kind: JourneyEntryKind
  text: string
  noChange?: true
}

/** Every fixed journey-log entry string the reducer composes, transcribed
 *  verbatim from the locked prototype. The two bare suffixes
 *  (`rejectedSuffix`, `pendingSuffix`) are registered as their OWN strings —
 *  never pre-concatenated onto an option label here — so a content-safety
 *  finding against a suffix is never misattributed to a locked prototype
 *  label that did not cause it; the reducer composes the two at write time. */
export const LOG_COPY = {
  /** 2645 — a universal "nothing changed" check-in. */
  checkedNoChange: 'Checked in — no change reported',
  /** 2650 — the universal "else" option, which re-diagnoses from scratch. */
  elseReDiagnose: 'Reported something outside the listed options; re-diagnosing',
  /** 2689 / 2692 — appended to an option's own label when its valence gate
   *  is answered "no". */
  rejectedSuffix: ' — rejected',
  /** 2709 / 2710 — appended to an option's own label when a closure
   *  question is answered "still pending". */
  pendingSuffix: ' — deliverable still pending',
  /** 2697 — appended to a resolved-rung option's own label when a closure
   *  question is answered "yes, in hand". */
  inHandSuffix: ' — and the deliverable is in hand',
  /** 2699 — the closing log entry when a case's outcome becomes
   *  'deliverable_received'. */
  closedDeliverable: 'Case closed — deliverable received',
  /** 2728 — the closing log entry when a case is closed unresolved. */
  closedUnresolved: 'Closed as unresolved, every verified step used',
  /** 2185 — the log entry written when a closed case is reopened. */
  reopened: 'Case reopened: this came back',
  /** 1980 — the seed entry's text fallback for a migrated legacy case whose
   *  stored stateLabel is missing. */
  caseSaved: 'Case saved',
  /** Task 5 (D3) — NOT transcribed from the prototype; 'superseded' is new.
   *  The closing log entry for a case the sign-in migration (a later task)
   *  merges away because the signed-in account already had an open case for
   *  this service. FINALIZED via a Fable consultation the repo owner asked
   *  for explicitly (2026-09-07) — see the task brief's design note 3 for
   *  the full reasoning behind "Set aside" over "superseded" (internal
   *  jargon), "shelved"/"parked" (colloquial), or "duplicate" (false, and
   *  faintly blames the citizen). States what happened and why, in one
   *  clause, with no apology and no instruction about what happens next. */
  superseded: 'Set aside: your account already had an open case for this service',
} as const

/** Exactly what `caseSnapshot` produces (prototype 2053-2067) — the fields a
 *  fresh diagnosis contributes to a case. `caseFacts` / `appliedText` /
 *  `interpProvenance` are OMITTED on purpose (scope exclusion 3, C8's). */
export interface CaseSnapshot {
  engineKey: ServiceKey
  serviceLabel: string
  returnScreen: string
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
  savedAt: number
  stateLabel: string
  rec: Classification
  whatShort: string | null
  stepsTotal: number
  stepsDone: number
  sirPhaseId: string | null
}

/** The full casefile shape: a CaseSnapshot plus what `completeSave` /
 *  `beginWorkingCheckin` add (prototype 2072-2091, 1994-2007) when a
 *  snapshot becomes a tracked case. */
export interface Casefile extends CaseSnapshot {
  id: string
  outcome: CaseOutcome
  lastCheck: number | null
  remindAt: string | null
  log: JourneyEntry[]
  closedAt?: number
  unsaved?: true
}

/** Deviation D4: the prototype reads `SIR_STATES[S.answers.sirState].supported`
 *  then `.phase.id` unguarded (2065) — a supported state with no phase
 *  config crashes, and an unknown `sirState` value crashes on the property
 *  access. `sirConfig.ts` records this as "deliberate hardening (the
 *  prototype crashes on it)". This looks the state up defensively and gates
 *  on `sirCoverage(st) === 'covered'` before ever reading `.phase!.id`, so an
 *  unsupported or unrecognised state value returns `null` instead. */
export function sirPhaseId(engineKey: ServiceKey, answers: AnswerRecord): string | null {
  if (engineKey !== 'sir') return null
  const st = SIR_STATES[answers.sirState]
  if (!st || sirCoverage(st) !== 'covered') return null
  return st.phase!.id
}

/** Pure (D6): every value it needs — including the clock — comes in as an
 *  argument. Never imports session state, never calls `Date.now()` itself;
 *  the dispatching component supplies `now`. `stepsTotal`/`stepsDone` come
 *  from the same `prepPlanFor` C4 built. */
export function caseSnapshot(
  engineKey: ServiceKey,
  serviceLabel: string,
  returnScreen: string,
  d: Diagnosis,
  answers: AnswerRecord,
  prepChecks: Record<number, boolean>,
  now: number,
): CaseSnapshot {
  const prep = prepPlanFor(d)
  return {
    engineKey,
    serviceLabel,
    returnScreen,
    answers: { ...answers },
    prepChecks: { ...prepChecks },
    savedAt: now,
    stateLabel: d.label,
    rec: d.rec,
    whatShort: d.whatShort || null,
    stepsTotal: prep ? prep.steps.length : 0,
    stepsDone: prep ? prep.steps.filter((_, i) => prepChecks[i]).length : 0,
    sirPhaseId: sirPhaseId(engineKey, answers),
  }
}

/** Flattens LOG_COPY into `{ at, text }[]` for `guardrailFindings`, shaped
 *  exactly like `prep.ts`'s `prepCopyExtras`. Takes no playbook: unlike the
 *  per-service check-in option labels (Task 3's `checkinCopyExtras`), these
 *  journey-log strings are service-independent — the same nine entries apply
 *  to every case regardless of engineKey. */
export function casefileCopyExtras(): CopyLocation[] {
  return Object.entries(LOG_COPY).map(([key, text]) => ({ at: `casefile:LOG_COPY.${key}`, text }))
}
