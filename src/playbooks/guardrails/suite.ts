// TEST-ONLY. One call per playbook: every §7/§8 guardrail, reported together.
import { expect } from 'vitest'
import type { Playbook } from '../../domain/types'
import { citationFindings } from './citations'
import {
  copyStrings, bannedFindings, staleExemptionFindings,
  numericFindings, retiredActionFindings, causeStateFindings,
  type CopyString,
} from './contentSafety'

export interface SuiteOptions {
  /** Non-rule citizen-facing copy this playbook ships (SIR's phase notes). */
  extra?: CopyString[]
  /** The state's currently configured phase, for the retired-action scan.
   *  Playbooks with no phase model pass 'none'. */
  currentPhaseId?: string
}

export function guardrailFindings(playbook: Playbook, options: SuiteOptions = {}): string[] {
  const strings = [...copyStrings(playbook), ...(options.extra ?? [])]
  return [
    ...citationFindings(playbook),
    ...bannedFindings(strings),
    ...numericFindings(strings),
    ...retiredActionFindings(playbook, options.currentPhaseId ?? 'none'),
    ...causeStateFindings(playbook),
  ]
}

/** Asserts a playbook is clean. Assert on the findings ARRAY, not a boolean,
 *  so a failure prints exactly what broke. */
export function runGuardrailSuite(playbook: Playbook, options: SuiteOptions = {}): void {
  expect(guardrailFindings(playbook, options)).toEqual([])
}

export { staleExemptionFindings, copyStrings }
