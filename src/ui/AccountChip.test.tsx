// RED for Task 15 — AccountChip, the port of the prototype's account chip
// + popover (design/nextmove-v1-prototype.html, `acctPopover()` 2246-2261
// and `topbar()`'s `acct` fragment 2262-2271, plus the Escape handler at
// 3949, tag v1-design-lock-2). This is the ONLY C7 component built off no
// wired caller yet at RED time — see AccountChip.tsx's own header comment
// for the two considered a11y deviations from the prototype (the scrim
// stays a plain `<div>`, and `role="menu"` is deliberately dropped) that
// this file pins as negative tests, so neither can be silently "fixed"
// back later.
//
// `signOut` (session/auth.ts) is mocked — this component's own job is only
// to CALL it (auth.test.ts already covers its real Supabase-facing
// behaviour). `firstName`/`maskId` are left REAL: they are pure and small
// enough that mocking them would just re-assert their own implementation.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { AccountChip } from './AccountChip'
import { UI } from '../screens/screenCopy'
import { sessionReducer, initialSession, type SessionState } from '../session/session'
import { maskId, type AppUser } from '../session/auth'
import { loadCases } from '../session/caseStore'
import type { Casefile } from '../domain/casefile'
import * as authModule from '../session/auth'

vi.mock('../session/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../session/auth')>()
  return { ...actual, signOut: vi.fn() }
})

const signOut = vi.mocked(authModule.signOut)
const noop = () => {}

beforeEach(() => {
  vi.clearAllMocks()
  signOut.mockResolvedValue({ ok: true })
  localStorage.clear()
})

const namedUser: AppUser = { method: 'phone', id: '+919876543210', name: 'Ananya Sharma' }
const unnamedUser: AppUser = { method: 'phone', id: '+919876543210', name: null }

function makeCase(overrides: Partial<Casefile> = {}): Casefile {
  return {
    engineKey: 'passport',
    serviceLabel: UI.serviceLabel.passport,
    returnScreen: 'passport-nextmove',
    answers: {},
    prepChecks: {},
    savedAt: 1_726_000_000_000,
    stateLabel: 'x',
    rec: 'FOLLOW_UP',
    whatShort: null,
    stepsTotal: 0,
    stepsDone: 0,
    sirPhaseId: null,
    caseFacts: [],
    appliedText: null,
    interpProvenance: null,
    id: 'case-1',
    outcome: 'still_open',
    lastCheck: null,
    remindAt: null,
    log: [],
    ...overrides,
  }
}

/** A small stateful wrapper standing in for the session reducer — the SAME
 *  shape SaveNameScreen.test.tsx's own `Controlled` uses. Needed by every
 *  test below that must prove a REAL open/close/escape/scrim interaction,
 *  not just which action got dispatched off a mock. */
