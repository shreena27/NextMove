import type { AnswerRecord } from '../domain/types'
import type { Casefile } from '../domain/casefile'
import type { CheckinOption } from '../domain/checkinOptions'
import { applyCorrection } from '../domain/answers'
import { DEPS_FOR } from '../playbooks/engines'
import { beginWorkingCheckin, openCheckin, completeSave } from './cases'

/** The three services C3 ships. Declared here rather than derived from
 *  DEPS_FOR, which is typed Record<string, DependentKeys> — `keyof` that is
 *  `string`, so it would type-check nothing. src/playbooks/ is untouched by
 *  C3, so this union does not move into engines.ts until a later chunk. */
export type ServiceKey = 'passport' | 'voter' | 'sir'

/** Every screen C3 routes to — the prototype's own ids (router, 3910-3944),
 *  so C4/C5 extend the union rather than renaming the graph. Typed as a
 *  union, not `string`, so Task 9's switch is exhaustiveness-checked and a
 *  typo'd id is a compile error instead of a silent `default`. */
export type ScreenId =
  | 'home' | 'other-services'
  | 'passport-guardrail' | 'passport-outofscope' | 'passport-q1' | 'passport-q2'
  | 'passport-recovery' | 'passport-recovery-paste' | 'passport-recovery-show'
  | 'passport-diagnosis' | 'passport-nextmove' | 'passport-prepare'
  | 'voter-entry' | 'voter-q1' | 'voter-q2' | 'voter-diagnosis' | 'voter-nextmove' | 'voter-prepare'
  | 'sir-state' | 'sir-unsupported' | 'sir-q1' | 'sir-diagnosis' | 'sir-nextmove' | 'sir-prepare'
  | 'checkin' | 'dead-end' | 'case-closed' | 'save-done'
// Transcribe the exact id list from the prototype's own switch (3910-3944),
// taking only C3's screens; do not invent or normalise a name.
// C4 adds the three '*-prepare' ids (also the prototype's own, same
// switch) next to each service's existing block, per this union's own
// anticipation above — nothing else in this file changes for C4 (no new
// action, no new field, no reducer change; session.test.ts pins that).
// C5 adds the four ids above (same switch, 3941-3943 plus save-done at
// 3940) — 'checkin', 'dead-end', 'case-closed', 'save-done'. Deliberately
// NOT added here: 'save-case' / 'save-otp' / 'save-name' (C7's sign-in +
// save flow), 'sir-reverifying' (C6's freshness/re-verification screen),
// 'interp-confirm' (C8's free-text interpretation confirm) — each belongs
// to a later chunk and stays off this union until that chunk lands.

/** Snapshot ciSnapshotNow() (C6) takes just before a check-in write, so
 *  ciUndo() (C6) can restore exactly what was there. Mirrors the
 *  prototype's own ad hoc shape (2658-2660): `answers`/`prepChecks` copied
 *  by value, plus the active case serialised whole to `caseJson` so ciUndo
 *  can `Object.assign` every one of its fields back, not just the ones this
 *  port's Casefile type happens to declare — matching prototype behaviour
 *  exactly. */
export interface CiSnapshot {
  answers: AnswerRecord
  prepChecks: Record<number, boolean>
  caseJson: string
}

/** C3+C4's slice, plus everything C5 adds: the persisted casefile list,
 *  working/active case tracking, prepare-progress state, check-in
 *  interaction state, and casefile UI state. Fields belonging to LATER
 *  chunks (`user` — C7; `describe*`/`interp` — C8) are still ABSENT on
 *  purpose — a field nothing reads is a field that rots.
 *
 *  `savedCases` is the persisted slice: it is the ONLY field RESTART and
 *  BACK-to-Home preserve, via an explicit allowlist
 *  (`{ ...initialSession, savedCases: s.savedCases }`) rather than a
 *  blanket `initialSession` reset — so a future field added here is
 *  non-persisted by default (fail-safe direction) unless someone
 *  deliberately adds it to that allowlist too. */
