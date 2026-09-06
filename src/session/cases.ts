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
import type { Casefile, JourneyEntry, JourneyEntryKind, ServiceKey } from '../domain/casefile'
import { caseSnapshot, LOG_COPY } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { applyEvent } from '../domain/answers'
import type { CheckinOption } from '../domain/checkinOptions'
import { checkinOptionsFor } from '../domain/checkinOptions'
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

// =============================================================================
// The check-in interaction state machine (Task 6). TRANSCRIBED, not authored:
// design/nextmove-v1-prototype.html (git tag v1-design-lock-2) —
// checkinOptions/ciChoose (2597-2657), ciSnapshotNow/ciApplyPatch/ciConfirm
// (2658-2683), ciValence (2684-2693), ciClosureAnswer (2694-2712), ciUndo
// (2713-2720). "Answer-model surgery" (docs/superpowers/specs/
// 2026-09-05-checkin-tracking-loop-design.md) is the *why*: a check-in is an
// EVENT (applyEvent/updateAns, C1's pure merge — 2099-2103), never a
// CORRECTION (applyCorrection, C1, used only by ANSWER/Back) — facts survive,
// only the resulting diagnosis id decides whether prepare progress clears.
//
// Same pure-function shape as beginWorkingCheckin/completeSave above (design
// note 1): every function here takes (state slice, payload) and returns a
// FRAGMENT to spread back onto SessionState — session.ts's CI_* reducer arms
// stay thin, and every value these functions need (including the clock) comes
// in as an argument.
// =============================================================================

/** One check-in interaction's undo snapshot. Holds the case object directly,
 *  not a JSON string the way the prototype's ciSnapshotNow() (2658-2661)
 *  does (`caseJson: JSON.stringify(activeCase())`): the prototype needs that
 *  round trip only because it mutates the case object in place after the
 *  snapshot is taken, so a live reference would drift under it. This port is
 *  immutable — every write below produces a NEW case object — so the case
 *  reference captured at snapshot time is already an independent value
 *  nothing later mutates. */
export interface CiSnapshot {
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
  casefile: Casefile
}

/** The slice of SessionState every CI_* function below needs to resolve
 *  activeCase() and (where relevant) apply an event patch to it. */
interface CheckinCaseState {
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
  activeCaseId: string | null
  workingCase: Casefile | null
  savedCases: Casefile[]
}

/** The fragment every CI_* function returns. Every field is OPTIONAL and a
 *  caller (session.ts) spreads only the keys actually present — a field left
 *  out of a given branch's returned object is a field that branch does not
 *  touch, matching the prototype's own per-branch assignments line for line
 *  (see each function's own comment for exactly which fields a given branch
 *  sets). `navigateTo` is the one field always present: a screen id to
 *  navigate to (session.ts applies nav()'s own clears — trustOpen/
 *  restartConfirm/removeConfirm — plus the history push, 2027-2029), or
 *  `null` to stay on the current screen with no navigation at all. Typed as
 *  plain `string`, not session.ts's `ScreenId`: cases.ts must not import
 *  from session.ts (same layering reason as CaseSnapshot.returnScreen in
 *  casefile.ts). */
export interface CiFragment {
  answers?: AnswerRecord
  prepChecks?: Record<number, boolean>
  workingCase?: Casefile | null
  savedCases?: Casefile[]
  ciPending?: CheckinOption | null
  ciPendingIdx?: number | null
  ciStage?: 'confirm' | 'valence' | 'closureq' | null
  ciReassure?: boolean
  ciSnapshot?: CiSnapshot | null
  ciJustUpdated?: boolean
  ciConsecutive?: boolean
  ciAccepted?: boolean
  navigateTo: string | null
}