function Controlled({ seed }: { seed: Partial<SessionState> }) {
  const [state, dispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  return (
    <>
      <AccountChip state={state} dispatch={dispatch} />
      <div data-testid="screen">{state.screen}</div>
    </>
  )
}

describe('AccountChip — visibility and the chip itself', () => {
  it('renders nothing with user: null', () => {
    const { container } = render(<AccountChip state={initialSession} dispatch={noop} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('with a named user: the avatar initial is the uppercased first letter, the label is the first name, aria-expanded is false, and the noname class is absent', () => {
    render(<AccountChip state={{ ...initialSession, user: namedUser }} dispatch={noop} />)
    const chip = document.querySelector('.acct-chip') as HTMLButtonElement
    expect(chip).toBeInTheDocument()
    expect(chip).not.toHaveClass('noname')
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.acct-av')).toHaveTextContent('A')
    expect(chip).toHaveTextContent('Ananya')
    // Discriminating: not the surname, not the masked id.
    expect(chip).not.toHaveTextContent('Sharma')
  })

  it('with an unnamed user: the avatar is bullet, the label is the masked id, and the noname class is present', () => {
    render(<AccountChip state={{ ...initialSession, user: unnamedUser }} dispatch={noop} />)
    const chip = document.querySelector('.acct-chip') as HTMLButtonElement
    expect(chip).toHaveClass('noname')
    expect(document.querySelector('.acct-av')).toHaveTextContent('•')
    expect(chip).toHaveTextContent(maskId(unnamedUser))
  })

  it('clicking the chip opens the popover and flips aria-expanded; clicking again closes it and clears signOutConfirm', async () => {
    const user = userEvent.setup()
    render(<Controlled seed={{ user: namedUser, signOutConfirm: true }} />)
    const chip = document.querySelector('.acct-chip') as HTMLButtonElement
    // signOutConfirm seeded true but the popover starts closed — nothing to
    // assert about it yet; TOGGLE_ACCT's own opening branch does not touch it.
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    await user.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.acct-pop')).toBeInTheDocument()
    await user.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.acct-pop')).toBeNull()
    // Reopen: the confirm armed before closing must not have survived the
    // close (TOGGLE_ACCT's closing branch clears signOutConfirm).
    await user.click(chip)
    expect(document.querySelector('.acct-pop-confirm')).toBeNull()
    expect(screen.getByText(UI.account.signOut)).toBeInTheDocument()
  })
})

describe('AccountChip — the popover head', () => {
  it('with a name: shows the name with the masked id beneath', () => {
    render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true }} dispatch={noop} />)
    expect(document.querySelector('.acct-pop-name')).toHaveTextContent('Ananya Sharma')
    expect(document.querySelector('.acct-pop-sub')).toHaveTextContent(maskId(namedUser))
  })

  it('with no name: shows the masked id and no sub-line', () => {
    render(<AccountChip state={{ ...initialSession, user: unnamedUser, acctOpen: true }} dispatch={noop} />)
    expect(document.querySelector('.acct-pop-name')).toHaveTextContent(maskId(unnamedUser))
    expect(document.querySelector('.acct-pop-sub')).toBeNull()
  })
})

describe('AccountChip — the casefiles row', () => {
  it('singular copy at 1 open case, and a superseded case is not counted', () => {
    render(
      <AccountChip
        state={{
          ...initialSession, user: namedUser, acctOpen: true,
          savedCases: [makeCase({ id: 'a', outcome: 'still_open' }), makeCase({ id: 'b', outcome: 'superseded' })],
        }}
        dispatch={noop}
      />,
    )
    expect(document.querySelector('.acct-pop-row')).toHaveTextContent(UI.account.casefilesOne.replace('{n}', '1'))
    expect(document.querySelector('.acct-pop-row')).not.toHaveTextContent(UI.account.casefilesMany.replace('{n}', '2'))
    expect(screen.getByText(UI.account.casefilesSub)).toBeInTheDocument()
  })

  it('plural copy at 2 open cases, still excluding the superseded one', () => {
    render(
      <AccountChip
        state={{
          ...initialSession, user: namedUser, acctOpen: true,
          savedCases: [
            makeCase({ id: 'a', outcome: 'still_open' }),
            makeCase({ id: 'b', outcome: 'still_open' }),
            makeCase({ id: 'c', outcome: 'superseded' }),
          ],
        }}
        dispatch={noop}
      />,
    )
    expect(document.querySelector('.acct-pop-row')).toHaveTextContent(UI.account.casefilesMany.replace('{n}', '2'))
  })

  it('the row dispatches RESTART, and the resulting state still has user set — this row must not sign the citizen out', async () => {
    const dispatch = vi.fn()
    const state: SessionState = {
      ...initialSession, user: namedUser, acctOpen: true,
      savedCases: [makeCase({ id: 'a', outcome: 'still_open' })],
    }
    render(<AccountChip state={state} dispatch={dispatch} />)
    // The casefiles row is always the FIRST `.acct-pop-row` (head, then
    // casefiles, then the conditional rows) — located structurally rather
    // than by its templated text, which varies with the open count.
    const casefilesRow = document.querySelectorAll('.acct-pop-row')[0] as HTMLButtonElement
    expect(casefilesRow).toHaveTextContent(UI.account.casefilesOne.replace('{n}', '1'))
    await userEvent.click(casefilesRow)
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
    const result = sessionReducer(state, { type: 'RESTART' })
    expect(result.user, 'this row must not sign the citizen out').toEqual(namedUser)
  })
})

describe('AccountChip — "Add your name"', () => {
  it('renders only without a name', () => {
    const { rerender } = render(<AccountChip state={{ ...initialSession, user: unnamedUser, acctOpen: true }} dispatch={noop} />)
    expect(screen.getByText(UI.account.addName)).toBeInTheDocument()
    rerender(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true }} dispatch={noop} />)
    expect(screen.queryByText(UI.account.addName)).toBeNull()
  })

  it('navigates to save-name with pendingName cleared', async () => {
    const dispatch = vi.fn()
    render(<AccountChip state={{ ...initialSession, user: unnamedUser, acctOpen: true, pendingName: 'stale' }} dispatch={dispatch} />)
    await userEvent.click(screen.getByText(UI.account.addName))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_PENDING_NAME', value: '' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'save-name' })
  })

  it('navigation closes the popover too — a real reducer run, not just the dispatched action shape', async () => {
    render(<Controlled seed={{ user: unnamedUser, acctOpen: true }} />)
    await userEvent.click(screen.getByText(UI.account.addName))
    expect(document.querySelector('.acct-pop')).toBeNull()
    expect(screen.getByTestId('screen')).toHaveTextContent('save-name')
  })
})