export interface SessionState {
  screen: ScreenId
  history: ScreenId[]
  answers: AnswerRecord
  restartConfirm: boolean
  trustOpen: boolean
  recoveryText: string
  /** The voter entry question's inline not-sure explainer (FR-V-03):
   *  "I'm not sure" EXPLAINS in place, it does not exit the flow (AC-V-2).
   *  RECORDED DEVIATION: the prototype stores this inside S.answers
   *  (line 3405). It is UI state, not an answer — in `answers` it would
   *  land in Diagnosis.matchedAnswers and reach the trust panel. Same
   *  behaviour: the prototype clears it only via restart(), and RESTART
   *  returns initialSession. */
  voterEntryExplain: boolean

  /** The persisted casefile list (prototype `S.savedCases`, 1948). See this
   *  interface's own header comment — the one field RESTART/BACK-to-Home
   *  preserve. */
  savedCases: Casefile[]
  /** The case a diagnosis/check-in/prepare screen currently operates
   *  against, and its id (prototype `S.workingCase`/`S.activeCaseId`,
   *  1948). Cleared by RESTART/BACK-to-Home along with everything else
   *  that is not `savedCases`. */
  workingCase: Casefile | null
  activeCaseId: string | null

  /** Lifted out of `PrepareScreen`'s own `useState` (Task 12) so a
   *  correction elsewhere can reset it (design note 6): prep progress
   *  belongs to the diagnosis, not the screen, and must not survive a
   *  correction-path answer write that may have changed the diagnosis. */
  prepChecks: Record<number, boolean>
  prepDraft: string | null

  /** Check-in interaction state (prototype `S`, 1950). `ciPendingIdx`,
   *  `ciConsecutive` and `ciAccepted` are absent from the prototype's `S`
   *  literal — it assigns them ad hoc at first use (2640, 2644, 2686) —
   *  but they are real state, declared, typed and initialised here. */
  ciPending: CheckinOption | null
  ciPendingIdx: number | null
  ciStage: 'confirm' | 'valence' | 'closureq' | null
  ciReassure: boolean
  ciSnapshot: CiSnapshot | null
  ciJustUpdated: boolean
  ciConsecutive: boolean
  ciAccepted: boolean

  /** Casefile UI state. */
  logOpen: Record<string, boolean>
  /** Arms the destructive "Remove this case and its history? · Yes ·
   *  Cancel" inline confirm, by case id (prototype `S.removeConfirm`,
   *  1948). NAVIGATE clears this on every navigation — an armed
   *  destructive confirm must never survive leaving the screen that armed
   *  it (design note 5). */
  removeConfirm: string | null
  /** Also absent from the prototype's `S` literal — assigned ad hoc at
   *  first use (3729). */
  reminderCopied: boolean
  phaseDrift: boolean

  pendingSave: { engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId } | null
}

export const initialSession: SessionState = {
  screen: 'home', history: [], answers: {},
  restartConfirm: false, trustOpen: false,
  recoveryText: '', voterEntryExplain: false,
  savedCases: [], workingCase: null, activeCaseId: null,
  prepChecks: {}, prepDraft: null,
  ciPending: null, ciPendingIdx: null, ciStage: null, ciReassure: false,
  ciSnapshot: null, ciJustUpdated: false, ciConsecutive: false, ciAccepted: false,
  logOpen: {}, removeConfirm: null, reminderCopied: false, phaseDrift: false,
  pendingSave: null,
}

