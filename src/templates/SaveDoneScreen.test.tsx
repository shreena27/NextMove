// RED for Task 10 — SaveDoneScreen, the port of `renderSaveDone` (design/
// nextmove-v1-prototype.html, 3887-3899, tag v1-design-lock-2): the
// confirmation shown right after a case is saved.
//
// DESIGN NOTE 3's lede subtraction (Open Question 1, RESOLVED — option (b))
// is the load-bearing assertion in this file: the prototype's lede is two
// sentences, the second an auth-status statement C5 (device-local, no
// accounts) cannot back honestly. Only the first, true sentence is
// registered and rendered; the second is a deliberate omission for C7 to
// restore with its full ternary, not a bug to "fix" back in.
//
// "Back to my case" navigates directly via `pendingSave.returnScreen` (a
// plain NAVIGATE) — never through `continueSaved`/`CONTINUE_SAVED`, which
// isn't even a member of SessionAction in this codebase (Task 5 design note
// 7 — zero call sites in the locked prototype).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveDoneScreen } from './SaveDoneScreen'
import { UI } from '../screens/screenCopy'

const pendingSave = {
  engineKey: 'passport' as const,
  serviceLabel: UI.serviceLabel.passport,
  returnScreen: 'passport-nextmove' as const,
}

describe('SaveDoneScreen (port of renderSaveDone, prototype 3887-3899)', () => {
  it('renders the "Case saved" crumb (sq-butter), the headline and the lede — a `.narrow` shell, not a Split', () => {
    render(<SaveDoneScreen pendingSave={null} dispatch={vi.fn()} />)
    expect(document.querySelector('.narrow')).toBeInTheDocument()
    expect(document.querySelector('.split')).toBeNull()
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveDone.crumb)
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-butter')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(UI.saveDone.headline)
    expect(screen.getByText(UI.saveDone.lede)).toBeInTheDocument()
  })

  describe(
    'DESIGN NOTE 3 (Task 10, Open Question 1 RESOLVED, option (b)) — the lede is the one true sentence, ' +
    'the auth-coupled second sentence is a deliberate C7 subtraction',
    () => {
      it(
        'the lede contains "It\'s waiting on the Home screen whenever you come back" and does NOT contain ' +
        '"Nothing else happens with your"',
        () => {
          render(<SaveDoneScreen pendingSave={null} dispatch={vi.fn()} />)
          const lede = document.querySelector('.lede')!.textContent!
          expect(lede).toContain("It's waiting on the Home screen whenever you come back")
          expect(
            lede,
            'OQ1(b): this sentence is a deliberate subtraction (C5 is device-local, has no accounts at all — ' +
            'keeping it would assert the reader has one). Restoring it is C7\'s job (real auth); do not "fix" it ' +
            'back in here.',
          ).not.toContain('Nothing else happens with your')
        },
      )
    },
  )

  it('renders "Back to my case" only when a pendingSave is supplied', () => {
    const { rerender } = render(<SaveDoneScreen pendingSave={null} dispatch={vi.fn()} />)
    expect(screen.queryByText(UI.saveDone.backToCase)).toBeNull()
    rerender(<SaveDoneScreen pendingSave={pendingSave} dispatch={vi.fn()} />)
    expect(screen.getByText(UI.saveDone.backToCase)).toBeInTheDocument()
  })

  it(
    '"Back to my case" navigates directly via pendingSave.returnScreen (a plain NAVIGATE) — never through ' +
    'continueSaved/CONTINUE_SAVED, which is dead in the locked prototype and correctly absent from SessionAction',
    async () => {
      const dispatch = vi.fn()
      render(<SaveDoneScreen pendingSave={pendingSave} dispatch={dispatch} />)
      const btn = screen.getByRole('button', { name: new RegExp(UI.saveDone.backToCase) })
      expect(btn).toHaveClass('btn-primary', 'btn-block')
      await userEvent.click(btn)
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'passport-nextmove' })
    },
  )

  it('"Go to Home" is secondary+block and dispatches RESTART', async () => {
    const dispatch = vi.fn()
    render(<SaveDoneScreen pendingSave={null} dispatch={dispatch} />)
    const btn = screen.getByRole('button', { name: UI.saveDone.goHome })
    expect(btn).toHaveClass('btn-secondary', 'btn-block')
    await userEvent.click(btn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })
})
