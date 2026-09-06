/** A verified SIR phase a state can be in. Phases constrain which question
 *  options are even offered — impossible options are structurally absent,
 *  not filtered after the fact. Real phase/state data ships in C2. */
export interface SirPhase {
  id: string
  label: string
  /** Context note shown on the Diagnosis screen. */
  note: string
}

export interface SirStateConfig {
  id: string
  name: string
  /** false routes to the coverage-boundary screen, never to the playbook. */
  supported: boolean
  /** Required when supported; its id selects the offered option set. */
  phase?: SirPhase
}

/** Derive the question options for a state's current verified phase.
 *  Throws (rather than returning something) for unsupported/misconfigured
 *  states: callers must gate on sirCoverage() first, so reaching this
 *  without a phase is a programming error, not a user state. */
export function optionsForPhase<T>(
  state: SirStateConfig,
  optionsByPhase: Record<string, T>,
): T {
  if (!state.supported || !state.phase) {
    throw new Error(`unsupported SIR state: ${state.id}`)
  }
  const options = optionsByPhase[state.phase.id]
  if (options === undefined) {
    throw new Error(`no options configured for phase: ${state.phase.id}`)
  }
  return options
}

/** The structural coverage verdict: only a supported state with a verified
 *  phase calendar is ever diagnosed (and therefore reaches the SIR
 *  playbook). Everything else is out of coverage — the C3 router maps that
 *  to the honest coverage-boundary screen, and C6 layers the
 *  source-degraded "re-verifying" destination on top without changing this
 *  signature. A supported state missing its phase config is out of
 *  coverage by deliberate hardening (the prototype crashes on it). */
export function sirCoverage(state: SirStateConfig): 'covered' | 'out-of-coverage' {
  return state.supported && state.phase ? 'covered' : 'out-of-coverage'
}
