// RED for Task 13 — SaveNameScreen, the port of `renderSaveName` (design/
// nextmove-v1-prototype.html, 3870-3886, tag v1-design-lock-2): the
// optional, skippable name ask reached via TWO genuinely different paths
// sharing one component shell — mid-save (right after OTP verify,
// `pendingSave` set) and standalone (from the account popover's "Add your
// name" row, Task 15 — `pendingSave` null).
//
// `setDisplayName` (session/auth.ts) is mocked — this screen's own job is
// only to CALL it (auth.test.ts already covers its real Supabase-facing
// behaviour); the rest of this file proves this screen calls it with the
// right value, at the right time, and never lets its result gate anything
// else.
//
// THE CRITICAL DISTINCTION (task-13-brief.md design note 2): a name write
// dispatches `SET_USER_NAME`, NEVER `SIGNED_IN` — `SIGNED_IN` also clears
// `authErr`/`otp`/`authBusy`, which is fine mid-save (an auth flow just
// finished) but a SILENT STATE WIPE on the standalone path (no auth flow in
// progress). Several tests below seed `otp`/`authBusy` to non-default
// values specifically so a wrong `SIGNED_IN` dispatch would be caught by a
// real reducer run — not just "the name changed", which a `SIGNED_IN` bug
// would also produce. `authErr` is NOT used as a discriminator the same
// way: both `BEGIN_SAVE` and `NAVIGATE` already clear it themselves, as
// part of the SAME ordinary nav()-style clear set every navigating action
// in this codebase applies (session.ts) — so it clears regardless of
// whether SET_USER_NAME or SIGNED_IN fires, and asserting it "survives"
// would be asserting something false about entirely unrelated, correct
// behaviour. `otp`/`authBusy` are untouched by BOTH `BEGIN_SAVE` and
// `NAVIGATE`, which is what makes them the genuine proof.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { SaveNameScreen } from './SaveNameScreen'
import { UI } from '../screens/screenCopy'
import { sessionReducer, initialSession, type SessionState } from '../session/session'
import * as authModule from '../session/auth'

vi.mock('../session/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../session/auth')>()
  return { ...actual, setDisplayName: vi.fn() }
})

const setDisplayName = vi.mocked(authModule.setDisplayName)

// Same fixture timestamp the other C7 auth test files share (SaveCaseScreen.
// test.tsx / SaveOtpScreen.test.tsx / session.test.ts).
const NOW = 1_726_000_000_000

beforeEach(() => {
  vi.clearAllMocks()
  setDisplayName.mockResolvedValue({ ok: true })
})

const pendingSave = {
  engineKey: 'passport' as const,
  serviceLabel: UI.serviceLabel.passport,
  returnScreen: 'passport-nextmove' as const,
}

const signedInUser = { method: 'phone' as const, id: '+919876543210', name: null }

/** A small stateful wrapper standing in for the session reducer — the SAME
 *  shape SaveCaseScreen.test.tsx's own `Controlled` uses. Needed by every
 *  test below that must prove a REAL system-level effect (savedCases
 *  actually grew, authErr/otp/authBusy actually survived) rather than just
 *  which action got dispatched. */
