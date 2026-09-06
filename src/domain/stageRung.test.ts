import { describe, it, expect } from 'vitest'
import { decorateStageRung } from './stageRung'
import type { Diagnosis } from './types'

const base = (over: Partial<Diagnosis>): Diagnosis => ({
  rec: 'FOLLOW_UP',
  ruleId: 'toy-1',
  matchedAnswers: {},
  state: 'st-1',
  label: 'Original label',
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source: { title: 'Toy source' },
  ...over,
})

const stages = { stage_a: 'Stage A short', stage_b: 'Stage B short' }

describe('decorateStageRung', () => {
  it('composes "{stage} · {rung}" when both exist', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    expect(decorateStageRung(d, stages, 'q1').label).toBe('Stage A short · rung one')
  })

  it('same rung under a different stage yields a distinct label', () => {
    const d1 = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    const d2 = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_b' } })
    expect(decorateStageRung(d1, stages, 'q1').label)
      .not.toBe(decorateStageRung(d2, stages, 'q1').label)
  })

  it('leaves the label untouched when the rule has no rungLabel', () => {
    const d = base({ matchedAnswers: { q1: 'stage_a' } })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('leaves the label untouched when the stage key has no mapped label', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'unknown' } })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('leaves the label untouched when the stage key is unanswered', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: {} })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('an empty stage map is a legal engine config — nothing decorates', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    expect(decorateStageRung(d, {}, 'q1')).toBe(d)
  })

  it('never composes from prototype-chain properties of the stage map', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'constructor' } })
    expect(decorateStageRung(d, stages, 'q1')).toBe(d)
  })

  it('does not mutate the input diagnosis', () => {
    const d = base({ rungLabel: 'rung one', matchedAnswers: { q1: 'stage_a' } })
    decorateStageRung(d, stages, 'q1')
    expect(d.label).toBe('Original label')
  })
})
