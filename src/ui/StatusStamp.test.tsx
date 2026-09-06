import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { Classification } from '../domain/types'
import { StatusStamp } from './StatusStamp'

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
