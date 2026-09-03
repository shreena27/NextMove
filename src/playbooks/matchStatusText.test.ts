import { describe, it, expect } from 'vitest'
import { matchStatusText } from './matchStatusText'

// This is a simple keyword heuristic, not AI classification — it must be
// conservative and return undefined (no match) rather than guess, per
// PRD FR-10 / the "never guess to produce a more satisfying diagnosis" rule.
describe('matchStatusText', () => {
  it('matches adverse/negative language to the adverse stage', () => {
    expect(matchStatusText('The status shows adverse report received')).toBe('adverse')
  })

  it('matches "not yet verified" style language to no_contact', () => {
    expect(matchStatusText('Police verification not yet initiated')).toBe('no_contact')
  })

  it('matches "verification in progress" language to contacted_incomplete', () => {
    expect(matchStatusText('Police verification is in progress')).toBe('contacted_incomplete')
  })

  it('matches "report submitted" style language to verified_no_progress', () => {
    expect(matchStatusText('Police report submitted, granted pending')).toBe(
      'verified_no_progress',
    )
  })

  it('returns undefined for empty input', () => {
    expect(matchStatusText('')).toBeUndefined()
  })

  it('returns undefined for text it cannot confidently classify', () => {
    expect(matchStatusText('my cat knocked over a plant')).toBeUndefined()
  })
})