function Controlled({ seed }: { seed?: Partial<SessionState> }) {
  const [state, dispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  return (
    <>
      <SaveNameScreen pendingSave={state.pendingSave} pendingName={state.pendingName} now={NOW} dispatch={dispatch} />
      <div data-testid="screen">{state.screen}</div>
      <div data-testid="saved-count">{state.savedCases.length}</div>
      <div data-testid="user-name">{state.user?.name ?? ''}</div>
      <div data-testid="auth-err">{state.authErr ?? ''}</div>
      <div data-testid="otp">{state.otp}</div>
      <div data-testid="auth-busy">{String(state.authBusy)}</div>
    </>
  )
}

describe('SaveNameScreen (port of renderSaveName, prototype 3870-3886) — branch strings', () => {
  it('mid-save (pendingSave set) renders the mid-save crumb tail, lede clause and button pair', () => {
    render(<SaveNameScreen pendingSave={pendingSave} pendingName="" now={NOW} dispatch={vi.fn()} />)
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveCase.crumb)
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveName.crumbTailMidSave)
    expect(document.querySelector('.lede')).toHaveTextContent(UI.saveName.ledeStem)
    expect(document.querySelector('.lede')).toHaveTextContent(UI.saveName.ledeClauseMidSave)
    expect(screen.getByRole('button', { name: new RegExp(UI.saveName.saveMidSave) })).toBeInTheDocument()
    expect(screen.getByText(UI.saveName.switchMidSave)).toBeInTheDocument()
    // Discriminating: the OTHER branch's strings must not also be present.
    expect(document.querySelector('.crumbs')).not.toHaveTextContent(UI.saveName.crumbStandalone)
    expect(screen.queryByText(UI.saveName.saveStandalone)).toBeNull()
    expect(screen.queryByText(UI.saveName.switchStandalone)).toBeNull()
  })

  it('standalone (pendingSave null) renders the standalone crumb, lede clause and button pair', () => {
    render(<SaveNameScreen pendingSave={null} pendingName="" now={NOW} dispatch={vi.fn()} />)
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveName.crumbStandalone)
    expect(document.querySelector('.crumbs')).not.toHaveTextContent(UI.saveCase.crumb)
    expect(document.querySelector('.lede')).toHaveTextContent(UI.saveName.ledeStem)
    expect(document.querySelector('.lede')).toHaveTextContent(UI.saveName.ledeClauseStandalone)
    expect(screen.getByRole('button', { name: new RegExp(UI.saveName.saveStandalone) })).toBeInTheDocument()
    expect(screen.getByText(UI.saveName.switchStandalone)).toBeInTheDocument()
    // Discriminating: the OTHER branch's strings must not also be present.
    expect(screen.queryByText(UI.saveName.saveMidSave)).toBeNull()
    expect(screen.queryByText(UI.saveName.switchMidSave)).toBeNull()
  })

  it('the headline and the field label + placeholder are the same on both branches', () => {
    const { rerender } = render(<SaveNameScreen pendingSave={pendingSave} pendingName="" now={NOW} dispatch={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(UI.saveName.headline)
    const input = screen.getByLabelText(UI.saveName.fieldLabel)
    expect(input).toHaveAttribute('placeholder', UI.saveName.placeholder)
    rerender(<SaveNameScreen pendingSave={null} pendingName="" now={NOW} dispatch={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(UI.saveName.headline)
    expect(screen.getByLabelText(UI.saveName.fieldLabel)).toHaveAttribute('placeholder', UI.saveName.placeholder)
  })

  it('a `.narrow` shell, not a Split (matches SaveDoneScreen\'s own single-column shape)', () => {
    render(<SaveNameScreen pendingSave={pendingSave} pendingName="" now={NOW} dispatch={vi.fn()} />)
    expect(document.querySelector('.narrow')).toBeInTheDocument()
    expect(document.querySelector('.split')).toBeNull()
  })

  it('typing in the field dispatches SET_PENDING_NAME with the typed value', () => {
    const dispatch = vi.fn()
    render(<SaveNameScreen pendingSave={pendingSave} pendingName="" now={NOW} dispatch={dispatch} />)
    fireEvent.change(screen.getByLabelText(UI.saveName.fieldLabel), { target: { value: 'Ananya' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_PENDING_NAME', value: 'Ananya' })
  })
})

describe('mid-save: a typed name (design note 2 — SET_USER_NAME, never SIGNED_IN; design note 3 — save first, name second)', () => {
  it(
    "calls setDisplayName with the TRIMMED name, dispatches BEGIN_SAVE (reusing pendingSave's own engineKey/" +
    'serviceLabel/returnScreen, plus a freshly minted id) strictly before SET_USER_NAME, and never dispatches SIGNED_IN',
    async () => {
      const dispatch = vi.fn()
      render(<SaveNameScreen pendingSave={pendingSave} pendingName="  Ananya  " now={NOW} dispatch={dispatch} />)
      await userEvent.click(screen.getByRole('button', { name: new RegExp(UI.saveName.saveMidSave) }))

      expect(setDisplayName).toHaveBeenCalledWith('Ananya')
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: UI.serviceLabel.passport,
          returnScreen: 'passport-nextmove', now: NOW, newId: expect.any(String),
        }),
      )
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_USER_NAME', name: 'Ananya' })
      expect(
        dispatch,
        'design note 2: a name write must dispatch SET_USER_NAME, never SIGNED_IN — SIGNED_IN also clears ' +
        'authErr/otp/authBusy, a silent state wipe outside an auth flow',
      ).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SIGNED_IN' }))

      const beginSaveIdx = dispatch.mock.calls.findIndex(([a]) => a.type === 'BEGIN_SAVE')
      const setNameIdx = dispatch.mock.calls.findIndex(([a]) => a.type === 'SET_USER_NAME')
      expect(beginSaveIdx).toBeGreaterThanOrEqual(0)
      expect(
        setNameIdx,
        'design note 3: save first, name second — BEGIN_SAVE must be dispatched before SET_USER_NAME so a ' +
        'failing name write can never block or delay completing the save',
      ).toBeGreaterThan(beginSaveIdx)
    },
  )

  it(
    'REAL reducer: the save genuinely lands in savedCases, the screen genuinely reaches save-done, the name ' +
    'genuinely lands on user.name, and authErr/otp/authBusy (seeded to non-default values) are genuinely ' +
    'untouched — proving SET_USER_NAME fired, not SIGNED_IN, which would have cleared all three',
    async () => {
      render(
        <Controlled
          seed={{
            pendingSave, user: signedInUser, answers: { q1: 'adverse', q2: 'informal' }, pendingName: 'Ananya',
            authErr: 'a stale error that must survive', otp: '999999', authBusy: true,
          }}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: new RegExp(UI.saveName.saveMidSave) }))
      await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Ananya'))
      expect(screen.getByTestId('screen')).toHaveTextContent('save-done')
      expect(screen.getByTestId('saved-count')).toHaveTextContent('1')
      // `authErr` DOES clear here — but via BEGIN_SAVE's own ordinary
      // nav()-style clear set (session.ts, the SAME clear every navigating
      // action applies), not via SET_USER_NAME. `otp`/`authBusy` are the
      // genuine discriminators below: BEGIN_SAVE and NAVIGATE both leave
      // them alone — ONLY SIGNED_IN's own reducer arm touches either, so
      // their surviving here is what actually proves SET_USER_NAME fired.
      expect(screen.getByTestId('auth-err')).toHaveTextContent('')
      expect(
        screen.getByTestId('otp'),
        'SIGNED_IN would have cleared this to "" — SET_USER_NAME must not (BEGIN_SAVE does not touch it either)',
      ).toHaveTextContent('999999')
      expect(
        screen.getByTestId('auth-busy'),
        'SIGNED_IN would have cleared this to false — SET_USER_NAME must not (BEGIN_SAVE does not touch it either)',
      ).toHaveTextContent('true')
    },
  )
})