/** Design note 4 — the ONE log-append helper, used at every append site
 *  below. DELIBERATE PORT DECISION, not a transcription: the prototype has
 *  TWO append paths. `ciLog` (2621-2627) stamps `c.lastCheck` on every
 *  write. But the `closed` entries (`ciClosureAnswer` 2699, `closeUnresolved`
 *  2728) and the `reopened` entry (`reopenCase` 2185) are pushed with a bare
 *  `c.log.push(...)` that does NOT touch `lastCheck` — so "every log write
 *  sets lastCheck" is not actually what the prototype does. This port
 *  unifies both paths into this one helper anyway, for three reasons: it
 *  removes a second, untested append path; `lastCheck` renders as "last
 *  update {ago}" on the Home card (3129), and a close or reopen genuinely IS
 *  the last thing that happened to the case; and an open case's card is the
 *  only place the value shows, so a closed case's `lastCheck` moving is
 *  invisible either way. Does NOT take a snapshot itself (see CiSnapshot's
 *  own comment and each CI_* function below) — snapshotting is each
 *  function's own, one-per-interaction responsibility, never this helper's,
 *  which is exactly the D1 fix (design note 5). */
export function appendLog(
  c: Casefile,
  entry: { kind: JourneyEntryKind; text: string; noChange?: true },
  now: number,
): Casefile {
  const logEntry: JourneyEntry = entry.noChange
    ? { t: now, kind: entry.kind, text: entry.text, noChange: true }
    : { t: now, kind: entry.kind, text: entry.text }
  return { ...c, log: [...c.log, logEntry], lastCheck: now }
}

/** One check-in interaction's undo snapshot, captured BEFORE the first log
 *  write of that interaction (design note 5 / deviation D1) — see each
 *  caller below: every one of them calls this exactly ONCE, at its own top,
 *  before its own first `appendLog`, and never again afterwards even when
 *  that same interaction goes on to write a second entry. */
function takeCiSnapshot(state: { answers: AnswerRecord; prepChecks: Record<number, boolean> }, c: Casefile): CiSnapshot {
  return { answers: { ...state.answers }, prepChecks: { ...state.prepChecks }, casefile: c }
}

/** Writes `updated` back into whichever of workingCase/savedCases is
 *  currently active — the port's answer to the prototype's
 *  `Object.assign(c, ...)` (which works on either because it mutates the
 *  live object in place; design note 9). Passes back the UNCHANGED side's
 *  exact input reference (never a fresh copy), so a CI_* arm that only ever
 *  touches one side never breaks the other side's identity. */
function placeCase(
  state: { activeCaseId: string | null; workingCase: Casefile | null; savedCases: Casefile[] },
  updated: Casefile,
): { workingCase: Casefile | null; savedCases: Casefile[] } {
  if (state.activeCaseId === 'working') return { workingCase: updated, savedCases: state.savedCases }
  return {
    workingCase: state.workingCase,
    savedCases: state.savedCases.map(x => (x.id === state.activeCaseId ? updated : x)),
  }
}

/** Prototype ciApplyPatch() (2662-2675), renamed applyCheckinPatch per this
 *  task's brief — the shared tail every non-deadend, non-"nothing"/"else"/
 *  "notdone" check-in option resolves through (CI_CONFIRM's non-deadend
 *  branch; CI_VALENCE's non-rejectDeadend branches; CI_CLOSURE's
 *  pendingPatch/acceptPendingPatch branch):
 *   1. capture `before`, the diagnosis the case is leaving.
 *   2. DEVIATION D1: take the interaction's ONE snapshot HERE, before the
 *      first write below — never re-taken before the second (`diagnosed`)
 *      write further down. A faithful transcription of `ciLog` (2621-2627)
 *      re-snapshots on EVERY write, so a diagnosis-changing check-in (which
 *      writes `reported` THEN `diagnosed`) silently corrupts its own undo
 *      data — see cases.test.ts's own "D1 RED" test for exactly what that
 *      does and does not break.
 *   3. append the `reported` entry (reportLabel is the caller's own,
 *      already-composed text — e.g. with a " — rejected" suffix).
 *   4. apply the event patch via `applyEvent` (never `applyCorrection` — a
 *      check-in is the EVENT write path; see this section's header note).
 *   5. capture `after`, the resulting diagnosis.
 *   6. if the diagnosis id genuinely changed (ruleId OR state differs):
 *      clear prepChecks (the plan changed) and append a `diagnosed` entry
 *      memorializing the OLD plan's completion — written strictly after
 *      `reported`, so the log reads in the order things happened.
 *   7. DEVIATION D7: re-snapshot the case (`caseSnapshot`, so the Home card
 *      cannot drift) but preserve the case's ORIGINAL `savedAt` — a fresh
 *      `caseSnapshot` always stamps `savedAt: now` (casefile.ts, 2059-
 *      equivalent), which would otherwise silently move the case's save
 *      date forward on every diagnosis-changing check-in (it renders as
 *      "Saved {date}" in two places — `.saved-kicker` 3123 and
 *      `.case-meta-line` 2914). `lastCheck` is a DIFFERENT clock ("last
 *      update {ago}") and genuinely SHOULD advance — `appendLog` above
 *      already did that, for both writes.
 *   8. return the fragment: ciJustUpdated=true, ciStage/ciPending/
 *      ciPendingIdx all cleared, navigate to `${engineKey}-diagnosis`. */
