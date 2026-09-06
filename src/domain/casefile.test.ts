import { describe, it, expect } from 'vitest'
import { diagnose } from './engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { PREP } from '../playbooks/prep'
import { passportPlaybook } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook, SIR_STATES, SIR_PHASES } from '../playbooks/sirPlaybook'
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { retiredActionFindings } from '../playbooks/guardrails/contentSafety'
import { caseSnapshot, sirPhaseId, casefileCopyExtras, LOG_COPY } from './casefile'

const NOW = 1_725_000_000_000

describe('caseSnapshot', () => {
  it('produces every field, from a real diagnosis — never a hand-built Diagnosis', () => {
    const answers = { q1: 'adverse', q2: 'informal' }
    const d = diagnose(passportEngine, answers)
    const prepChecks = { 0: true, 2: true }
    const snap = caseSnapshot('passport', 'Passport', 'passport-nextmove', d, answers, prepChecks, NOW)

    expect(snap.engineKey).toBe('passport')
    expect(snap.serviceLabel).toBe('Passport')
    expect(snap.returnScreen).toBe('passport-nextmove')
    expect(snap.answers).toEqual(answers)
    expect(snap.answers).not.toBe(answers) // copied, not aliased
    expect(snap.prepChecks).toEqual(prepChecks)
    expect(snap.prepChecks).not.toBe(prepChecks) // copied, not aliased
    expect(snap.savedAt).toBe(NOW)
    expect(snap.stateLabel).toBe(d.label)
    expect(snap.rec).toBe(d.rec)
    expect(snap.whatShort).toBe(d.whatShort)
    expect(snap.stepsTotal).toBe(PREP['state-5a'].steps.length)
    expect(snap.stepsDone).toBe(2)
    expect(snap.sirPhaseId).toBeNull()
  })

  it('falls back to null whatShort when the diagnosis carries none (defensive `|| null`, mirrors the prototype)', () => {
    const answers = { q1: 'adverse', q2: 'informal' }
    const d = diagnose(passportEngine, answers)
    const snap = caseSnapshot('passport', 'Passport', 'passport-nextmove', { ...d, whatShort: '' }, answers, {}, NOW)
    expect(snap.whatShort).toBeNull()
  })

  it('stepsTotal/stepsDone are 0 for a WAIT diagnosis with no prep plan', () => {
    const answers = { q1: 'no_contact', q2: 'no_followup' }
    const d = diagnose(passportEngine, answers)
    expect(d.ruleId).toBe('state-1')
    const snap = caseSnapshot('passport', 'Passport', 'passport-nextmove', d, answers, { 0: true }, NOW)
    expect(snap.stepsTotal).toBe(0)
    expect(snap.stepsDone).toBe(0)
  })

  it('never returns caseFacts / appliedText / interpProvenance (scope exclusion 3, mechanised)', () => {
    const answers = { q1: 'adverse', q2: 'informal' }
    const d = diagnose(passportEngine, answers)
    const snap = caseSnapshot('passport', 'Passport', 'passport-nextmove', d, answers, {}, NOW)
    expect('caseFacts' in snap).toBe(false)
    expect('appliedText' in snap).toBe(false)
    expect('interpProvenance' in snap).toBe(false)
  })

  it('wires a real SIR diagnosis through to sirPhaseId end to end', () => {
    const answers = { sirState: 'delhi', sirQ1: 'notice' }
    const d = diagnose(sirEngine, answers)
    const snap = caseSnapshot('sir', 'Voter roll (SIR)', 'sir-nextmove', d, answers, {}, NOW)
    expect(snap.sirPhaseId).toBe(SIR_PHASES.claims_notice.id)
  })
})

describe('sirPhaseId (D4 defensive lookup)', () => {
  it('is SIR_PHASES.claims_notice.id for a covered state with a real phase, under sirEngine', () => {
    expect(sirPhaseId('sir', { sirState: 'delhi', sirQ1: 'notice' })).toBe(SIR_PHASES.claims_notice.id)
  })

  it('is null for a non-SIR service', () => {
    expect(sirPhaseId('passport', { sirState: 'delhi' })).toBeNull()
  })

  it('is null for a real but unsupported SIR state (bihar)', () => {
    expect(sirPhaseId('sir', { sirState: 'bihar' })).toBeNull()
  })

  it('is null, not a throw, for a genuinely unknown SIR state value', () => {
    expect(() => sirPhaseId('sir', { sirState: 'atlantis' })).not.toThrow()
    expect(sirPhaseId('sir', { sirState: 'atlantis' })).toBeNull()
  })

  it('is null, not a throw, when sirState is entirely absent', () => {
    expect(() => sirPhaseId('sir', {})).not.toThrow()
    expect(sirPhaseId('sir', {})).toBeNull()
  })
})

