import { describe, it, expect } from 'vitest'
import { diagnose, type ServiceEngine } from './engine'
import { applyEvent } from './answers'
import type { Playbook, PlaybookRule, Diagnosis } from './types'

const rule = (id: string, condition: PlaybookRule['condition']): PlaybookRule => ({
  id,
  condition,
  rec: 'WAIT',
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source: { title: 'Toy source' },
})

const toy: Playbook = {
  serviceId: 'toy',
  rules: [
    rule('toy-outcome', a => a.someOutcome === 'yes'),
    rule('toy-q1', a => a.q1 === 'a'),
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'st-fallback',
    label: 'Toy unclear',
    dependency: 'Unknown',
    explanation: 'Toy fallback.',
    whatShort: 'Toy check directly.',
    whatToDo: 'Toy check status.',
    where: { label: 'Toy portal' },
    need: 'Toy need.',
    source: { title: 'Toy safety net' },
  },
}

describe('diagnose', () => {
  it('evaluates the playbook for ordinary answers', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy }
    expect(diagnose(engine, { q1: 'a' }).ruleId).toBe('toy-q1')
  })

  it("short-circuits to the fallback when an unclassified key says 'unclassified'", () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKeys: ['q1'] }
    const d = diagnose(engine, { q1: 'unclassified' })
    expect(d.ruleId).toBeNull()
    expect(d.rec).toBe('UNCLASSIFIED')
  })

  it("short-circuits when only a LATER configured key is 'unclassified' (the Voter appeal case)", () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKeys: ['q1', 'q2followup'] }
    const d = diagnose(engine, { q1: 'a', q2followup: 'unclassified' })
    expect(d.ruleId).toBeNull()
    expect(d.rec).toBe('UNCLASSIFIED')
  })

  it('the short-circuit beats a rule that stale outcome keys would match first', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKeys: ['q1'] }
    const d = diagnose(engine, { q1: 'unclassified', someOutcome: 'yes' })
    expect(d.ruleId).toBeNull()
  })

  it('without unclassifiedKeys, the literal value just falls through to the fallback via evaluate', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy }
    expect(diagnose(engine, { q1: 'unclassified' }).ruleId).toBeNull()
  })

  it('applies the decorator after evaluation', () => {
    const decorate = (d: Diagnosis): Diagnosis => ({ ...d, label: `decorated: ${d.label}` })
    const engine: ServiceEngine = { key: 'toy', playbook: toy, decorate }
    expect(diagnose(engine, { q1: 'a' }).label).toBe('decorated: Toy label toy-q1')
  })

  it('does not apply the decorator to the short-circuit fallback', () => {
    const decorate = (d: Diagnosis): Diagnosis => ({ ...d, label: 'decorated' })
    const engine: ServiceEngine = { key: 'toy', playbook: toy, decorate, unclassifiedKeys: ['q1'] }
    expect(diagnose(engine, { q1: 'unclassified' }).label).toBe('Toy unclear')
  })

  it('carries matchedAnswers on the short-circuit fallback too', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: toy, unclassifiedKeys: ['q1'] }
    const d = diagnose(engine, { q1: 'unclassified', extra: 'kept' })
    expect(d.matchedAnswers).toEqual({ q1: 'unclassified', extra: 'kept' })
  })
})

describe('check-in composition (applyEvent + diagnose): retire, don\'t reset', () => {
  // Toy ladder shaped like the real rung states: the "moving again" rule
  // (*-r) sits AHEAD of its parent rung, and the parent rung sits ahead of
  // the base state — most-specific-first, exactly how the real playbooks
  // are ordered.
  const ladder: Playbook = {
    ...toy,
    rules: [
      rule('toy-rung1-r', a => a.step === 'one' && a.stepOutcome === 'resolved'),
      rule('toy-rung1', a => a.step === 'one'),
      rule('toy-base', a => a.q1 === 'a'),
    ],
  }

  it("consuming a resolved outcome via {key: null} lands on the rung's own recommendation, not back at base", () => {
    const engine: ServiceEngine = { key: 'toy', playbook: ladder }
    const atRestingRung = { q1: 'a', step: 'one', stepOutcome: 'resolved' }
    expect(diagnose(engine, atRestingRung).ruleId).toBe('toy-rung1-r')

    const stalledAgain = applyEvent(atRestingRung, { stepOutcome: null })
    const d = diagnose(engine, stalledAgain)
    expect(d.ruleId).toBe('toy-rung1')
    expect(d.matchedAnswers.step).toBe('one')
  })

  it('an event patch never disturbs question answers (facts survive the check-in)', () => {
    const engine: ServiceEngine = { key: 'toy', playbook: ladder }
    const next = applyEvent({ q1: 'a', step: 'one' }, { stepOutcome: 'resolved' })
    expect(diagnose(engine, next).ruleId).toBe('toy-rung1-r')
    expect(next.q1).toBe('a')
  })
})