export type SessionAction =
  | { type: 'NAVIGATE'; screen: ScreenId; replace?: boolean }
  | { type: 'BACK' }
  | { type: 'ANSWER'; service: ServiceKey; key: string; value: string }
  | { type: 'RESTART_REQUEST' } | { type: 'RESTART_CANCEL' } | { type: 'RESTART' }
  | { type: 'TOGGLE_TRUST' }
  | { type: 'SET_RECOVERY_TEXT'; text: string }
  | { type: 'EXPLAIN_VOTER_ENTRY' }
  // C5: tracking never requires an account (Product Principle #4) — the
  // working case, opening an already-saved case, and the save/adopt flow
  // (design notes 3, 5, 4, 9). Deliberately NO `CONTINUE_SAVED`: it is
  // dead code in the locked prototype (zero call sites) — design note 7.
  | { type: 'BEGIN_WORKING_CHECKIN'; engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId; now: number }
  // No `now`: unlike its two siblings, OPEN_CHECKIN never stamps a time
  // anywhere in the prototype (loadCase/openCheckin, 2160-2171/2633-2637)
  // — a field nothing reads is a field that rots.
  | { type: 'OPEN_CHECKIN'; id: string }
  | { type: 'BEGIN_SAVE'; engineKey: ServiceKey; serviceLabel: string; returnScreen: ScreenId; now: number }

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'NAVIGATE':
      return {
        ...s,
        history: a.replace ? s.history : [...s.history, s.screen],
        screen: a.screen,
        // removeConfirm: an armed destructive confirm must never survive a
        // navigation away from the screen that armed it (design note 5;
        // prototype nav(), line 2029).
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    case 'BACK': {
      if (s.history.length === 0) return s
      const history = s.history.slice(0, -1)
      const prev = s.history[s.history.length - 1]
      // Home is a clean slate, always (prototype back(), line 2035-2040).
      // Explicit allowlist, not a blanket initialSession reset: savedCases
      // is the persisted slice and must survive this, and only this.
      if (prev === 'home') return { ...initialSession, savedCases: s.savedCases }
      return { ...s, screen: prev, history, trustOpen: false, restartConfirm: false }
    }
    case 'ANSWER': {
      const { answers } = applyCorrection(s.answers, a.key, a.value, DEPS_FOR[a.service])
      // prepChecks/prepDraft reset on EVERY correction-path write,
      // unconditionally — never gated on whether `answers` actually
      // changed (design note 6; answers.ts's own doc comment). `answers`
      // itself keeps C1's strict no-op: the same reference comes back
      // when the written value is unchanged.
      return { ...s, answers, prepChecks: {}, prepDraft: null }
    }
    case 'RESTART_REQUEST': return { ...s, restartConfirm: true }
    case 'RESTART_CANCEL': return { ...s, restartConfirm: false }
    // Explicit allowlist, not a blanket initialSession reset (Issue #7,
    // design note 3): savedCases is the persisted slice and must survive
    // a restart, and only savedCases — every other field, including any
    // added later, resets to initialSession's value by default.
    case 'RESTART': return { ...initialSession, savedCases: s.savedCases }
    case 'TOGGLE_TRUST': return { ...s, trustOpen: !s.trustOpen }
    case 'SET_RECOVERY_TEXT': return { ...s, recoveryText: a.text }
    case 'EXPLAIN_VOTER_ENTRY': return { ...s, voterEntryExplain: true }
    // C5: thin arms over cases.ts's pure functions (design note 1) — pull
    // the relevant slice off `s`, call the matching helper, spread its
    // fragment back on, then apply the SAME nav()-style clears every
    // navigation applies (prototype nav(), line 2029; NAVIGATE arm above).
    case 'BEGIN_WORKING_CHECKIN': {
      const fragment = beginWorkingCheckin(
        { savedCases: s.savedCases, workingCase: s.workingCase, answers: s.answers, prepChecks: s.prepChecks },
        { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen, now: a.now },
      )
      return {
        ...s, ...fragment,
        history: [...s.history, s.screen], screen: 'checkin',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    }
    case 'OPEN_CHECKIN': {
      const fragment = openCheckin(s.savedCases, a.id)
      if (!fragment) return s
      return {
        ...s, ...fragment,
        history: [...s.history, s.screen], screen: 'checkin',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    }
    case 'BEGIN_SAVE': {
      const fragment = completeSave(
        { savedCases: s.savedCases, workingCase: s.workingCase, answers: s.answers, prepChecks: s.prepChecks },
        { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen, now: a.now },
      )
      return {
        ...s, ...fragment,
        // pendingSave is set even though the save completes immediately
        // (no auth detour in C5, scope exclusion 1) — SaveDoneScreen's
        // "Back to my case" button reads pendingSave.returnScreen
        // (prototype 3895; design note 9).
        pendingSave: { engineKey: a.engineKey, serviceLabel: a.serviceLabel, returnScreen: a.returnScreen },
        history: [...s.history, s.screen], screen: 'save-done',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    }
  }
}
