import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import type { Playbook, PlaybookRule } from './types'

const rule = (id: string, condition: PlaybookRule['condition'], rec: PlaybookRule['rec'] = 'WAIT'): PlaybookRule => ({
  id,
  condition,
  rec,
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: `Toy dependency ${id}`,
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
    rule('toy-specific', a => a.k1 === 'x' && a.k2 === 'y', 'ESCALATE'),
    rule('toy-general', a => a.k1 === 'x', 'FOLLOW_UP'),
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'st-fallback',
    label: 'Toy unclear',
    dependency: 'Unknown',
    explanation: 'Toy fallback explanation.',
    whatShort: 'Toy check directly.',
    whatToDo: 'Toy check status directly.',
    where: { label: 'Toy portal' },
    need: 'Toy need.',
    source: { title: "Toy safety net" },
  },
}

describe('evaluate', () => {
  it('returns the first matching rule (order wins over later matches)', () => {
    const d = evaluate(toy, { k1: 'x', k2: 'y' })
    expect(d.ruleId).toBe('toy-specific')
    expect(d.rec).toBe('ESCALATE')
  })

  it('falls through to a later rule when earlier conditions fail', () => {
    const d = evaluate(toy, { k1: 'x' })
    expect(d.ruleId).toBe('toy-general')
    expect(d.rec).toBe('FOLLOW_UP')
  })

  it('returns the fallback with ruleId null when nothing matches', () => {
    const d = evaluate(toy, { k1: 'nope' })
    expect(d.ruleId).toBeNull()
    expect(d.rec).toBe('UNCLASSIFIED')
    expect(d.state).toBe('st-fallback')
  })

  it('returns the fallback for empty answers', () => {
    expect(evaluate(toy, {}).ruleId).toBeNull()
  })

  it('snapshots matchedAnswers as a copy, not a live reference', () => {
    const answers = { k1: 'x' }
    const d = evaluate(toy, answers)
    answers.k1 = 'mutated'
    expect(d.matchedAnswers).toEqual({ k1: 'x' })
  })

  it('does not leak the condition function onto the diagnosis', () => {
    const d = evaluate(toy, { k1: 'x' })
    expect('condition' in d).toBe(false)
    expect('id' in d).toBe(false)
  })
})