function applyCheckinPatch(
  state: CheckinCaseState,
  opt: CheckinOption,
  reportLabel: string,
  now: number,
): CiFragment | null {
  const c = activeCase(state)
  if (!c) return null
  const engine = ENGINES[c.engineKey]
  const before = diagnose(engine, state.answers)

  const snapshot = takeCiSnapshot(state, c)

  let updated = appendLog(c, { kind: 'reported', text: reportLabel }, now)
  const answers = applyEvent(state.answers, opt.patch ?? {})
  const after = diagnose(engine, answers)

  let prepChecks = state.prepChecks
  if (before.ruleId !== after.ruleId || before.state !== after.state) {
    prepChecks = {}
    updated = appendLog(updated, { kind: 'diagnosed', text: after.label }, now)
  }

  const snap = caseSnapshot(c.engineKey, c.serviceLabel, c.returnScreen, after, answers, prepChecks, now)
  updated = { ...updated, ...snap, savedAt: c.savedAt } // D7: savedAt survives

  const placement = placeCase(state, updated)
  return {
    answers,
    prepChecks,
    workingCase: placement.workingCase,
    savedCases: placement.savedCases,
    ciSnapshot: snapshot,
    ciJustUpdated: true,
    ciStage: null,
    ciPending: null,
    ciPendingIdx: null,
    navigateTo: `${c.engineKey}-diagnosis`,
  }
}

/** Prototype ciChoose() (2638-2657): the citizen picked one option off the
 *  check-in list. Sets `ciPending`/`ciPendingIdx` and clears `ciReassure`
 *  FIRST, once, before any branching (2640) — every branch below shares
 *  this `base`; only 'nothing' overrides `ciPending`/`ciReassure` again
 *  within its own arm. Branches, in the prototype's own order:
 *   - 'nothing' → log a `checked`/noChange entry, set ciConsecutive from
 *     whether the case's LAST entry (before this write) was itself
 *     `checked`, set ciReassure=true, clear ciPending. No navigation.
 *   - 'notdone' → navigate to prepare. No log entry, no patch, no snapshot
 *     (nothing was written).
 *   - 'else' → log a `checked` entry, navigate to the engine's first
 *     question.
 *   - 'valence' → open the valence panel (ciStage='valence').
 *   - 'closureq' | 'resolved-rung' | 'deliverable' → open the closure panel.
 *   - anything else (event/action/deadend) → open the confirm panel. */
