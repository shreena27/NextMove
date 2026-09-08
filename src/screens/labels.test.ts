import { describe, it, expect } from 'vitest'
import { VOTER_ENTRY_LABELS } from './labels'
import { VOTER_COPY } from './screenCopy'

describe('VOTER_ENTRY_LABELS (D15)', () => {
  it('has exactly the three describe-chain option keys', () => {
    expect(Object.keys(VOTER_ENTRY_LABELS).sort()).toEqual(['applied', 'notsure', 'sir'])
  })

  it("is reference-identical to VOTER_COPY.entry.applied/.sir/.notSure — so the map can never become a second copy of the copy", () => {
    expect(VOTER_ENTRY_LABELS.applied).toBe(VOTER_COPY.entry.applied)
    expect(VOTER_ENTRY_LABELS.sir).toBe(VOTER_COPY.entry.sir)
    expect(VOTER_ENTRY_LABELS.notsure).toBe(VOTER_COPY.entry.notSure)
  })
})
