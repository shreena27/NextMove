// The three service engines: C1's ServiceEngine shape, filled with C2's data.
// This is the only place playbook data and engine composition meet; no
// government-process rule lives here, only which composition each service uses.
import type { DependentKeys } from '../domain/answers'
import type { ServiceEngine } from '../domain/engine'
import { decorateStageRung } from '../domain/stageRung'
import { passportPlaybook, PASSPORT_STAGE_SHORT, PASSPORT_DEPS } from './passportPlaybook'
import { voterPlaybook, VOTER_DEPS, VOTER_UNCLASSIFIED_KEYS } from './voterPlaybook'
import { sirPlaybook } from './sirPlaybook'

/** Passport is the one service with an escalation ladder deep enough that the
 *  rung alone would hide the stage, so its labels compose "{stage} · {rung}".
 *  No unclassifiedKeys: passport's "I'm not sure" is stored as the literal
 *  'not_sure', which matches no condition and reaches the fallback through
 *  evaluate() on its own — the prototype's behavior, kept. */
export const passportEngine: ServiceEngine = {
  key: 'passport',
  playbook: passportPlaybook,
  decorate: d => decorateStageRung(d, PASSPORT_STAGE_SHORT, 'q1'),
}

/** Voter carries BOTH unclassified keys — see voterPlaybook's note and C1
 *  Task 6's recorded deviation. */
export const voterEngine: ServiceEngine = {
  key: 'voter',
  playbook: voterPlaybook,
  unclassifiedKeys: VOTER_UNCLASSIFIED_KEYS,
}

/** SIR has one question, so one unclassified key. No decoration: SIR has no
 *  escalation ladder to compose a label from. */
export const sirEngine: ServiceEngine = {
  key: 'sir',
  playbook: sirPlaybook,
  unclassifiedKeys: ['sirQ1'],
}

export const ENGINES: Record<string, ServiceEngine> = {
  passport: passportEngine,
  voter: voterEngine,
  sir: sirEngine,
}

/** Per-service answer dependencies, for C1's applyCorrection. SIR's sirQ1 has
 *  no dependent answers, so its map is deliberately empty rather than absent. */
export const DEPS_FOR: Record<string, DependentKeys> = {
  passport: PASSPORT_DEPS,
  voter: VOTER_DEPS,
  sir: {},
}