export function ciChoose(state: CheckinCaseState, payload: { index: number; now: number }): CiFragment | null {
  const c = activeCase(state)
  if (!c) return null
  const engineKey = c.engineKey
  const d = diagnose(ENGINES[engineKey], state.answers)
  const options = checkinOptionsFor(d, state.prepChecks, engineKey)
  const opt = options[payload.index]
  // Hardening beyond the prototype (which has the same hole, unguarded):
  // an out-of-range index returns null, matching every other precondition
  // failure in this file (activeCase/loadCase/openCheckin all return null
  // rather than throw on a missing input).
  if (!opt) return null

  const base = { ciPending: opt, ciPendingIdx: payload.index, ciReassure: false }

  if (opt.k === 'nothing') {
    const prevEntry = c.log[c.log.length - 1]
    const ciConsecutive = !!(prevEntry && prevEntry.kind === 'checked')
    const snapshot = takeCiSnapshot(state, c)
    const updated = appendLog(c, { kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true }, payload.now)
    const placement = placeCase(state, updated)
    return {
      ...base,
      ciPending: null,
      ciReassure: true,
      ciConsecutive,
      ciSnapshot: snapshot,
      workingCase: placement.workingCase,
      savedCases: placement.savedCases,
      navigateTo: null,
    }
  }

  if (opt.k === 'notdone') {
    return { ...base, workingCase: state.workingCase, savedCases: state.savedCases, navigateTo: `${engineKey}-prepare` }
  }

  if (opt.k === 'else') {
    const snapshot = takeCiSnapshot(state, c)
    const updated = appendLog(c, { kind: 'checked', text: LOG_COPY.elseReDiagnose }, payload.now)
    const placement = placeCase(state, updated)
    const first: Record<ServiceKey, string> = { passport: 'passport-q1', voter: 'voter-entry', sir: 'sir-q1' }
    return {
      ...base,
      ciSnapshot: snapshot,
      workingCase: placement.workingCase,
      savedCases: placement.savedCases,
      navigateTo: first[engineKey],
    }
  }

  if (opt.k === 'valence') {
    return { ...base, ciStage: 'valence', workingCase: state.workingCase, savedCases: state.savedCases, navigateTo: null }
  }

  if (opt.k === 'closureq' || opt.k === 'resolved-rung' || opt.k === 'deliverable') {
    return { ...base, ciStage: 'closureq', workingCase: state.workingCase, savedCases: state.savedCases, navigateTo: null }
  }

  // event | action | deadend
  return { ...base, ciStage: 'confirm', workingCase: state.workingCase, savedCases: state.savedCases, navigateTo: null }
}

/** Prototype ciConfirm() (2676-2683): a `deadend` option logs a `reported`
 *  entry (its own snapshot, taken here — its own interaction) and navigates
 *  straight to 'dead-end' — no patch, no diagnosis change. Everything else
 *  goes through applyCheckinPatch. */
export function ciConfirm(state: CheckinCaseState & { ciPending: CheckinOption | null }, now: number): CiFragment | null {
  const opt = state.ciPending
  if (!opt) return null
  const c = activeCase(state)
  if (!c) return null

  if (opt.k === 'deadend') {
    const snapshot = takeCiSnapshot(state, c)
    const updated = appendLog(c, { kind: 'reported', text: opt.label }, now)
    const placement = placeCase(state, updated)
    return {
      workingCase: placement.workingCase,
      savedCases: placement.savedCases,
      ciSnapshot: snapshot,
      ciStage: null,
      ciPending: null,
      navigateTo: 'dead-end',
    }
  }

  return applyCheckinPatch(state, opt, opt.label, now)
}

/** Prototype ciValence() (2684-2693) — the valence gate for decision-class
 *  events: "was it accepted or rejected?" asked BEFORE any routing, so the
 *  celebratory beat can never land on a rejection.
 *   - accepted → ciAccepted=true, ciStage='closureq'. No patch, no log entry
 *     yet — ciPending/ciPendingIdx are untouched (the SAME option's label
 *     still drives the closure panel's own "you picked" echo).
 *   - rejected AND opt.rejectDeadend → log a `reported ... — rejected`
 *     entry (its own snapshot) and navigate to 'dead-end'. No patch: this
 *     rung is the top of the verified ladder.
 *   - rejected otherwise → applyCheckinPatch with opt.rejectPatch. */
export function ciValence(
  state: CheckinCaseState & { ciPending: CheckinOption | null },
  accepted: boolean,
  now: number,
): CiFragment | null {
  const opt = state.ciPending
  if (!opt) return null
  const c = activeCase(state)
  if (!c) return null

  if (accepted) {
    return { ciAccepted: true, ciStage: 'closureq', navigateTo: null }
  }

  if (opt.rejectDeadend) {
    const snapshot = takeCiSnapshot(state, c)
    const updated = appendLog(c, { kind: 'reported', text: opt.label + LOG_COPY.rejectedSuffix }, now)
    const placement = placeCase(state, updated)
    return {
      ciAccepted: false,
      workingCase: placement.workingCase,
      savedCases: placement.savedCases,
      ciSnapshot: snapshot,
      ciStage: null,
      ciPending: null,
      navigateTo: 'dead-end',
    }
  }

  const applied = applyCheckinPatch(state, { ...opt, patch: opt.rejectPatch }, opt.label + LOG_COPY.rejectedSuffix, now)
  if (!applied) return null
  return { ...applied, ciAccepted: false }
}

