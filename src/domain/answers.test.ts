import { describe, it, expect } from 'vitest'
import { applyCorrection, applyEvent } from './answers'

describe('applyCorrection', () => {
  const deps = { q1: ['q2'], q2: ['q3'] }

  it('sets a new answer and reports changed', () => {
    const r = applyCorrection({}, 'q1', 'a', deps)
    expect(r.changed).toBe(true)
    expect(r.answers).toEqual({ q1: 'a' })
  })

  it('is a no-op when the value is unchanged (same object back, nothing cleared)', () => {
    const answers = { q1: 'a', q2: 'b' }
    const r = applyCorrection(answers, 'q1', 'a', deps)
    expect(r.changed).toBe(false)
    expect(r.answers).toBe(answers)
    expect(r.answers.q2).toBe('b')
  })

  it('clears dependent keys when the value changes', () => {
    const r = applyCorrection({ q1: 'a', q2: 'b' }, 'q1', 'c', deps)
    expect(r.answers).toEqual({ q1: 'c' })
  })

  it('clears transitively through the deps chain', () => {
    const r = applyCorrection({ q1: 'a', q2: 'b', q3: 'c' }, 'q1', 'z', deps)
    expect(r.answers).toEqual({ q1: 'z' })
  })

  it('survives a cyclic deps map without hanging', () => {
    const cyclic = { a: ['b'], b: ['a'] }
    const r = applyCorrection({ a: '1', b: '2' }, 'a', '9', cyclic)
    expect(r.answers).toEqual({ a: '9' })
  })

  it('never clears the key being corrected, even if the deps map points back at it', () => {
    const r = applyCorrection({ q1: 'a', q2: 'b' }, 'q1', 'c', { q1: ['q2'], q2: ['q1'] })
    expect(r.answers.q1).toBe('c')
  })

  it('a correction clears only declared dependents — outcome keys survive', () => {
    const r = applyCorrection(
      { q1: 'a', q2: 'b', fOutcome: 'pending', dpgFiled: 'yes' },
      'q1', 'c', { q1: ['q2'] },
    )
    expect(r.answers).toEqual({ q1: 'c', fOutcome: 'pending', dpgFiled: 'yes' })
  })

  it('leaves unrelated keys alone', () => {
    const r = applyCorrection({ q1: 'a', other: 'keep' }, 'q1', 'c', deps)
    expect(r.answers.other).toBe('keep')
  })

  it('does not mutate the input record', () => {
    const answers = { q1: 'a', q2: 'b' }
    applyCorrection(answers, 'q1', 'c', deps)
    expect(answers).toEqual({ q1: 'a', q2: 'b' })
  })

  it('works with no deps map given', () => {
    const r = applyCorrection({ q1: 'a' }, 'q1', 'b')
    expect(r.answers).toEqual({ q1: 'b' })
  })
})

describe('applyEvent', () => {
  it('merges new keys without touching existing ones', () => {
    const next = applyEvent({ q1: 'a', q2: 'b' }, { fOutcome: 'pending' })
    expect(next).toEqual({ q1: 'a', q2: 'b', fOutcome: 'pending' })
  })

  it('overwrites a key present in the patch', () => {
    const next = applyEvent({ fOutcome: 'pending' }, { fOutcome: 'resolved' })
    expect(next.fOutcome).toBe('resolved')
  })

  it('deletes a key when the patch value is null', () => {
    const next = applyEvent({ q1: 'a', fOutcome: 'resolved' }, { fOutcome: null })
    expect(next).toEqual({ q1: 'a' })
  })

  it('applies multi-key patches atomically', () => {
    const next = applyEvent({ q1: 'a' }, { fOutcome: null, gOutcome: 'pending' })
    expect(next).toEqual({ q1: 'a', gOutcome: 'pending' })
  })

  it('does not mutate the input record', () => {
    const answers = { q1: 'a' }
    applyEvent(answers, { q1: 'b' })
    expect(answers.q1).toBe('a')
  })
})
