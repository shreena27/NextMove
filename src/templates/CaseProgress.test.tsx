import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { PrepPlan } from '../playbooks/prep'
import { UI } from '../screens/screenCopy'
import { CaseProgress } from './CaseProgress'

const PLAN: PrepPlan = { steps: ['a', 'b', 'c', 'd', 'e'] }

describe('CaseProgress (port of the casefile screen\'s prepare-progress block, prototype 2916-2919)', () => {
  it('renders "2 of 5 done" and a 40% fill', () => {
    const { container } = render(<CaseProgress prep={PLAN} prepChecks={{ 0: true, 2: true }} />)
    expect(container.querySelector('.cp-count')).toHaveTextContent('2 of 5 done')
    const fill = container.querySelector('.cp-fill') as HTMLElement
    expect(fill.style.width).toBe('40%')
  })

  it('renders "Prepare steps" as the head label', () => {
    const { container } = render(<CaseProgress prep={PLAN} prepChecks={{}} />)
    expect(container.querySelector('.cp-head')).toHaveTextContent(UI.casefile.prepareStepsK)
  })

  it('0 of 0 steps yields 0% and does not divide by zero', () => {
    const empty: PrepPlan = { steps: [] }
    const { container } = render(<CaseProgress prep={empty} prepChecks={{}} />)
    expect(container.querySelector('.cp-count')).toHaveTextContent('0 of 0 done')
    const fill = container.querySelector('.cp-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('renders nothing when there is no prep plan', () => {
    const { container } = render(<CaseProgress prep={null} prepChecks={{}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