/** Prototype ciClosureAnswer() (2694-2712) — "Did you get it?", asked after
 *  a resolved-rung/closureq/deliverable/accepted-valence option.
 *   - gotIt → log a `reported` entry (its own snapshot — the universal
 *     'deliverable' option's own label as-is; every other kind gets the
 *     " — and the deliverable is in hand" suffix), set outcome to
 *     'deliverable_received' + closedAt, append a `closed` entry, navigate
 *     to 'case-closed'.
 *   - not yet → "retire, don't reset" (spec): `pp` = the accepted-valence
 *     pending patch if this closureq followed an acceptance, else the
 *     option's own pendingPatch. If `pp` exists, applyCheckinPatch consumes
 *     the rung. Otherwise (the universal "I got it!" option, which has no
 *     patch — the prototype's own comment: "reporting maybe-then-not
 *     changes nothing, honestly") just log a `reported ... still pending`
 *     entry (its own snapshot), set ciReassure, and stay on the casefile
 *     screen. Either way ciAccepted resets to false. */
export function ciClosureAnswer(
  state: CheckinCaseState & { ciPending: CheckinOption | null; ciAccepted: boolean },
  gotIt: boolean,
  now: number,
): CiFragment | null {
  const opt = state.ciPending
  if (!opt) return null
  const c = activeCase(state)
  if (!c) return null

  if (gotIt) {
    const reportLabel = opt.k === 'deliverable' ? opt.label : opt.label + LOG_COPY.inHandSuffix
    const snapshot = takeCiSnapshot(state, c)
    let updated = appendLog(c, { kind: 'reported', text: reportLabel }, now)
    updated = { ...updated, outcome: 'deliverable_received', closedAt: now }
    updated = appendLog(updated, { kind: 'closed', text: LOG_COPY.closedDeliverable }, now)
    const placement = placeCase(state, updated)
    return {
      workingCase: placement.workingCase,
      savedCases: placement.savedCases,
      ciSnapshot: snapshot,
      ciStage: null,
      ciPending: null,
      navigateTo: 'case-closed',
    }
  }

  const pp = (state.ciAccepted && opt.acceptPendingPatch) || opt.pendingPatch
  if (pp) {
    const applied = applyCheckinPatch(state, { ...opt, patch: pp }, opt.label + LOG_COPY.pendingSuffix, now)
    if (!applied) return null
    return { ...applied, ciAccepted: false }
  }

  const snapshot = takeCiSnapshot(state, c)
  const updated = appendLog(c, { kind: 'reported', text: opt.label + LOG_COPY.pendingSuffix }, now)
  const placement = placeCase(state, updated)
  return {
    ciAccepted: false,
    workingCase: placement.workingCase,
    savedCases: placement.savedCases,
    ciSnapshot: snapshot,
    ciReassure: true,
    ciStage: null,
    ciPending: null,
    navigateTo: null,
  }
}

/** Prototype ciUndo() (2713-2720): restore `answers`, `prepChecks` and the
 *  active case (including its `log`) from `ciSnapshot`, then clear
 *  `ciSnapshot`/`ciJustUpdated`/`ciReassure`. A working case restores into
 *  `workingCase`; a saved case restores into `savedCases` at its position
 *  (design note 9) — the prototype's `Object.assign(c, restored)` handles
 *  both because it mutates the object in place; `placeCase` is this port's
 *  branch on `activeCaseId==='working'`. No-op (returns null) when there is
 *  no snapshot to restore. */
export function ciUndo(state: {
  activeCaseId: string | null
  workingCase: Casefile | null
  savedCases: Casefile[]
  ciSnapshot: CiSnapshot | null
}): CiFragment | null {
  const snap = state.ciSnapshot
  if (!snap) return null
  const placement = placeCase(state, snap.casefile)
  return {
    answers: { ...snap.answers },
    prepChecks: { ...snap.prepChecks },
    workingCase: placement.workingCase,
    savedCases: placement.savedCases,
    ciSnapshot: null,
    ciJustUpdated: false,
    ciReassure: false,
    navigateTo: null,
  }
}

