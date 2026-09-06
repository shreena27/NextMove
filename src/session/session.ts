import type { AnswerRecord } from '../domain/types'
import { applyCorrection } from '../domain/answers'
import { DEPS_FOR } from '../playbooks/engines'

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
// Transcribe the exact id list from the prototype's own switch (3910-3944),
// taking only C3's screens; do not invent or normalise a name.
// C4 adds the three '*-prepare' ids (also the prototype's own, same
// switch) next to each service's existing block, per this union's own
// anticipation above — nothing else in this file changes for C4 (no new
// action, no new field, no reducer change; session.test.ts pins that).

/** C3's slice of the prototype's `S`. Fields belonging to later chunks
 *  (savedCases, workingCase, user, ci*, prep*, describe*, interp) are
 *  ABSENT on purpose — a field nothing reads is a field that rots. */
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
}

export const initialSession: SessionState = {
  screen: 'home', history: [], answers: {},
  restartConfirm: false, trustOpen: false,
  recoveryText: '', voterEntryExplain: false,
}

export type SessionAction =
  | { type: 'NAVIGATE'; screen: ScreenId; replace?: boolean }
  | { type: 'BACK' }
  | { type: 'ANSWER'; service: ServiceKey; key: string; value: string }
  | { type: 'RESTART_REQUEST' } | { type: 'RESTART_CANCEL' } | { type: 'RESTART' }
  | { type: 'TOGGLE_TRUST' }
  | { type: 'SET_RECOVERY_TEXT'; text: string }
  | { type: 'EXPLAIN_VOTER_ENTRY' }

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'NAVIGATE':
      return {
        ...s,
        history: a.replace ? s.history : [...s.history, s.screen],
        screen: a.screen,
        trustOpen: false, restartConfirm: false,
      }
    case 'BACK': {
      if (s.history.length === 0) return s
      const history = s.history.slice(0, -1)
      const prev = s.history[s.history.length - 1]
      // Home is a clean slate, always (prototype back(), line 2035).
      if (prev === 'home') return initialSession
      return { ...s, screen: prev, history, trustOpen: false, restartConfirm: false }
    }
    case 'ANSWER': {
      const { answers } = applyCorrection(s.answers, a.key, a.value, DEPS_FOR[a.service])
      return answers === s.answers ? s : { ...s, answers }
    }
    case 'RESTART_REQUEST': return { ...s, restartConfirm: true }
    case 'RESTART_CANCEL': return { ...s, restartConfirm: false }
    case 'RESTART': return initialSession
    case 'TOGGLE_TRUST': return { ...s, trustOpen: !s.trustOpen }
    case 'SET_RECOVERY_TEXT': return { ...s, recoveryText: a.text }
    case 'EXPLAIN_VOTER_ENTRY': return { ...s, voterEntryExplain: true }
  }
}
