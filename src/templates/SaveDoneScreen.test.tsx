// RED for Task 10, restored (with the auth-coupled tail) by Task 14 — Save
// DoneScreen, the port of `renderSaveDone` (design/nextmove-v1-prototype.html,
// 3887-3899, tag v1-design-lock-2): the confirmation shown right after a case
// is saved.
//
// DESIGN NOTE 3's lede subtraction (Open Question 1, RESOLVED — option (b))
// is DISCHARGED as of Task 14: the prototype's lede is two sentences, the
// second an auth-status statement C5 (device-local, no accounts) could not
// back honestly, so C5 registered only the first sentence and left the
// second as a deliberate, recorded omission for C7 (real auth) to restore.
// The debt is now paid — the describe block below pins both restored
// branches (phone -> "...your number.", Google/email -> "...your account.")
// plus the no-user guard that deliberately does NOT match the prototype's own
// ternary (which falls through to 'account' with no user).
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
import type { AppUser } from '../session/auth'

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
    'DESIGN NOTE 3 (Task 10, Open Question 1 RESOLVED, option (b)) — Task 14 (C7, real auth) restores the ' +
    'auth-coupled second sentence; the debt C5 recorded is now paid',
    () => {
      const phoneUser: AppUser = { method: 'phone', id: 'u-phone', name: null }
      const googleUser: AppUser = { method: 'google', id: 'u-google', name: null }
      const emailUser: AppUser = { method: 'email', id: 'u-email', name: null }

      it(
        'phone user — the .lede\'s full textContent is the first sentence, one space, then "Nothing else ' +
        'happens with your number." (joined-string equality, not per-half toContain, so a missing or doubled ' +
        'separator fails)',
        () => {
          render(<SaveDoneScreen pendingSave={null} user={phoneUser} dispatch={vi.fn()} />)
          const lede = document.querySelector('.lede')!.textContent!
          expect(lede).toBe(`${UI.saveDone.lede} ${UI.saveDone.ledeTailPhone}`)
        },
      )

      it(
        'google user — the .lede\'s full textContent is the first sentence, one space, then "Nothing else ' +
        'happens with your account."',
        () => {
          render(<SaveDoneScreen pendingSave={null} user={googleUser} dispatch={vi.fn()} />)
          const lede = document.querySelector('.lede')!.textContent!
          expect(lede).toBe(`${UI.saveDone.lede} ${UI.saveDone.ledeTailOther}`)
        },
      )

      it(
        'email user — the .lede\'s full textContent is the first sentence, one space, then "Nothing else ' +
        'happens with your account." (the ternary\'s else branch covers both Google and email)',
        () => {
          render(<SaveDoneScreen pendingSave={null} user={emailUser} dispatch={vi.fn()} />)
          const lede = document.querySelector('.lede')!.textContent!
          expect(lede).toBe(`${UI.saveDone.lede} ${UI.saveDone.ledeTailOther}`)
        },
      )

      it(
        'no user — the .lede\'s full textContent is ONLY the first sentence; neither auth-coupled sentence ' +
        'renders. This is the one place C7 deliberately does not transcribe the prototype\'s own ternary (which ' +
        'falls through to \'account\' with no user): rendering the "account" sentence with no real account would ' +
        'be exactly the misleading claim C5 subtracted this sentence to avoid',
        () => {
          render(<SaveDoneScreen pendingSave={null} user={null} dispatch={vi.fn()} />)
          const lede = document.querySelector('.lede')!.textContent!
          expect(lede).toBe(UI.saveDone.lede)
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