/** The confirm (2846) and valence (2856) panels' "Cancel" button — the
 *  citizen said "no, cancel this". Design note 10: a previous draft of this
 *  plan declared this reducer action and never wrote a test for it, which
 *  this project's own Global Constraints call a defect outright. Clears
 *  ciStage/ciPending/ciPendingIdx ONLY — the prototype's own Cancel handler
 *  (`S.ciStage=null; S.ciPending=null; render();`) does not clear
 *  ciPendingIdx either, but this port does, as deliberate type hygiene (a
 *  declared, typed field should not go stale) — it touches nothing else:
 *  not the log, not answers, not ciSnapshot, not ciReassure, not
 *  savedCases. The closureq panel deliberately has NO Cancel (2863-2866) —
 *  Task 9's screen enforces that absence; this function is never wired to
 *  it. */
export function ciCancel(): CiFragment {
  return { ciStage: null, ciPending: null, ciPendingIdx: null, navigateTo: null }
}

// =============================================================================
// Task 7 — closure, dead end, reopen, remove, check-back date, the journey
// log's "Show all" toggle, and the reminder copy-flash flag. TRANSCRIBED, not
// authored: design/nextmove-v1-prototype.html (git tag v1-design-lock-2) —
// removeSaved (2178-2182), reopenCase (2183-2187), setRemind (2721-2724),
// closeUnresolved (2725-2730), the journey log's "Show all N entries" button
// (2825), copyReminder (3728-3730).
//
// Same pure-function-returns-a-fragment shape as every function above
// (design note 1): session.ts's arms for these seven actions stay thin
// spreads over what these functions return.
// =============================================================================

/** Prototype closeUnresolved() (2725-2730): outcome -> 'closed_unresolved',
 *  closedAt stamped, a 'closed' entry appended via appendLog (design note
 *  4's unification). The prototype's own body ends in `restart()` (2729) —
 *  this fragment returns only the case placement; session.ts's
 *  CLOSE_UNRESOLVED arm folds it into the SAME `{ ...initialSession,
 *  savedCases }` expression RESTART's own arm uses. Returns null when there
 *  is no active case, matching every other precondition failure in this
 *  file.
 *
 *  DESIGN NOTE 9 — closing an UNSAVED (working) case leaves genuinely no
 *  record. `workingCase` is never a member of `savedCases`, and the RESTART
 *  this action ends in drops `workingCase` along with everything else
 *  RESTART does not explicitly preserve. So a citizen who closes a case
 *  they never saved gets exactly what the casefile screen's own copy warns
 *  them of: "this casefile lives only in this tab until you save it." This
 *  is the locked prototype's own behaviour and is NOT a bug to silently fix
 *  here (e.g. by auto-saving on closure) — see this task's brief, Open
 *  Question 3, for the auto-save alternative a future reviewer may want to
 *  weigh. Pinned by a test in cases.test.ts so a future reader sees this
 *  was a decision, not an oversight. */
export function closeUnresolved(
  state: { activeCaseId: string | null; workingCase: Casefile | null; savedCases: Casefile[] },
  now: number,
): { workingCase: Casefile | null; savedCases: Casefile[] } | null {
  const c = activeCase(state)
  if (!c) return null
  let updated: Casefile = { ...c, outcome: 'closed_unresolved', closedAt: now }
  updated = appendLog(updated, { kind: 'closed', text: LOG_COPY.closedUnresolved }, now)
  return placeCase(state, updated)
}

/** Prototype reopenCase() (2183-2187): outcome -> 'still_open', append the
 *  'reopened' entry via appendLog, then loadCase(id) against the
 *  just-updated case (answers/prepChecks/prepDraft — loadCaseFragment,
 *  reused verbatim), landing on `${engineKey}-diagnosis`. Returns null for
 *  an unknown id, mirroring the prototype's own `if(!c) return`.
 *
 *  DESIGN NOTE 3 — `closedAt` is left standing. The prototype's own
 *  reopenCase() never clears it, and this port does not "tidy" it either:
 *  the journey log is the record of what happened either way, and a
 *  reopened case that still shows when it was once closed is honest
 *  history, not a stale field an incomplete fix left behind. Only reachable
 *  against `savedCases` — a closed case is, by design note 9 above, always
 *  a SAVED one (an unsaved closure leaves no case standing to reopen). */
export interface ReopenCaseFragment extends LoadCaseFragment {
  savedCases: Casefile[]
  navigateTo: string
}

