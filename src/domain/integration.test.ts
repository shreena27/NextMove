// Integration coverage: nothing else in the suite composes diagnose()
// (engine.ts) with decorateStageRung (stageRung.ts) through a real
// evaluate()-produced Diagnosis, and nothing walks
// applyCorrection -> applyEvent -> diagnose end to end. Toy fixtures only,
// per the Global Constraint (no plausible government copy).
import { describe, it, expect } from 'vitest'
import { diagnose, type ServiceEngine } from './engine'
import { decorateStageRung } from './stageRung'
import { applyCorrection, applyEvent } from './answers'
import type { AnswerRecord, Playbook, PlaybookRule } from './types'

const rule = (
  id: string,
  condition: PlaybookRule['condition'],
  extra: Partial<PlaybookRule> = {},
): PlaybookRule => ({
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
  source: { docId: null, title: 'Toy source' },
  ...extra,
})

const toyFallback = {
  rec: 'UNCLASSIFIED' as const,
  state: 'st-fallback',
  label: 'Toy unclear',
  dependency: 'Unknown',
  explanation: 'Toy fallback.',
  whatShort: 'Toy check directly.',
  whatToDo: 'Toy check status.',
  where: { label: 'Toy portal' },
  need: 'Toy need.',
  source: { docId: null, title: 'Toy safety net' },
}

describe('integration: diagnose() composed with decorateStageRung', () => {
  const toy: Playbook = {
    serviceId: 'toy',
    rules: [rule('toy-rung', a => a.q1 === 'stage_a', { rungLabel: 'Toy rung label' })],
    fallback: toyFallback,
  }

  const engine: ServiceEngine = {
    key: 'toy',
    playbook: toy,
    decorate: d => decorateStageRung(d, { stage_a: 'Toy stage' }, 'q1'),
  }

  it('composes "{stage} · {rung}" through a real evaluate()-produced diagnosis', () => {
    const d = diagnose(engine, { q1: 'stage_a' })
    expect(d.ruleId).toBe('toy-rung')
    expect(d.label).toBe('Toy stage · Toy rung label')
  })

  it('leaves the evaluate() fallback undecorated when composed this way too', () => {
    const d = diagnose(engine, { q1: 'unmapped' })
    expect(d.ruleId).toBeNull()
    expect(d.label).toBe('Toy unclear')
  })
})

describe('integration: session walk — applyEvent + applyCorrection + diagnose', () => {
  const deps = { q1: ['q2'] }

  const toy: Playbook = {
    serviceId: 'toy',
    rules: [rule('toy-rung', a => a.step === 'one'), rule('toy-base', a => a.q1 === 'a')],
    fallback: toyFallback,
  }

  const engine: ServiceEngine = { key: 'toy', playbook: toy }

  it('walks base answers -> event -> correction -> diagnose, clearing declared dependents while an outcome key survives', () => {
    const base: AnswerRecord = { q1: 'a', q2: 'b' }
    expect(diagnose(engine, base).ruleId).toBe('toy-base')

    // A check-in reports movement: the citizen advanced to rung "one".
    const atRung = applyEvent(base, { step: 'one', someOutcome: 'yes' })
    expect(diagnose(engine, atRung).ruleId).toBe('toy-rung')

    // The citizen corrects q1. q2 is a declared dependent and must clear;
    // the check-in's outcome key must survive untouched.
    const { answers: corrected, changed } = applyCorrection(atRung, 'q1', 'z', deps)
    expect(changed).toBe(true)
    expect(corrected.q2).toBeUndefined()
    expect(corrected.someOutcome).toBe('yes')

    // "step" wasn't touched by the correction, so diagnose() still lands on
    // the expected rung rule.
    expect(diagnose(engine, corrected).ruleId).toBe('toy-rung')
  })
})