describe('casefileCopyExtras() guardrail sweep (the shape prep.test.ts uses)', () => {
  const PLAYBOOKS = [passportPlaybook, voterPlaybook, sirPlaybook]

  it.each(PLAYBOOKS.map(p => [p.serviceId, p] as const))('%s: casefile copy is clean', (_id, playbook) => {
    expect(guardrailFindings(playbook, {
      currentPhaseId: playbook.serviceId === 'sir' ? SIR_STATES.delhi.phase!.id : 'none',
      extra: casefileCopyExtras(),
    })).toEqual([])
  })

  it('joins the retired-action scan under the live SIR phase, and is clean there too', () => {
    expect(retiredActionFindings(sirPlaybook, SIR_STATES.delhi.phase!.id, casefileCopyExtras())).toEqual([])
  })

  it('is not vacuous — it emits at least one location per LOG_COPY key', () => {
    const ats = new Set(casefileCopyExtras().map(c => c.at))
    for (const key of Object.keys(LOG_COPY)) expect(ats.has(`casefile:LOG_COPY.${key}`), key).toBe(true)
    expect(ats.size).toBe(Object.keys(LOG_COPY).length)
  })

  it('every entry carries the mandatory casefile: prefix', () => {
    for (const c of casefileCopyExtras()) expect(c.at).toMatch(/^casefile:LOG_COPY\./)
  })

  it('the two bare suffixes are registered and scanned as their own separate strings, never pre-concatenated onto an option label', () => {
    const byAt = new Map(casefileCopyExtras().map(c => [c.at, c.text]))
    expect(byAt.get('casefile:LOG_COPY.rejectedSuffix')).toBe(' — rejected')
    expect(byAt.get('casefile:LOG_COPY.pendingSuffix')).toBe(' — deliverable still pending')
  })
})

describe('LOG_COPY completeness', () => {
  // Every string cases.ts will later compose must be a key here, so a new
  // entry string added in a later task cannot be inlined in session/ and
  // skip the guardrail scan (see the file's own header comment).
  it('has exactly the 9 keys this chunk ships — no fewer, no silent extra', () => {
    expect(Object.keys(LOG_COPY).sort()).toEqual([
      'caseSaved', 'checkedNoChange', 'closedDeliverable', 'closedUnresolved',
      'elseReDiagnose', 'inHandSuffix', 'pendingSuffix', 'rejectedSuffix', 'reopened',
    ])
  })

  it('transcribes every string byte-for-byte from the locked prototype', () => {
    expect(LOG_COPY.checkedNoChange).toBe('Checked in — no change reported')
    expect(LOG_COPY.elseReDiagnose).toBe('Reported something outside the listed options; re-diagnosing')
    expect(LOG_COPY.rejectedSuffix).toBe(' — rejected')
    expect(LOG_COPY.pendingSuffix).toBe(' — deliverable still pending')
    expect(LOG_COPY.inHandSuffix).toBe(' — and the deliverable is in hand')
    expect(LOG_COPY.closedDeliverable).toBe('Case closed — deliverable received')
    expect(LOG_COPY.closedUnresolved).toBe('Closed as unresolved, every verified step used')
    expect(LOG_COPY.reopened).toBe('Case reopened: this came back')
    expect(LOG_COPY.caseSaved).toBe('Case saved')
  })
})

describe('casefile.ts is playbook-adjacent DATA — the isolation rule holds by construction', () => {
  // Belt-and-braces alongside guardrails/isolation.test.ts, named at the site
  // someone would be tempted to break it: casefile.ts declares its own
  // {at,text} interface exactly as prep.ts and sirPlaybook.ts do.
  it('exports a flattener whose entries all carry the casefile: prefix', () => {
    for (const c of casefileCopyExtras()) expect(c.at).toMatch(/^casefile:LOG_COPY\./)
  })
})