export function reopenCase(savedCases: Casefile[], id: string, now: number): ReopenCaseFragment | null {
  const c = savedCases.find(x => x.id === id)
  if (!c) return null
  const updated = appendLog({ ...c, outcome: 'still_open' }, { kind: 'reopened', text: LOG_COPY.reopened }, now)
  const nextSavedCases = savedCases.map(x => (x.id === id ? updated : x))
  return {
    ...loadCaseFragment(updated),
    savedCases: nextSavedCases,
    navigateTo: `${updated.engineKey}-diagnosis`,
  }
}

/** Prototype removeSaved() (2178-2182): real deletion — filter the case out
 *  of `savedCases`, clearing `activeCaseId` only when it pointed at the
 *  removed case. Never mutates the input array. The spec: "Deleting the
 *  case deletes the log (real deletion)."
 *
 *  The prototype's own onclick handler additionally sets `S.screen='home';
 *  S.history=[]` BEFORE calling this function (2881), so the citizen is
 *  never left on a screen for a case that no longer exists — session.ts's
 *  REMOVE_SAVED arm folds that in, since screen/history are not part of
 *  this file's state slice (the same layering reason CiFragment carries a
 *  generic `navigateTo` instead of a screen id, rather than this file
 *  importing ScreenId from session.ts). */
export interface RemoveSavedFragment {
  savedCases: Casefile[]
  activeCaseId: string | null
}

export function removeSaved(
  state: { savedCases: Casefile[]; activeCaseId: string | null },
  id: string,
): RemoveSavedFragment {
  return {
    savedCases: state.savedCases.filter(c => c.id !== id),
    activeCaseId: state.activeCaseId === id ? null : state.activeCaseId,
  }
}

/** Prototype setRemind() (2721-2724) — DEVIATION D5. The prototype searches
 *  `S.savedCases` by id (`c=S.savedCases.find(x=>x.id===id)`), which
 *  silently no-ops for a WORKING (unsaved) case: a working case is never a
 *  member of `savedCases`, yet the check-back date input sits right there
 *  on the working case's own casefile screen (2953-2955), unconditionally.
 *  This is a real bug, not a deliberate prototype choice. The fix: resolve
 *  `activeCase()` (working OR saved) and write through `placeCase` — the
 *  same helper every CI_* function above already uses for exactly this
 *  reason. `value` is the date input's raw ISO string, or `''` when the
 *  citizen clears it; stored as `value || null`, and never rendered raw
 *  (Task 8's `fmtRemind`). Returns null when there is no active case. */
export function setRemind(
  state: { activeCaseId: string | null; workingCase: Casefile | null; savedCases: Casefile[] },
  value: string,
): { workingCase: Casefile | null; savedCases: Casefile[] } | null {
  const c = activeCase(state)
  if (!c) return null
  const updated: Casefile = { ...c, remindAt: value || null }
  return placeCase(state, updated)
}

/** The journey log's "Show all N entries" button (2825): `S.logOpen[c.id] =
 *  true`. DESIGN NOTE 7 — the prototype only ever OPENS; there is no
 *  counterpart "Show less". Transcribe that asymmetry exactly: do not add a
 *  collapse. Never mutates the input record. */
export function toggleLog(logOpen: Record<string, boolean>, caseId: string): { logOpen: Record<string, boolean> } {
  return { logOpen: { ...logOpen, [caseId]: true } }
}

/** The casefile screen's destructive inline confirm (2879-2883): armed by
 *  case id, or disarmed with `null`. */
export function setRemoveConfirm(id: string | null): { removeConfirm: string | null } {
  return { removeConfirm: id }
}

/** copyReminder()'s (3728-3730) flash flag. DESIGN NOTE 8 — mirrors C4's
 *  `PrepareScreen` `copied` handling, with one deliberate shape difference:
 *  C4's `copied` is component-local `useState` (`PrepareScreen.tsx`); this
 *  one is SESSION state, because the copy button that sets it lives inside
 *  a reducer-driven screen (the casefile screen is not its own standalone
 *  component the way `PrepareScreen` is) — so it is cleared by RESTART like
 *  every other transient field, rather than resetting on unmount. */
export function setReminderCopied(value: boolean): { reminderCopied: boolean } {
  return { reminderCopied: value }
}
