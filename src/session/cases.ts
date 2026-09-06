// The working-case lifecycle, the save/adopt merge, and the D3 fix.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html (git tag
// v1-design-lock-2) — activeCase (1990-1993), beginWorkingCheckin
// (1994-2007), completeSave (2072-2091), caseIsSaved (2092-2095),
// loadCase (2160-2171), openCheckin (2633-2637).
//
// Pure functions over (state, payload) -> fragment (design note 1): every
// value each function needs — including the clock (D6) — comes in as an
// argument, never read off a live SessionState or Date.now() directly.
// This is what lets the hard logic here be tested without constructing a
// whole SessionState, and is why `sessionReducer`'s own arms for
// BEGIN_WORKING_CHECKIN / OPEN_CHECKIN / BEGIN_SAVE stay thin: they just
// pull the relevant slice off `state`, call the matching function here,
// and spread the returned fragment back on.
//
// Deviation D3 (caseIsSaved / beginWorkingCheckin / updateEntry's routing
// decision, the last of which is Task 11's): the prototype compares
// `c.answers` to `S.answers` with `JSON.stringify(a)===JSON.stringify(b)`,
// which is sensitive to key INSERTION order, not just content. The
// correction path (`applyCorrection`, C1) can delete and re-add a key in
// the middle of an answers record — changing its insertion order without
// changing what it means — so the SAME still-open case can read as
// "different" purely because of how its answers were arrived at. A
// citizen who re-answers identically then gets a spurious duplicate case
// instead of being routed back into the one they already have.
// `sameAnswers` below is the fix: a key-order-independent comparison, used
// at all three sites that ask this same question, so a fix applied to one
// is never a bug left standing in the other two.
import type { AnswerRecord } from '../domain/types'
import type { Casefile, JourneyEntry, ServiceKey } from '../domain/casefile'
import { caseSnapshot } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { ENGINES } from '../playbooks/engines'

/** D3 fix: key-order-independent equality between two answer records. */
export function sameAnswers(a: AnswerRecord, b: AnswerRecord): boolean {
  const sorted = (r: AnswerRecord): AnswerRecord => {
    const out: AnswerRecord = {}
    for (const k of Object.keys(r).sort()) out[k] = r[k]
    return out
  }
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
}

/** Prototype activeCase() (1990-1993). 'working' is the prototype's own
 *  sentinel id for the in-memory, not-yet-saved case — kept verbatim. */
export function activeCase(state: {
  activeCaseId: string | null
  workingCase: Casefile | null
  savedCases: Casefile[]
}): Casefile | null {
  if (state.activeCaseId === 'working') return state.workingCase
  return state.savedCases.find(c => c.id === state.activeCaseId) ?? null
}

/** Prototype caseIsSaved() (2092-2095), with the D3 fix: is there an
 *  already-saved, still-open case of this engine whose answers match the
 *  session's current answers (order-independently)? */
export function caseIsSaved(
  state: { savedCases: Casefile[]; answers: AnswerRecord },
  engineKey: ServiceKey,
): boolean {
  return state.savedCases.some(
    c => c.outcome === 'still_open' && c.engineKey === engineKey && sameAnswers(c.answers, state.answers),
  )
}

/** Prototype loadCase() (2160-2171). caseFacts/appliedText/fillsReviewed
 *  (2164) is C8's, not ported. phaseDrift (2168-2169) is Task 13's — this
 *  fragment does not mention it, so it is left standing untouched at
 *  whatever it already was. Returns null when `id` is not found, mirroring
 *  the prototype's own `if(!c) return null`. */
export interface LoadCaseFragment {
  activeCaseId: string
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
  prepDraft: null
}

function loadCaseFragment(c: Casefile): LoadCaseFragment {
  return {
    activeCaseId: c.id,
    answers: { ...c.answers },
    prepChecks: { ...c.prepChecks },
    prepDraft: null,
  }
}

export function loadCase(savedCases: Casefile[], id: string): LoadCaseFragment | null {
  const c = savedCases.find(x => x.id === id)
  return c ? loadCaseFragment(c) : null
}

/** Prototype openCheckin() (2633-2637): loadCase(id), then clear the
 *  check-in interaction state — including `ciSnapshot`, which the
 *  prototype leaves standing (Task 4 design note 5: without this a stray
 *  Undo on case B can restore case A's snapshot). Returns null when `id`
 *  is not found. */
export interface OpenCheckinFragment extends LoadCaseFragment {
  ciStage: null
  ciPending: null
  ciReassure: false
  ciJustUpdated: false
  ciSnapshot: null
}

function openCheckinFragment(c: Casefile): OpenCheckinFragment {
  return {
    ...loadCaseFragment(c),
    ciStage: null, ciPending: null, ciReassure: false, ciJustUpdated: false, ciSnapshot: null,
  }
}

export function openCheckin(savedCases: Casefile[], id: string): OpenCheckinFragment | null {
  const c = savedCases.find(x => x.id === id)
  return c ? openCheckinFragment(c) : null
}

