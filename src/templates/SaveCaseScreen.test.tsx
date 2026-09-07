// RED for Task 11 — SaveCaseScreen, the port of `renderSaveCase` (design/
// nextmove-v1-prototype.html, 3823-3845, tag v1-design-lock-2): the
// phone/email entry point that starts the sign-in + save flow.
//
// `startPhoneOtp`/`startEmailOtp`/`signInWithGoogle` are mocked (this
// screen's own job is only to CALL them, per design note 1 — auth.ts's own
// `auth.test.ts` already covers their real Supabase-facing behaviour
// exhaustively). `normalisePhone`/`isValidEmail` are left REAL via
// `importOriginal` — this file's short-phone/malformed-email tests are
// exercising the real validation contract this screen delegates to, not a
// re-implementation of it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { SaveCaseScreen } from './SaveCaseScreen'
import { UI } from '../screens/screenCopy'
import { sessionReducer, initialSession, type SessionState } from '../session/session'
import * as authModule from '../session/auth'

vi.mock('../session/auth', async importOriginal => {
  const actual = await importOriginal<typeof import('../session/auth')>()
  return {
    ...actual,
    startPhoneOtp: vi.fn(),
    startEmailOtp: vi.fn(),
    signInWithGoogle: vi.fn(),
  }
})

const startPhoneOtp = vi.mocked(authModule.startPhoneOtp)
const startEmailOtp = vi.mocked(authModule.startEmailOtp)
const signInWithGoogle = vi.mocked(authModule.signInWithGoogle)

beforeEach(() => {
  vi.clearAllMocks()
  startPhoneOtp.mockResolvedValue({ ok: true })
  startEmailOtp.mockResolvedValue({ ok: true })
  signInWithGoogle.mockResolvedValue({ ok: true })
})

/** A small stateful wrapper standing in for the session reducer — the SAME
 *  shape `screenCopy.test.tsx`'s own `DraftEditablePrepareScreen` uses —
 *  needed only by the SET_AUTH_METHOD test below, which must prove the
 *  REAL reducer's own clearing behaviour (session.ts's `SET_AUTH_METHOD`
 *  arm), not a hand-rolled stand-in for it. Every other test below uses a
 *  plain `vi.fn()` dispatch spy, matching `SaveDoneScreen.test.tsx`'s own
 *  convention, since they only need to assert WHICH action was dispatched,
 *  not the reducer's resulting state. */
