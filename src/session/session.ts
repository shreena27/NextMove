import type { AnswerRecord } from '../domain/types'
import type { Casefile } from '../domain/casefile'
import { caseSnapshot } from '../domain/casefile'
import type { CheckinOption } from '../domain/checkinOptions'
import { applyCorrection } from '../domain/answers'
import { diagnose } from '../domain/engine'
import { DEPS_FOR, ENGINES } from '../playbooks/engines'
import type { CiFragment, CiSnapshot } from './cases'
import {
  beginWorkingCheckin, openCheckin, completeSave, activeCase,
  ciChoose, ciConfirm, ciValence, ciClosureAnswer, ciUndo, ciCancel,
  closeUnresolved, reopenCase, removeSaved, setRemind, toggleLog, setRemoveConfirm, setReminderCopied,
} from './cases'

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

// CiSnapshot is cases.ts's, not this file's (imported above): Task 4
// anticipated its shape here (`answers`/`prepChecks` copied by value, plus
// the active case serialised whole to a `caseJson` string so ciUndo could
// `Object.assign` every field back — a faithful mirror of the prototype's
// own ciSnapshotNow(), 2658-2661). Task 6's brief corrects that
// anticipation: this port is immutable, so the snapshot can hold the case
// object directly — no JSON.stringify/parse round trip is needed the way
// the prototype's needs one (it mutates the case in place after
// snapshotting, so a live reference would drift under it). See cases.ts's
// own CiSnapshot doc comment for the full reasoning.

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
  /** SIR phase drift (Task 13, design note 1): true when the active case's
   *  stamped `sirPhaseId` no longer matches the live `SIR_STATES` config —
   *  set by `loadCase`/`openCheckin`/`reopenCase` (session/cases.ts's own
   *  `phaseDriftFor`) whenever they resolve a case, left `false` by a fresh
   *  working case (`beginWorkingCheckin`, snapshotted against the live phase
   *  by construction). Drives two surfaces: the casefile screen's
   *  interstitial (CasefileScreen.tsx design note 1, replacing the whole
   *  `.update-mod` — no check-in option is reachable while this is true) and
   *  the Diagnosis banner (DiagnosisScreen.tsx design note). Cleared by its
   *  own `PHASE_DRIFT_RECHECK` action (the interstitial's CTA) and by
   *  RESTART/BACK-to-Home like every other transient field. */
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
  // The check-in interaction state machine (Task 6; design notes 2-10).
  // Every one of these six is a thin arm over its matching cases.ts pure
  // function, run through applyCiFragment below.
  | { type: 'CI_CHOOSE'; index: number; now: number }
  | { type: 'CI_CONFIRM'; now: number }
  | { type: 'CI_VALENCE'; accepted: boolean; now: number }
  | { type: 'CI_CLOSURE'; gotIt: boolean; now: number }
  | { type: 'CI_UNDO' }
  | { type: 'CI_CANCEL' }
  // Task 7: the remaining case-lifecycle actions — closing a case as
  // unresolved, reopening a closed one, permanently removing a saved one,
  // the check-back reminder date, the journey log's "Show all" toggle, and
  // the reminder copy-flash flag. Each is a thin arm over its matching
  // cases.ts pure function (design note 1), same shape as BEGIN_SAVE/
  // OPEN_CHECKIN/CI_* above. Design note 2: the dead-end screen's "Keep the
  // case open" button is deliberately NOT a new action here — it is a plain
  // RESTART dispatch (nothing is written; the case stays exactly as the
  // deadend option's own `reported` entry left it).
  | { type: 'CLOSE_UNRESOLVED'; now: number }
  | { type: 'REOPEN_CASE'; id: string; now: number }
  | { type: 'REMOVE_SAVED'; id: string }
  | { type: 'SET_REMIND'; value: string }
  | { type: 'TOGGLE_LOG'; caseId: string }
  | { type: 'SET_REMOVE_CONFIRM'; id: string | null }
  | { type: 'SET_REMINDER_COPIED'; value: boolean }
  // Task 12: PrepareScreen's tick/draft state, lifted out of its own local
  // `useState` (C4) so it survives a Back-then-return instead of resetting
  // on unmount. `TOGGLE_PREP_STEP` takes `now` (D6: the dispatching
  // component supplies the clock, never an internal `Date.now()`) because
  // it may re-snapshot an active case (prototype `togglePrepStep`,
  // 3685-3695) — see the reducer arm's own comment. `SET_PREP_DRAFT` needs
  // no clock; it only ever writes `prepDraft` (prototype 3722-ish;
  // `updateBracketHint`'s own textarea `oninput`).
  | { type: 'TOGGLE_PREP_STEP'; index: number; now: number }
  | { type: 'SET_PREP_DRAFT'; text: string }
  // Task 13, design note 2: the SIR phase-drift interstitial's own CTA
  // (prototype `onclick="S.phaseDrift=false; nav('sir-q1')"`, casefile
  // 2931) — clears `phaseDrift` and re-diagnoses against the current phase
  // starting from 'sir-q1'. No cases.ts pure function backs this (design
  // note 1's "thin arm over a pure function" shape doesn't apply — there is
  // no case data to touch, only a field clear plus the same nav()-style
  // treatment NAVIGATE itself applies), so it is a direct reducer arm, like
  // NAVIGATE's own.
  | { type: 'PHASE_DRIFT_RECHECK' }

