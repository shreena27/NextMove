import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { Classification } from '../domain/types'
import { StatusStamp } from './StatusStamp'
import { UI } from '../screens/screenCopy'

describe('StatusStamp (prototype stampClass/stampLabel/stampIcon, 2338-2347, markup 3594)', () => {
  it.each([
    ['WAIT', 'WAIT', 'wait'],
    ['FOLLOW_UP', 'FOLLOW UP', 'follow'],
    ['ESCALATE', 'ESCALATE', 'escalate'],
    ['UNCLASSIFIED', 'UNCLASSIFIED', 'unclassified'],
  ])('%s renders label %s with class .stamp.%s', (rec, label, cls) => {
    const { container } = render(<StatusStamp rec={rec as Classification} />)
    const el = container.querySelector('.stamp')!
    expect(el).toHaveTextContent(label)
    expect(el).toHaveClass('stamp', cls)
  })

  it('carries no ARIA role — the label is visible text, not a live region', () => {
    const { container } = render(<StatusStamp rec="ESCALATE" />)
    expect(container.querySelector('.stamp')).not.toHaveAttribute('role')
    expect(container.querySelector('.stamp-icon')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('StatusStamp mini variant (Task 8 design note 2 — the compact Home card, prototype 3127)', () => {
  it('renders no .stamp-icon in mini form, and carries the mini class alongside the status class', () => {
    const { container } = render(<StatusStamp rec="WAIT" mini />)
    expect(container.querySelector('.stamp-icon')).toBeNull()
    expect(container.querySelector('.stamp')).toHaveClass('stamp', 'mini', 'wait')
    expect(container.querySelector('.stamp')).toHaveTextContent('WAIT')
  })

  it('the existing full-size (non-mini) variant is unchanged', () => {
    const { container } = render(<StatusStamp rec="WAIT" />)
    expect(container.querySelector('.stamp-icon')).not.toBeNull()
    expect(container.querySelector('.stamp')).not.toHaveClass('mini')
    expect(container.querySelector('.stamp')).toHaveClass('stamp', 'wait')
  })

  it('closed renders the literal CLOSED text with the closedmark class, ignoring rec entirely, with no icon', () => {
    const { container } = render(<StatusStamp rec="ESCALATE" closed />)
    const el = container.querySelector('.stamp')!
    expect(el).toHaveClass('stamp', 'mini', 'closedmark')
    expect(el).toHaveTextContent(UI.card.closedMark)
    expect(el).not.toHaveClass('escalate')
    expect(container.querySelector('.stamp-icon')).toBeNull()
  })
})
