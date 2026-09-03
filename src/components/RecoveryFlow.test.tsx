import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { RecoveryFlow } from './RecoveryFlow'

describe('RecoveryFlow', () => {
  it('offers exactly the three approved options', () => {
    render(<RecoveryFlow onResolved={() => {}} onShowMeWhere={() => {}} />)
    expect(screen.getByRole('button', { name: /paste what your status page shows/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show me where to find my status/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /tell me the safest thing to do/i }),
    ).toBeInTheDocument()
  })

  it('"tell me the safest thing to do" resolves directly to unclassified, no guessing', async () => {
    const onResolved = vi.fn()
    render(<RecoveryFlow onResolved={onResolved} onShowMeWhere={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /tell me the safest thing to do/i }))

    expect(onResolved).toHaveBeenCalledWith(undefined)
  })

  it('"show me where" calls onShowMeWhere rather than producing a diagnosis', async () => {
    const onShowMeWhere = vi.fn()
    const onResolved = vi.fn()
    render(<RecoveryFlow onResolved={onResolved} onShowMeWhere={onShowMeWhere} />)

    await userEvent.click(screen.getByRole('button', { name: /show me where to find my status/i }))

    expect(onShowMeWhere).toHaveBeenCalledOnce()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('pasting confidently-matchable status text resolves to the matched stage', async () => {
    const onResolved = vi.fn()
    render(<RecoveryFlow onResolved={onResolved} onShowMeWhere={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /paste what your status page shows/i }))
    await userEvent.type(screen.getByRole('textbox'), 'Adverse report received')
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(onResolved).toHaveBeenCalledWith('adverse')
  })

  it('pasting unmatchable text resolves to unclassified rather than a forced guess', async () => {
    const onResolved = vi.fn()
    render(<RecoveryFlow onResolved={onResolved} onShowMeWhere={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: /paste what your status page shows/i }))
    await userEvent.type(screen.getByRole('textbox'), 'my cat knocked over a plant')
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    expect(onResolved).toHaveBeenCalledWith(undefined)
  })
})