/** Applies a CiFragment (cases.ts) onto SessionState. `navigateTo` decides
 *  the shape: a non-null screen id gets the SAME nav()-style treatment
 *  every other navigating action gets (history push, screen change,
 *  trustOpen/restartConfirm/removeConfirm cleared — prototype nav(), line
 *  2029); `null` means the interaction stays on the current screen (e.g.
 *  CI_CHOOSE opening a panel, or CI_CLOSURE's "still pending, no patch"
 *  branch), so only the fragment's own fields are spread on. */
function applyCiFragment(s: SessionState, fragment: CiFragment): SessionState {
  const { navigateTo, ...rest } = fragment
  if (navigateTo) {
    return {
      ...s, ...rest,
      history: [...s.history, s.screen], screen: navigateTo as ScreenId,
      trustOpen: false, restartConfirm: false, removeConfirm: null,
    }
  }
  return { ...s, ...rest }
}

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
    case 'CI_CHOOSE': {
      const fragment = ciChoose(
        { answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases },
        { index: a.index, now: a.now },
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CONFIRM': {
      const fragment = ciConfirm(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending,
        },
        a.now,
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_VALENCE': {
      const fragment = ciValence(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending,
        },
        a.accepted, a.now,
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CLOSURE': {
      const fragment = ciClosureAnswer(
        {
          answers: s.answers, prepChecks: s.prepChecks, activeCaseId: s.activeCaseId,
          workingCase: s.workingCase, savedCases: s.savedCases, ciPending: s.ciPending, ciAccepted: s.ciAccepted,
        },
        a.gotIt, a.now,
      )
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_UNDO': {
      const fragment = ciUndo({
        activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases, ciSnapshot: s.ciSnapshot,
      })
      return fragment ? applyCiFragment(s, fragment) : s
    }
    case 'CI_CANCEL':
      return applyCiFragment(s, ciCancel())
    case 'CLOSE_UNRESOLVED': {
      const fragment = closeUnresolved(
        { activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases },
        a.now,
      )
      if (!fragment) return s
      // Prototype closeUnresolved() ends in restart() (2729) — the SAME
      // explicit allowlist RESTART's own arm uses (design note 3): only
      // savedCases survives. Design note 9: for a working (unsaved) case,
      // `fragment.workingCase` holds the just-closed case, but it was
      // never a member of savedCases and is dropped here exactly like
      // everywhere else RESTART drops workingCase — leaving genuinely no
      // record, on purpose.
      return { ...initialSession, savedCases: fragment.savedCases }
    }
    case 'REOPEN_CASE': {
      const fragment = reopenCase(s.savedCases, a.id, a.now)
      if (!fragment) return s
      const { navigateTo, ...rest } = fragment
      return {
        ...s, ...rest,
        history: [...s.history, s.screen], screen: navigateTo as ScreenId,
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    }
    case 'REMOVE_SAVED': {
      const fragment = removeSaved({ savedCases: s.savedCases, activeCaseId: s.activeCaseId }, a.id)
      return {
        ...s, ...fragment,
        // Design note 4: the casefile screen's inline confirm sets
        // screen:'home', history:[] BEFORE removing (prototype 2881) —
        // folded into this one action so the citizen can never be left on
        // a screen for a case that no longer exists, regardless of what
        // dispatches it.
        screen: 'home', history: [],
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    }
    case 'SET_REMIND': {
      const fragment = setRemind(
        { activeCaseId: s.activeCaseId, workingCase: s.workingCase, savedCases: s.savedCases },
        a.value,
      )
      return fragment ? { ...s, ...fragment } : s
    }
    case 'TOGGLE_LOG':
      return { ...s, ...toggleLog(s.logOpen, a.caseId) }
    case 'SET_REMOVE_CONFIRM':
      return { ...s, ...setRemoveConfirm(a.id) }
    case 'SET_REMINDER_COPIED':
      return { ...s, ...setReminderCopied(a.value) }
    case 'SET_PREP_DRAFT':
      return { ...s, prepDraft: a.text }
    case 'PHASE_DRIFT_RECHECK':
      return {
        ...s, phaseDrift: false,
        history: [...s.history, s.screen], screen: 'sir-q1',
        trustOpen: false, restartConfirm: false, removeConfirm: null,
      }
    case 'TOGGLE_PREP_STEP': {
      const prepChecks = { ...s.prepChecks, [a.index]: !s.prepChecks[a.index] }
      // Prototype togglePrepStep() (3685-3695): "a saved case keeps itself
      // current: ticking steps after saving updates the snapshot rather
      // than letting the Home card drift." Guarded on BOTH still_open AND
      // an engine match — `c.engineKey===S.screen.split('-')[0]` (3690),
      // transcribed verbatim as `s.screen.split('-')[0]` below. The engine
      // guard is load-bearing, not incidental: without it, ticking a
      // passport step while a voter case happens to be the active one
      // would silently overwrite the voter case's snapshot with passport
      // data.
      const c = activeCase(s)
      const currentEngine = s.screen.split('-')[0]
      if (!c || c.outcome !== 'still_open' || c.engineKey !== currentEngine) {
        return { ...s, prepChecks }
      }
      const d = diagnose(ENGINES[c.engineKey], s.answers)
      const snap = caseSnapshot(c.engineKey, c.serviceLabel, s.screen, d, s.answers, prepChecks, a.now)
      // DEVIATION D7 (second site — the first was Task 6's check-in state
      // machine, cases.ts's applyCheckinPatch): a faithful
      // `Object.assign(c, caseSnapshot(...))` (3691) resets `savedAt` to
      // `now`, so EVERY ticked checkbox would push the case's "Saved
      // {date}" forward on Home and the casefile screen. `savedAt` is
      // pinned back to the existing case's own value; `lastCheck` is a
      // DIFFERENT clock this action never touches (the prototype doesn't
      // stamp it here either).
      const updated: Casefile = { ...c, ...snap, savedAt: c.savedAt }
      const placement = s.activeCaseId === 'working'
        ? { workingCase: updated, savedCases: s.savedCases }
        : { workingCase: s.workingCase, savedCases: s.savedCases.map(x => (x.id === s.activeCaseId ? updated : x)) }
      return { ...s, prepChecks, ...placement }
    }
  }
}
