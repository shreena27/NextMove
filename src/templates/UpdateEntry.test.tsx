import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpdateEntry } from './UpdateEntry'
import { UI } from '../screens/screenCopy'

describe('UpdateEntry (port of updateEntry, prototype 2284-2289)', () => {
  it('renders exactly one button, carrying the pen icon and the label', () => {
    render(<UpdateEntry onUpdate={vi.fn()} />)
    const button = screen.getByRole('button', { name: UI.updateEntry.label })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(button).toHaveClass('btn-ghost')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('clicking it fires onUpdate — the component makes no routing decision of its own', () => {
    const onUpdate = vi.fn()
    render(<UpdateEntry onUpdate={onUpdate} />)
    screen.getByRole('button', { name: UI.updateEntry.label }).click()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