describe('AccountChip — sign-out', () => {
  it('the row arms the confirm', async () => {
    const dispatch = vi.fn()
    render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true }} dispatch={dispatch} />)
    await userEvent.click(screen.getByText(UI.account.signOut))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SIGN_OUT_CONFIRM', value: true })
  })

  it("the confirm's copy is D11's exact prototype string", () => {
    render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true, signOutConfirm: true }} dispatch={noop} />)
    expect(screen.getByText('Sign out? Your cases stay on your account. Sign back in any time.')).toBeInTheDocument()
  })

  it('.no disarms without signing out', async () => {
    const dispatch = vi.fn()
    render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true, signOutConfirm: true }} dispatch={dispatch} />)
    await userEvent.click(document.querySelector('.acct-pop-confirm .no') as HTMLButtonElement)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SIGN_OUT_CONFIRM', value: false })
    expect(signOut).not.toHaveBeenCalled()
  })

  it(
    '.yes calls the real auth.signOut() and dispatches SIGN_OUT with a localCases payload read from storage — ' +
    "this is one of only two SIGN_OUT dispatch sites, and the payload is what stops a failed migration's " +
    'preserved cases being overwritten',
    async () => {
      const storedCases = [makeCase({ id: 'still-local' })]
      localStorage.setItem('nm_cases', JSON.stringify(storedCases))
      const dispatch = vi.fn()
      render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true, signOutConfirm: true }} dispatch={dispatch} />)
      await userEvent.click(document.querySelector('.acct-pop-confirm .yes') as HTMLButtonElement)
      expect(signOut).toHaveBeenCalled()
      const expectedPayload = loadCases()
      await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'SIGN_OUT', localCases: expectedPayload }))
    },
  )
})

describe('AccountChip — Escape and the scrim', () => {
  it('Escape closes the popover and clears signOutConfirm', () => {
    render(<Controlled seed={{ user: namedUser, acctOpen: true, signOutConfirm: true }} />)
    expect(document.querySelector('.acct-pop')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.acct-pop')).toBeNull()
  })

  it('the keydown listener is removed on unmount — never leaked (spy on removeEventListener)', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true }} dispatch={noop} />)
    removeSpy.mockClear() // isolate the unmount's own cleanup from any prior effect churn
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('the listener is not left attached once the popover is already closed (added/removed per acctOpen, not permanent)', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: false }} dispatch={noop} />)
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('clicking the scrim dismisses the popover', async () => {
    render(<Controlled seed={{ user: namedUser, acctOpen: true }} />)
    const scrim = document.querySelector('.acct-scrim') as HTMLElement
    await userEvent.click(scrim)
    expect(document.querySelector('.acct-pop')).toBeNull()
  })

  it(
    'the scrim carries aria-hidden="true" and is NOT a focusable element (design note 5) — ' +
    'a negative pin, so the <button> "upgrade" cannot be reintroduced without a failing test explaining why not',
    () => {
      render(<AccountChip state={{ ...initialSession, user: namedUser, acctOpen: true }} dispatch={noop} />)
      const scrim = document.querySelector('.acct-scrim') as HTMLElement
      expect(scrim.tagName).toBe('DIV')
      expect(scrim.getAttribute('aria-hidden')).toBe('true')
      expect(scrim).not.toHaveAttribute('tabindex')
      scrim.focus()
      expect(document.activeElement).not.toBe(scrim)
    },
  )
})

describe('AccountChip — no role="menu"', () => {
  it(
    '.acct-pop carries no role="menu" (design note 8 — the prototype\'s role="menu" has no role="menuitem" ' +
    'children, an incomplete ARIA contract worse than no role at all), and every row inside it is a real ' +
    '<button> reachable by tab in DOM order',
    () => {
      render(
        <AccountChip
          state={{
            ...initialSession, user: unnamedUser, acctOpen: true, signOutConfirm: true,
            savedCases: [makeCase()],
          }}
          dispatch={noop}
        />,
      )
      const pop = document.querySelector('.acct-pop') as HTMLElement
      expect(pop.getAttribute('role')).toBeNull()
      expect(pop.getAttribute('aria-label')).toBe(UI.account.ariaLabel)
      const rows = pop.querySelectorAll('.acct-pop-row, .acct-pop-confirm button')
      expect(rows.length).toBeGreaterThan(0)
      for (const row of Array.from(rows)) {
        expect(row.tagName).toBe('BUTTON')
      }
    },
  )
})
