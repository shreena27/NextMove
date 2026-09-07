import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SERVICE_SQ } from './serviceSquare'
import { PhaseEyebrow } from './Crumbs'
import { UI } from '../screens/screenCopy'

describe('SERVICE_SQ (prototype 2310-2312) — moved out of Crumbs.tsx (Task 8 design note 1)', () => {
  it('maps exactly the three service labels, unchanged', () => {
    expect(SERVICE_SQ).toEqual({
      [UI.serviceLabel.passport]: 'sq-passport',
      [UI.serviceLabel.voterServices]: 'sq-voter',
      [UI.serviceLabel.sir]: 'sq-voter',
    })
  })

  it.each([
    [UI.serviceLabel.passport, 'sq-passport'],
    [UI.serviceLabel.voterServices, 'sq-voter'],
    [UI.serviceLabel.sir, 'sq-voter'],
  ])('Crumbs still renders the right square for %s (existing Crumbs behaviour, untouched)', (service, sq) => {
    const { container } = render(<PhaseEyebrow service={service} />)
    expect(container.querySelector('.crumb-sq')).toHaveClass(sq)
  })
})

describe('the two SERVICE_SQ fallbacks stay distinct (design note 1) — not a later "consistency" bug', () => {
  it("CaseCard's own fallback is 'sq-butter' — a card must show SOME square (also exercised on the real component in CaseCard.test.tsx)", () => {
    expect(SERVICE_SQ['Not A Real Service'] || 'sq-butter').toBe('sq-butter')
  })

  it("PhaseEyebrow's crumbs render NO square element at all for an unrecognised service — null, not sq-butter", () => {
    const { container } = render(<PhaseEyebrow service="Not A Real Service" />)
    expect(container.querySelector('.crumb-sq')).toBeNull()
  })
})