/** Prototype beginWorkingCheckin() (1994-2007) — "tracking never requires
 *  an account" (Product Principle #4). Order matters:
 *   1. A still-open saved case of this engine with the SAME answers
 *      (D3-fixed comparison) is opened instead of spinning up a redundant
 *      working case — this reuses `openCheckinFragment`, the exact same
 *      fragment `openCheckin` itself returns, so the two never drift.
 *   2. Otherwise the working case is created/replaced only when there is
 *      none yet, its engineKey differs, or its answers differ; an
 *      unchanged re-entry keeps the SAME working-case object and its log.
 *   3. `activeCaseId` becomes `'working'`; ciStage/ciPending/ciReassure/
 *      ciJustUpdated/ciSnapshot all clear. */
export interface BeginWorkingFragment {
  workingCase: Casefile
  activeCaseId: 'working'
  ciStage: null
  ciPending: null
  ciReassure: false
  ciJustUpdated: false
  ciSnapshot: null
}

export function beginWorkingCheckin(
  state: {
    savedCases: Casefile[]
    workingCase: Casefile | null
    answers: AnswerRecord
    prepChecks: Record<number, boolean>
  },
  payload: { engineKey: ServiceKey; serviceLabel: string; returnScreen: string; now: number },
): OpenCheckinFragment | BeginWorkingFragment {
  const saved = state.savedCases.find(
    c => c.outcome === 'still_open' && c.engineKey === payload.engineKey && sameAnswers(c.answers, state.answers),
  )
  if (saved) return openCheckinFragment(saved)

  let workingCase = state.workingCase
  // Condition inlined directly on `workingCase` (not hoisted into a named
  // boolean) so TypeScript's control-flow narrowing carries the `Casefile`
  // (non-null) type through to the `return` below in both branches.
  if (!workingCase || workingCase.engineKey !== payload.engineKey || !sameAnswers(workingCase.answers, state.answers)) {
    const d = diagnose(ENGINES[payload.engineKey], state.answers)
    const snap = caseSnapshot(
      payload.engineKey, payload.serviceLabel, payload.returnScreen,
      d, state.answers, state.prepChecks, payload.now,
    )
    const log: JourneyEntry[] = [{ t: payload.now, kind: 'diagnosed', text: d.label }]
    workingCase = {
      ...snap, id: 'working', unsaved: true, outcome: 'still_open', lastCheck: null, remindAt: null, log,
    }
  }

  return {
    workingCase,
    activeCaseId: 'working',
    ciStage: null, ciPending: null, ciReassure: false, ciJustUpdated: false, ciSnapshot: null,
  }
}

/** Prototype completeSave() (2072-2091) — the one-active-case-per-service
 *  rule. `Object.assign(existing, snap)` in the prototype overwrites only
 *  snap's own fields onto the existing case object; the port spreads in
 *  the SAME direction (`{ ...existing, ...snap }`, never the reverse) so
 *  the existing case's `id`, `lastCheck` and `remindAt` survive (`log` is
 *  always explicitly set below, to the newly composed log). Never mutates
 *  its `savedCases` argument or any case inside it — every write below is
 *  a fresh array/object. */
export interface CompleteSaveFragment {
  savedCases: Casefile[]
  activeCaseId: string
  workingCase: null
}

export function completeSave(
  state: {
    savedCases: Casefile[]
    workingCase: Casefile | null
    answers: AnswerRecord
    prepChecks: Record<number, boolean>
  },
  payload: { engineKey: ServiceKey; serviceLabel: string; returnScreen: string; now: number },
): CompleteSaveFragment {
  const d = diagnose(ENGINES[payload.engineKey], state.answers)
  const snap = caseSnapshot(
    payload.engineKey, payload.serviceLabel, payload.returnScreen,
    d, state.answers, state.prepChecks, payload.now,
  )
  const working = state.workingCase && state.workingCase.engineKey === payload.engineKey ? state.workingCase : null
  const existingIdx = state.savedCases.findIndex(c => c.outcome === 'still_open' && c.engineKey === payload.engineKey)

  if (existingIdx !== -1) {
    const existing = state.savedCases[existingIdx]
    let log = existing.log
    // The working case's whole log ADOPTS onto the target, minus its own
    // `diagnosed` seed entry — that entry belongs to the case now being
    // merged away, and the target already has its own diagnosed history.
    if (working) log = [...log, ...working.log.filter(e => e.kind !== 'diagnosed')]
    if (existing.stateLabel !== snap.stateLabel) {
      log = [...log, { t: payload.now, kind: 'diagnosed', text: snap.stateLabel }]
    }
    const updated: Casefile = { ...existing, ...snap, log }
    const savedCases = state.savedCases.map((c, i) => (i === existingIdx ? updated : c))
    return { savedCases, activeCaseId: updated.id, workingCase: null }
  }

  const created: Casefile = {
    ...snap,
    id: 'c' + payload.now,
    outcome: 'still_open',
    lastCheck: working ? working.lastCheck : null,
    remindAt: working ? working.remindAt : null,
    log: working ? working.log : [{ t: payload.now, kind: 'diagnosed', text: snap.stateLabel }],
  }
  return { savedCases: [created, ...state.savedCases], activeCaseId: created.id, workingCase: null }
}