describe('mid-save: skipping (RED items 3-4)', () => {
  it('"Skip and save without a name" does not call setDisplayName even when a name was typed, still completes the save, still lands on save-done, and leaves user.name null', async () => {
    render(
      <Controlled
        seed={{ pendingSave, user: signedInUser, answers: { q1: 'adverse', q2: 'informal' }, pendingName: 'Ananya' }}
      />,
    )
    await userEvent.click(screen.getByText(UI.saveName.switchMidSave))
    expect(setDisplayName).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('save-done'))
    expect(screen.getByTestId('saved-count')).toHaveTextContent('1')
    expect(screen.getByTestId('user-name')).toHaveTextContent('')
  })

  it('a whitespace-only typed name and "Save my case" behaves exactly like skip (the .trim() in 2130): no setDisplayName call, save still completes, user.name stays null', async () => {
    render(
      <Controlled
        seed={{ pendingSave, user: signedInUser, answers: { q1: 'adverse', q2: 'informal' }, pendingName: '   ' }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: new RegExp(UI.saveName.saveMidSave) }))
    expect(setDisplayName).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('save-done'))
    expect(screen.getByTestId('saved-count')).toHaveTextContent('1')
    expect(screen.getByTestId('user-name')).toHaveTextContent('')
  })
})

describe('standalone: no case may ever be saved here (RED item 5 — C5\'s OQ3 ruling)', () => {
  it(
    'a typed name calls setDisplayName, dispatches SET_USER_NAME (never SIGNED_IN) and NAVIGATE home — never BEGIN_SAVE',
    async () => {
      const dispatch = vi.fn()
      render(<SaveNameScreen pendingSave={null} pendingName="Ananya" now={NOW} dispatch={dispatch} />)
      await userEvent.click(screen.getByRole('button', { name: new RegExp(UI.saveName.saveStandalone) }))
      expect(setDisplayName).toHaveBeenCalledWith('Ananya')
      expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'home' })
      // Fix Round 1, Finding 1: the standalone branch previously had NO
      // assertion at all covering the name-write dispatch — a mutation to
      // "call setDisplayName but never dispatch SET_USER_NAME afterward"
      // and a mutation to "dispatch SIGNED_IN instead of SET_USER_NAME"
      // both survived the original 15-test suite undetected. The SIGNED_IN
      // mutation is the exact defect design note 2 exists to prevent
      // SPECIFICALLY on this branch — there is no auth flow in progress
      // here, so SIGNED_IN's own clearing of authErr/otp/authBusy would be
      // a silent state wipe, unlike on the mid-save branch where those
      // fields are already clear from the auth flow that just finished.
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_USER_NAME', name: 'Ananya' })
      expect(
        dispatch,
        'design note 2: a name write on the standalone path must dispatch SET_USER_NAME, never SIGNED_IN — ' +
        'SIGNED_IN would silently clear authErr/otp/authBusy with no auth flow in progress to justify it',
      ).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SIGNED_IN' }))
      expect(
        dispatch,
        "a stray save on the standalone path would create a casefile the citizen never asked for — the exact " +
        "harm C5's OQ3 ruling forbids",
      ).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'BEGIN_SAVE' }))
    },
  )

  it(
    'REAL reducer: navigates home, leaves savedCases genuinely empty, AND genuinely writes user.name via ' +
    'SET_USER_NAME — proven by authErr/otp/authBusy (seeded non-default) surviving, which SIGNED_IN would not',
    async () => {
      // Fix Round 1, Finding 1: the mid-save test elsewhere in this file
      // seeds otp/authBusy non-default to discriminate SET_USER_NAME from
      // SIGNED_IN, but that discriminator was ENTIRELY ABSENT from every
      // standalone test — the one branch where the distinction is actually
      // harmful (no auth flow in progress here to justify SIGNED_IN's own
      // clearing of these fields). Seeded here for the same reason.
      render(
        <Controlled
          seed={{
            pendingSave: null, user: signedInUser, savedCases: [], pendingName: 'Ananya',
            otp: '999999', authBusy: true,
          }}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: new RegExp(UI.saveName.saveStandalone) }))
      await waitFor(() => expect(screen.getByTestId('screen')).toHaveTextContent('home'))
      await waitFor(() => expect(screen.getByTestId('user-name')).toHaveTextContent('Ananya'))
      // Seeded EMPTY, deliberately — verified by mutation (a stray
      // BEGIN_SAVE dispatch was introduced here and reverted): completeSave's
      // own one-active-case-per-service rule (cases.ts) matches an existing
      // SAVE slot on `outcome==='still_open' && engineKey===payload.
      // engineKey` ALONE, with no answers comparison — so a decoy
      // pre-existing 'passport' case would let a stray same-engineKey
      // BEGIN_SAVE dispatch merge invisibly into it, leaving the count
      // unchanged for the WRONG reason. Starting from a genuinely empty
      // array has no such blind spot: completeSave can only ever CREATE
      // when nothing existing matches, so any stray BEGIN_SAVE at all must
      // grow this past zero.
      expect(
        screen.getByTestId('saved-count'),
        "a stray save here would create a casefile the citizen never asked for — the exact harm C5's OQ3 ruling forbids",
      ).toHaveTextContent('0')
      expect(
        screen.getByTestId('otp'),
        'SIGNED_IN would have cleared this to "" — SET_USER_NAME must not (and NAVIGATE does not touch it either)',
      ).toHaveTextContent('999999')
      expect(
        screen.getByTestId('auth-busy'),
        'SIGNED_IN would have cleared this to false — SET_USER_NAME must not (and NAVIGATE does not touch it either)',
      ).toHaveTextContent('true')
    },
  )

  it('"Never mind" navigates home and calls nothing (no setDisplayName, no BEGIN_SAVE, no SET_USER_NAME)', async () => {
    const dispatch = vi.fn()
    render(<SaveNameScreen pendingSave={null} pendingName="Ananya" now={NOW} dispatch={dispatch} />)
    await userEvent.click(screen.getByText(UI.saveName.switchStandalone))
    expect(setDisplayName).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', screen: 'home' })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'BEGIN_SAVE' }))
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_USER_NAME' }))
  })
})