function Controlled({ seed }: { seed?: Partial<SessionState> }) {
  const [state, dispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  return (
    <SaveCaseScreen
      authMethod={state.authMethod}
      authId={state.authId}
      authErr={state.authErr}
      authBusy={state.authBusy}
      dispatch={dispatch}
    />
  )
}

const sendBtnName = () => screen.getByRole('button', { name: new RegExp(UI.saveCase.send) })
const googleBtnName = () => screen.getByRole('button', { name: new RegExp(UI.saveCase.google) })

describe('SaveCaseScreen (port of renderSaveCase, prototype 3823-3845)', () => {
  it(
    'renders the crumb, headline, lede, the whole trust paragraph, the Google button, the divider, the phone ' +
    'label + placeholder, the send button, the switch link and the note — all from UI.saveCase',
    () => {
      render(<SaveCaseScreen authMethod="phone" authId="" authErr={null} authBusy={false} dispatch={vi.fn()} />)
      expect(document.querySelector('.crumbs')).toHaveTextContent(UI.saveCase.crumb)
      expect(document.querySelector('.crumb-sq')).toHaveClass('sq-butter')
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(UI.saveCase.headline)
      expect(screen.getByText(UI.saveCase.lede)).toBeInTheDocument()
      expect(screen.getByText(UI.saveCase.trust)).toBeInTheDocument()
      expect(googleBtnName()).toBeInTheDocument()
      expect(document.querySelector('.auth-divider')).toHaveTextContent(UI.saveCase.divider)
      const input = screen.getByLabelText(UI.saveCase.fieldLabelMobile)
      expect(input).toHaveAttribute('placeholder', UI.saveCase.placeholderMobile)
      expect(sendBtnName()).toBeInTheDocument()
      expect(screen.getByText(UI.saveCase.switchToEmail)).toBeInTheDocument()
      expect(screen.getByText(UI.saveCase.authNote)).toBeInTheDocument()
    },
  )

  it('toggling to email swaps label, type and placeholder, and clears a previously typed authId', async () => {
    const user = userEvent.setup()
    render(<Controlled seed={{ authId: '9876543210' }} />)
    const phoneInput = screen.getByLabelText(UI.saveCase.fieldLabelMobile) as HTMLInputElement
    expect(phoneInput).toHaveAttribute('type', 'tel')
    expect(phoneInput.value).toBe('9876543210')

    await user.click(screen.getByText(UI.saveCase.switchToEmail))

    const emailInput = screen.getByLabelText(UI.saveCase.fieldLabelEmail) as HTMLInputElement
    expect(emailInput).toHaveAttribute('type', 'email')
    expect(emailInput).toHaveAttribute('placeholder', UI.saveCase.placeholderEmail)
    expect(emailInput.value).toBe('')
    expect(screen.getByText(UI.saveCase.switchToMobile)).toBeInTheDocument()
  })

  it('a short phone number dispatches SET_AUTH_ERR with the exact registered string and does not call startPhoneOtp', async () => {
    expect.assertions(2)
    const dispatch = vi.fn()
    render(<SaveCaseScreen authMethod="phone" authId="98765" authErr={null} authBusy={false} dispatch={dispatch} />)
    await userEvent.click(sendBtnName())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: UI.saveCase.errors.mobile })
    expect(startPhoneOtp).not.toHaveBeenCalled()
  })

  it("a valid phone calls startPhoneOtp with the normalised E.164 value ('+919876543210' from '98765 43210'), then dispatches AUTH_ID_SUBMITTED", async () => {
    const dispatch = vi.fn()
    render(
      <SaveCaseScreen authMethod="phone" authId="98765 43210" authErr={null} authBusy={false} dispatch={dispatch} />,
    )
    await userEvent.click(sendBtnName())
    expect(startPhoneOtp).toHaveBeenCalledWith('+919876543210')
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'AUTH_ID_SUBMITTED', authId: '+919876543210' })
  })

  it('a malformed email dispatches the email error; a valid one calls startEmailOtp', async () => {
    const dispatch = vi.fn()
    const { rerender } = render(
      <SaveCaseScreen authMethod="email" authId="not-an-email" authErr={null} authBusy={false} dispatch={dispatch} />,
    )
    await userEvent.click(sendBtnName())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: UI.saveCase.errors.email })
    expect(startEmailOtp).not.toHaveBeenCalled()

    dispatch.mockClear()
    rerender(
      <SaveCaseScreen
        authMethod="email" authId="citizen@example.com" authErr={null} authBusy={false} dispatch={dispatch}
      />,
    )
    await userEvent.click(sendBtnName())
    expect(startEmailOtp).toHaveBeenCalledWith('citizen@example.com')
    expect(dispatch).toHaveBeenCalledWith({ type: 'AUTH_ID_SUBMITTED', authId: 'citizen@example.com' })
  })

  it('Enter in the field does the same as clicking send', async () => {
    const dispatch = vi.fn()
    render(
      <SaveCaseScreen authMethod="phone" authId="9876543210" authErr={null} authBusy={false} dispatch={dispatch} />,
    )
    const input = screen.getByLabelText(UI.saveCase.fieldLabelMobile)
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(startPhoneOtp).toHaveBeenCalledWith('+919876543210'))
    expect(dispatch).toHaveBeenCalledWith({ type: 'AUTH_ID_SUBMITTED', authId: '+919876543210' })
  })

  it('a non-Enter key in the field does not submit', () => {
    const dispatch = vi.fn()
    render(<SaveCaseScreen authMethod="phone" authId="9876543210" authErr={null} authBusy={false} dispatch={dispatch} />)
    const input = screen.getByLabelText(UI.saveCase.fieldLabelMobile)
    fireEvent.keyDown(input, { key: 'a' })
    expect(startPhoneOtp).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('the Google button calls signInWithGoogle with window.location.origin', async () => {
    const dispatch = vi.fn()
    render(<SaveCaseScreen authMethod="phone" authId="" authErr={null} authBusy={false} dispatch={dispatch} />)
    await userEvent.click(googleBtnName())
    expect(signInWithGoogle).toHaveBeenCalledWith(window.location.origin)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: true })
  })

  it('with authBusy: true, the send and Google buttons are disabled and a click calls nothing', async () => {
    const dispatch = vi.fn()
    render(<SaveCaseScreen authMethod="phone" authId="9876543210" authErr={null} authBusy dispatch={dispatch} />)
    const sendBtn = sendBtnName()
    const googleBtn = googleBtnName()
    expect(sendBtn).toBeDisabled()
    expect(googleBtn).toBeDisabled()
    await userEvent.click(sendBtn)
    await userEvent.click(googleBtn)
    expect(startPhoneOtp).not.toHaveBeenCalled()
    expect(signInWithGoogle).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('a failing startPhoneOtp surfaces the error and clears authBusy — a stuck busy flag is a dead screen', async () => {
    startPhoneOtp.mockResolvedValueOnce({ ok: false, error: 'network down' })
    const dispatch = vi.fn()
    render(
      <SaveCaseScreen authMethod="phone" authId="9876543210" authErr={null} authBusy={false} dispatch={dispatch} />,
    )
    await userEvent.click(sendBtnName())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: 'network down' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: false })
  })

  it('a failing signInWithGoogle surfaces the error and clears authBusy (design note 6 — Google\'s error path ships and is tested now too)', async () => {
    signInWithGoogle.mockResolvedValueOnce({ ok: false, error: 'oauth unavailable' })
    const dispatch = vi.fn()
    render(<SaveCaseScreen authMethod="phone" authId="" authErr={null} authBusy={false} dispatch={dispatch} />)
    await userEvent.click(googleBtnName())
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_ERR', error: 'oauth unavailable' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_AUTH_BUSY', value: false })
  })

  it('the error node has role="alert"; the label is associated with the input (query by label text)', () => {
    render(
      <SaveCaseScreen
        authMethod="phone" authId="" authErr={UI.saveCase.errors.mobile} authBusy={false} dispatch={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(UI.saveCase.errors.mobile)
    expect(screen.getByLabelText(UI.saveCase.fieldLabelMobile)).toBeInTheDocument()
  })
})