describe('design note 3: a failing setDisplayName can never cost the citizen their case', () => {
  it('mid-save: a failing setDisplayName still completes the save — the save is dispatched before the name write is even attempted', async () => {
    setDisplayName.mockResolvedValueOnce({ ok: false, error: 'network down' })
    render(
      <Controlled
        seed={{ pendingSave, user: signedInUser, answers: { q1: 'adverse', q2: 'informal' }, pendingName: 'Ananya' }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: new RegExp(UI.saveName.saveMidSave) }))
    await waitFor(() =>
      expect(
        screen.getByTestId('screen'),
        'design note 3: save first, name second — a failing setDisplayName must never block reaching save-done',
      ).toHaveTextContent('save-done'),
    )
    expect(screen.getByTestId('saved-count')).toHaveTextContent('1')
  })
})

describe('Enter submits (design note 5, prototype 3880)', () => {
  it('Enter in the name field submits with the typed name, same as clicking the primary button', async () => {
    const dispatch = vi.fn()
    render(<SaveNameScreen pendingSave={pendingSave} pendingName="Ananya" now={NOW} dispatch={dispatch} />)
    fireEvent.keyDown(screen.getByLabelText(UI.saveName.fieldLabel), { key: 'Enter' })
    await waitFor(() => expect(setDisplayName).toHaveBeenCalledWith('Ananya'))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'BEGIN_SAVE' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_USER_NAME', name: 'Ananya' })
  })

  it('a non-Enter key in the field does not submit', () => {
    const dispatch = vi.fn()
    render(<SaveNameScreen pendingSave={pendingSave} pendingName="Ananya" now={NOW} dispatch={dispatch} />)
    fireEvent.keyDown(screen.getByLabelText(UI.saveName.fieldLabel), { key: 'a' })
    expect(dispatch).not.toHaveBeenCalled()
    expect(setDisplayName).not.toHaveBeenCalled()
  })
})
