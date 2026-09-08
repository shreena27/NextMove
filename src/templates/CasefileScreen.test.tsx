// RED for Task 9 — CasefileScreen, the port of `renderCheckin` (design/
// nextmove-v1-prototype.html, 2830-2970, tag v1-design-lock-2). Real
// diagnoses (via `diagnose`) and real cases (via `caseSnapshot`) throughout,
// per the task brief.
//
// THE RULE FOR EVERY ABSENCE ASSERTION IN THIS FILE: an absence assertion
// passes VACUOUSLY if its query string is subtly wrong. So every absence
// assertion below uses a query string from the shared `SEL` object, and
// every one of `SEL`'s entries also has a POSITIVE control somewhere in
// this same file (the open variant asserts each is present) — a typo'd
// selector then fails the positive control loudly instead of silently
// making the absence assertion meaningless.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CasefileScreen } from './CasefileScreen'
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { caseSnapshot, type Casefile } from '../domain/casefile'
import { checkinOptionsFor, CLOSED_TITLE, DELIVERABLE_Q } from '../domain/checkinOptions'
import { PREP } from '../playbooks/prep'
import { UI } from '../screens/screenCopy'
import { fmtDay, fmtRemind } from '../ui/dates'
import type { CiSnapshot } from '../session/cases'

const SEL = {
  updateMod: '.update-mod',
  optionRow: '.arow',
  remindRow: '.remind-row',
}

const NOW = 1_760_000_000_000

// Real diagnoses, transcribed conditions (see each playbook's own rule).
const state1Answers = { q1: 'no_contact', q2: 'no_followup' }               // state-1: WAIT, no prep, no ladder
const state1D = diagnose(passportEngine, state1Answers)
const state5aAnswers = { q1: 'adverse', q2: 'informal' }                    // state-5a: FOLLOW_UP, has prep + ladder
const state5aD = diagnose(passportEngine, state5aAnswers)
const dpgRAnswers = { dpgOutcome: 'resolved' }                              // state-dpg-r: one 'deadend' option
const dpgRD = diagnose(passportEngine, dpgRAnswers)
const voterAnswers = { voterQ1: 'no_word' }                                 // v-1: 'event' + 'valence' options
const voterD = diagnose(voterEngine, voterAnswers)
const sirAnswers = { sirState: 'delhi', sirQ1: 'notice' }                   // s-notice: has prep, no ladder (SIR)
const sirD = diagnose(sirEngine, sirAnswers)

expect(state1D.howLong).toBeTruthy()      // guards the reassure-panel fixture
expect(state1D.expectNext).toBeTruthy()
expect(PREP['state-5a']).toBeDefined()    // guards the prep-plan fixture
expect(PREP['state-1']).toBeUndefined()   // guards the no-prep fixture
expect(PREP['v-1']).toBeUndefined()

function makeCase(
  engineKey: 'passport' | 'voter' | 'sir',
  d: ReturnType<typeof diagnose>,
  answers: Record<string, string>,
  overrides: Partial<Casefile> = {},
): Casefile {
  const serviceLabel =
    engineKey === 'passport' ? UI.serviceLabel.passport
      : engineKey === 'voter' ? UI.serviceLabel.voterServices
        : UI.serviceLabel.sir
  const returnScreen = `${engineKey}-nextmove`
  const snap = caseSnapshot(engineKey, serviceLabel, returnScreen, d, answers, {}, NOW)
  return { ...snap, id: 'c1', outcome: 'still_open', lastCheck: null, remindAt: null, log: [], ...overrides }
}

const noop = vi.fn()

/** Every CasefileScreenProps not under test in a given `it` — the "quiet"
 *  defaults (no active panel, no reminder set, nothing armed). */
function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    prepChecks: {},
    savedCases: [] as Casefile[],
    now: NOW,
    ciPending: null,
    ciPendingIdx: null,
    ciStage: null,
    ciReassure: false,
    ciSnapshot: null,
    ciConsecutive: false,
    phaseDrift: false,
    reminderCopied: false,
    logOpen: {},
    removeConfirm: null,
    dispatch: noop,
    freshDegraded: false,
    freshChangedOn: null,
    ...overrides,
  }
}

describe('open variant — the case is still_open', () => {
  it('renders the headline, the stamp, the meta line, the update module, the option list, the remind row and both case links', () => {
    const c = makeCase('passport', state5aD, state5aAnswers)
    render(<CasefileScreen case={c} answers={c.answers} d={state5aD} {...baseProps()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(state5aD.label)
    expect(document.querySelector('.stamp-row .stamp')).toBeInTheDocument()
    expect(document.querySelector('.case-meta-line')).toHaveTextContent(
      UI.casefile.metaSaved.replace('{day}', fmtDay(c.savedAt)),
    )
    expect(document.querySelector(SEL.updateMod)).toBeInTheDocument()
    expect(document.querySelectorAll(SEL.optionRow).length).toBeGreaterThan(0)
    expect(document.querySelector(SEL.remindRow)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.casefile.diagnosisLink })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.casefile.prepareLink })).toBeInTheDocument()
  })

  it('shows "Started" for an unsaved case and "Saved" for a saved one, in the meta line', () => {
    const unsaved = makeCase('passport', state1D, state1Answers, { unsaved: true })
    const { unmount } = render(<CasefileScreen case={unsaved} answers={unsaved.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-meta-line')).toHaveTextContent(
      UI.casefile.metaStarted.replace('{day}', fmtDay(unsaved.savedAt)),
    )
    unmount()

    const saved = makeCase('passport', state1D, state1Answers)
    render(<CasefileScreen case={saved} answers={saved.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-meta-line')).toHaveTextContent(
      UI.casefile.metaSaved.replace('{day}', fmtDay(saved.savedAt)),
    )
  })

  it('the meta line appends the check-back suffix only when remindAt is set', () => {
    const c = makeCase('passport', state1D, state1Answers, { remindAt: '2026-10-12' })
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-meta-line')).toHaveTextContent(
      UI.casefile.metaCheckBackSuffix.replace('{date}', fmtRemind('2026-10-12')),
    )
  })

  it('"Continue preparing" is absent for a WAIT state with no prep plan, present for state-5a', () => {
    const noPrep = makeCase('passport', state1D, state1Answers)
    const { unmount } = render(<CasefileScreen case={noPrep} answers={noPrep.answers} d={state1D} {...baseProps()} />)
    expect(screen.queryByRole('button', { name: UI.casefile.prepareLink })).toBeNull()
    expect(screen.getByRole('button', { name: UI.casefile.diagnosisLink })).toBeInTheDocument() // still there
    unmount()

    const withPrep = makeCase('passport', state5aD, state5aAnswers)
    render(<CasefileScreen case={withPrep} answers={withPrep.answers} d={state5aD} {...baseProps()} />)
    expect(screen.getByRole('button', { name: UI.casefile.prepareLink })).toBeInTheDocument()
  })

  it('the case trail renders for passport and not for voter/SIR', () => {
    const passport = makeCase('passport', state1D, state1Answers)
    const { unmount } = render(<CasefileScreen case={passport} answers={passport.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-trail')).toBeInTheDocument()
    unmount()

    const voter = makeCase('voter', voterD, voterAnswers)
    const { unmount: unmountVoter } = render(<CasefileScreen case={voter} answers={voter.answers} d={voterD} {...baseProps()} />)
    expect(document.querySelector('.case-trail')).toBeNull()
    unmountVoter()

    const sir = makeCase('sir', sirD, sirAnswers)
    render(<CasefileScreen case={sir} answers={sir.answers} d={sirD} {...baseProps()} />)
    expect(document.querySelector('.case-trail')).toBeNull()
  })

  it('CaseProgress renders only with a prep plan; EscalationLadder renders only when ladderFor is non-null', () => {
    const noPlanNoLadder = makeCase('passport', state1D, state1Answers)
    const { unmount } = render(<CasefileScreen case={noPlanNoLadder} answers={noPlanNoLadder.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-progress')).toBeNull()
    expect(document.querySelector('.ladder')).toBeNull()
    unmount()

    const planAndLadder = makeCase('passport', state5aD, state5aAnswers)
    render(<CasefileScreen case={planAndLadder} answers={planAndLadder.answers} d={state5aD} {...baseProps()} />)
    expect(document.querySelector('.case-progress')).toBeInTheDocument()
    expect(document.querySelector('.ladder')).toBeInTheDocument()
  })

  it('choosing an option calls the handler with the right index', () => {
    const c = makeCase('passport', state1D, state1Answers)
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch })} />)
    const rows = document.querySelectorAll(SEL.optionRow)
    expect(rows.length).toBeGreaterThan(1)
    ;(rows[1] as HTMLButtonElement).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_CHOOSE', index: 1, now: NOW })
  })

  it('the picked row gets aria-current and the butter check style; the unpicked deliverable row carries the ring style', () => {
    const c = makeCase('passport', state1D, state1Answers)
    const list = checkinOptionsFor(state1D, {}, 'passport')
    const deliverableIdx = list.findIndex(o => o.k === 'deliverable')
    expect(deliverableIdx).toBeGreaterThan(-1) // guards the fixture

    render(
      <CasefileScreen
        case={c} answers={c.answers} d={state1D}
        {...baseProps({ ciPending: list[deliverableIdx], ciPendingIdx: deliverableIdx })}
      />,
    )
    const rows = document.querySelectorAll(SEL.optionRow)
    const pickedRow = rows[deliverableIdx]
    expect(pickedRow).toHaveAttribute('aria-current', 'true')
    const pickedCheck = pickedRow.querySelector('.arow-check') as HTMLElement
    expect(pickedCheck.style.background).toContain('butter')
    expect(pickedCheck.style.borderColor).toContain('ink')
    expect(pickedRow.querySelector('.arow-label')).toHaveStyle({ fontWeight: '600' })

    // No row is "not a radio" — never role=radio/aria-checked.
    for (const r of rows) {
      expect(r).not.toHaveAttribute('role', 'radio')
      expect(r).not.toHaveAttribute('aria-checked')
    }
  })

  it('an unpicked deliverable row carries the butter-deep RING style (not a fill)', () => {
    const c = makeCase('passport', state1D, state1Answers)
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps()} />)
    const list = checkinOptionsFor(state1D, {}, 'passport')
    const deliverableIdx = list.findIndex(o => o.k === 'deliverable')
    const row = document.querySelectorAll(SEL.optionRow)[deliverableIdx]
    expect(row).not.toHaveAttribute('aria-current')
    const check = row.querySelector('.arow-check') as HTMLElement
    expect(check.style.border).toContain('butter-deep')
    expect(check.style.background).toBe('') // ring, never a fill
  })

  it('the confirm panel renders its exact strings; the diagnosis clause appears for action/event, not for deadend', () => {
    const actionCase = makeCase('passport', state5aD, state5aAnswers)
    const actionList = checkinOptionsFor(state5aD, {}, 'passport')
    const actionOpt = actionList.find(o => o.k === 'action')!
    const actionIdx = actionList.indexOf(actionOpt)
    const { unmount } = render(
      <CasefileScreen
        case={actionCase} answers={actionCase.answers} d={state5aD}
        {...baseProps({ ciStage: 'confirm', ciPending: actionOpt, ciPendingIdx: actionIdx })}
      />,
    )
    // pickedEcho names what was picked — scoped to the panel itself, since
    // the option row underneath (still in the DOM) carries the same label.
    expect(document.querySelector('.ci-panel')).toHaveTextContent(`${UI.casefile.pickedEcho} ${actionOpt.label}`)
    expect(document.querySelector('.ci-panel')).toHaveTextContent(UI.casefile.confirmQ)
    expect(document.querySelector('.ci-panel')).toHaveTextContent(UI.casefile.confirmBody)
    expect(document.querySelector('.ci-panel')).toHaveTextContent(UI.casefile.confirmDiagnosisClause.trim())
    expect(screen.getByRole('button', { name: UI.casefile.confirmYes })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.casefile.cancel })).toBeInTheDocument()
    unmount()

    const deadendCase = makeCase('passport', dpgRD, dpgRAnswers)
    const deadendList = checkinOptionsFor(dpgRD, {}, 'passport')
    const deadendOpt = deadendList.find(o => o.k === 'deadend')!
    expect(deadendOpt).toBeDefined() // guards the fixture
    const deadendIdx = deadendList.indexOf(deadendOpt)
    render(
      <CasefileScreen
        case={deadendCase} answers={deadendCase.answers} d={dpgRD}
        {...baseProps({ ciStage: 'confirm', ciPending: deadendOpt, ciPendingIdx: deadendIdx })}
      />,
    )
    expect(document.querySelector('.ci-panel')).toHaveTextContent(UI.casefile.confirmQ)
    expect(document.querySelector('.ci-panel')).not.toHaveTextContent(UI.casefile.confirmDiagnosisClause.trim())
  })

  it('the confirm panel fires CI_CONFIRM / CI_CANCEL', () => {
    const c = makeCase('passport', state5aD, state5aAnswers)
    const list = checkinOptionsFor(state5aD, {}, 'passport')
    const opt = list.find(o => o.k === 'action')!
    const dispatch = vi.fn()
    render(
      <CasefileScreen
        case={c} answers={c.answers} d={state5aD}
        {...baseProps({ dispatch, ciStage: 'confirm', ciPending: opt, ciPendingIdx: list.indexOf(opt) })}
      />,
    )
    screen.getByRole('button', { name: UI.casefile.confirmYes }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_CONFIRM', now: NOW })
    dispatch.mockClear()
    screen.getByRole('button', { name: UI.casefile.cancel }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_CANCEL' })
  })

  it('the valence panel renders its exact strings and fires CI_VALENCE / CI_CANCEL', () => {
    const c = makeCase('voter', voterD, voterAnswers)
    const list = checkinOptionsFor(voterD, {}, 'voter')
    const opt = list.find(o => o.k === 'valence')!
    expect(opt).toBeDefined() // guards the fixture
    const dispatch = vi.fn()
    render(
      <CasefileScreen
        case={c} answers={c.answers} d={voterD}
        {...baseProps({ dispatch, ciStage: 'valence', ciPending: opt, ciPendingIdx: list.indexOf(opt) })}
      />,
    )
    expect(document.querySelector('.ci-panel')).toHaveTextContent(UI.casefile.valenceQ)
    screen.getByRole('button', { name: UI.casefile.favour }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_VALENCE', accepted: true, now: NOW })
    screen.getByRole('button', { name: UI.casefile.against }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_VALENCE', accepted: false, now: NOW })
    screen.getByRole('button', { name: UI.casefile.cancel }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_CANCEL' })
  })

  it('the closureq panel renders the per-service DELIVERABLE_Q question, has NO Cancel, and fires CI_CLOSURE', () => {
    const c = makeCase('passport', state1D, state1Answers)
    const list = checkinOptionsFor(state1D, {}, 'passport')
    const opt = list.find(o => o.k === 'deliverable')!
    const dispatch = vi.fn()
    render(
      <CasefileScreen
        case={c} answers={c.answers} d={state1D}
        {...baseProps({ dispatch, ciStage: 'closureq', ciPending: opt, ciPendingIdx: list.indexOf(opt) })}
      />,
    )
    expect(document.querySelector('.ci-panel')).toHaveTextContent(DELIVERABLE_Q.passport)
    expect(screen.getByRole('button', { name: UI.casefile.closureYes })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.casefile.closureNotYet })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.casefile.cancel })).toBeNull() // no Cancel on closureq
    screen.getByRole('button', { name: UI.casefile.closureYes }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_CLOSURE', gotIt: true, now: NOW })
    screen.getByRole('button', { name: UI.casefile.closureNotYet }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_CLOSURE', gotIt: false, now: NOW })
  })

  it("the reassure panel renders d.howLong and d.expectNext byte-identically to the Diagnosis fields", () => {
    const c = makeCase('passport', state1D, state1Answers)
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ ciReassure: true })} />)
    expect(document.querySelector('.ci-panel.reassure')).toHaveTextContent(UI.casefile.reassureLead)
    expect(document.querySelector('.ci-panel.reassure')).toHaveTextContent(state1D.howLong!)
    expect(document.querySelector('.ci-panel.reassure')).toHaveTextContent(state1D.expectNext!)
  })

  it('the anti-compulsion line appears only when ciConsecutive; the Undo button only when ciSnapshot is non-null', () => {
    const c = makeCase('passport', state1D, state1Answers)
    const { unmount } = render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ ciReassure: true })} />)
    expect(screen.queryByText(UI.casefile.reassureConsecutive)).toBeNull()
    expect(screen.queryByRole('button', { name: UI.casefile.undoButton })).toBeNull()
    unmount()

    const snapshot: CiSnapshot = { answers: state1Answers, prepChecks: {}, casefile: c }
    const dispatch = vi.fn()
    render(
      <CasefileScreen
        case={c} answers={c.answers} d={state1D}
        {...baseProps({ dispatch, ciReassure: true, ciConsecutive: true, ciSnapshot: snapshot })}
      />,
    )
    expect(screen.getByText(UI.casefile.reassureConsecutive)).toBeInTheDocument()
    const undoBtn = screen.getByRole('button', { name: UI.casefile.undoButton })
    undoBtn.click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'CI_UNDO' })
  })

  it('the check-back input is type="date", carries the aria-label, and has NO default value when remindAt is null', () => {
    const c = makeCase('passport', state1D, state1Answers)
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps()} />)
    const input = screen.getByLabelText(UI.casefile.checkBackAria) as HTMLInputElement
    expect(input).toHaveAttribute('type', 'date')
    expect(input.value).toBe('')
    expect(input).not.toHaveAttribute('placeholder')
    expect(input).not.toHaveAttribute('min')
  })

  it('changing the check-back date fires SET_REMIND', () => {
    const c = makeCase('passport', state1D, state1Answers)
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch })} />)
    const input = screen.getByLabelText(UI.casefile.checkBackAria) as HTMLInputElement
    input.dispatchEvent(new Event('input', { bubbles: true })) // no-op guard for jsdom quirks
    // eslint-disable-next-line testing-library/no-node-access -- fireEvent import kept minimal
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setValue.call(input, '2026-11-01')
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_REMIND', value: '2026-11-01' })
  })

  it('the copyable reminder line and Copy button appear only when remindAt is set', () => {
    const noRemind = makeCase('passport', state1D, state1Answers)
    const { unmount } = render(<CasefileScreen case={noRemind} answers={noRemind.answers} d={state1D} {...baseProps()} />)
    expect(screen.queryByRole('button', { name: UI.casefile.copyLabel })).toBeNull()
    unmount()

    const withRemind = makeCase('passport', state1D, state1Answers, { remindAt: '2026-10-12' })
    render(<CasefileScreen case={withRemind} answers={withRemind.answers} d={state1D} {...baseProps()} />)
    expect(screen.getByText(UI.casefile.reminderText.replace('{date}', fmtRemind('2026-10-12')))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: UI.casefile.copyLabel })).toBeInTheDocument()
  })

  it('shows "Copied" instead of "Copy" once reminderCopied is true', () => {
    const c = makeCase('passport', state1D, state1Answers, { remindAt: '2026-10-12' })
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ reminderCopied: true })} />)
    expect(screen.getByRole('button', { name: UI.casefile.copiedLabel })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.casefile.copyLabel })).toBeNull()
  })

  it('clicking Copy does not throw in jsdom, where neither navigator.clipboard nor document.execCommand exists', () => {
    // jsdom ships NEITHER a navigator.clipboard NOR a working
    // document.execCommand (it throws "is not a function") — so the
    // fallback's own try/catch around execCommand (mirroring the
    // prototype's own empty catch, 3728-3730) silently swallows it. The
    // real, honest guarantee this environment can pin is "does not throw";
    // the happy-path "fires the copied handler" is covered separately below
    // with a mocked clipboard, the same way PrepareScreen.test.tsx splits
    // its own copy-button coverage across a working mock and a rejecting one.
    const c = makeCase('passport', state1D, state1Answers, { remindAt: '2026-10-12' })
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps()} />)
    expect(() => screen.getByRole('button', { name: UI.casefile.copyLabel }).click()).not.toThrow()
  })

  it('clicking Copy fires the copied handler once the clipboard write resolves', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    })
    try {
      const c = makeCase('passport', state1D, state1Answers, { remindAt: '2026-10-12' })
      const dispatch = vi.fn()
      render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch })} />)
      screen.getByRole('button', { name: UI.casefile.copyLabel }).click()
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        UI.casefile.reminderText.replace('{date}', fmtRemind('2026-10-12')),
      )
      await Promise.resolve() // flush the resolved promise's .then(flash, ...)
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_REMINDER_COPIED', value: true })
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  })

  it('a working (unsaved) case renders the "lives only in this tab" note and a save control; a saved case renders neither, and renders the remove control', () => {
    const working = makeCase('passport', state1D, state1Answers, { unsaved: true })
    const { unmount } = render(<CasefileScreen case={working} answers={working.answers} d={state1D} {...baseProps()} />)
    expect(screen.getByText(UI.casefile.livesOnlyNote)).toBeInTheDocument()
    expect(document.querySelector('.btn-ghost, .saved-note')).toBeInTheDocument() // SaveControl's own two branches
    expect(document.querySelector('.case-remove')).toBeNull()
    unmount()

    const saved = makeCase('passport', state1D, state1Answers)
    render(<CasefileScreen case={saved} answers={saved.answers} d={state1D} {...baseProps()} />)
    expect(screen.queryByText(UI.casefile.livesOnlyNote)).toBeNull()
    expect(screen.queryByText(UI.saveControl.save)).toBeNull()
    expect(screen.queryByText(UI.saveControl.saveWithSteps)).toBeNull()
    expect(document.querySelector('.case-remove')).toBeInTheDocument()
  })

  it('the working-case tail passes a LITERAL stepsDone=0 to SaveControl, not the real ticked count', () => {
    // PREP['state-5a'] has real steps; feed prepChecks that would tick some
    // of them and confirm the button still reads the no-steps label.
    const working = makeCase('passport', state5aD, state5aAnswers, { unsaved: true })
    render(<CasefileScreen case={working} answers={working.answers} d={state5aD} {...baseProps({ prepChecks: { 0: true } })} />)
    expect(screen.getByRole('button', { name: UI.saveControl.save })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: UI.saveControl.saveWithSteps })).toBeNull()
  })

  it('the working-case tail\'s Save button fires BEGIN_SAVE, with a freshly minted UUID newId (D4)', () => {
    const working = makeCase('passport', state1D, state1Answers, { unsaved: true })
    const dispatch = vi.fn()
    render(<CasefileScreen case={working} answers={working.answers} d={state1D} {...baseProps({ dispatch })} />)
    screen.getByRole('button', { name: UI.saveControl.save }).click()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'BEGIN_SAVE', engineKey: 'passport', serviceLabel: working.serviceLabel,
      returnScreen: working.returnScreen, now: NOW,
      newId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    })
  })

  it("the remove control's non-confirm state renders one button; clicking it arms SET_REMOVE_CONFIRM", () => {
    const c = makeCase('passport', state1D, state1Answers)
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch })} />)
    screen.getByRole('button', { name: UI.casefile.removeButton }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_REMOVE_CONFIRM', id: 'c1' })
  })

  it("the remove control's confirm state renders both buttons; Yes fires REMOVE_SAVED", () => {
    const c = makeCase('passport', state1D, state1Answers)
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch, removeConfirm: 'c1' })} />)
    expect(document.querySelector('.restart-confirm')).toHaveTextContent(UI.casefile.removePrompt)
    screen.getByRole('button', { name: UI.casefile.removeYes }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_SAVED', id: 'c1' })
    dispatch.mockClear()
    screen.getByRole('button', { name: UI.casefile.cancel }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_REMOVE_CONFIRM', id: null })
  })

  it('"Journey · 1 entry" vs "Journey · 3 entries"', () => {
    const one = makeCase('passport', state1D, state1Answers, {
      log: [{ t: NOW, kind: 'diagnosed', text: 'x' }],
    })
    const { unmount } = render(<CasefileScreen case={one} answers={one.answers} d={state1D} {...baseProps()} />)
    expect(screen.getByText(UI.casefile.journeyOne.replace('{n}', '1'))).toBeInTheDocument()
    unmount()

    const three = makeCase('passport', state1D, state1Answers, {
      log: [
        { t: NOW, kind: 'diagnosed', text: 'a' },
        { t: NOW + 1, kind: 'reported', text: 'b' },
        { t: NOW + 2, kind: 'checked', text: 'c' },
      ],
    })
    render(<CasefileScreen case={three} answers={three.answers} d={state1D} {...baseProps()} />)
    expect(screen.getByText(UI.casefile.journeyMany.replace('{n}', '3'))).toBeInTheDocument()
  })
})

describe('Task 13: SIR phase drift — the interstitial replaces the whole update-mod', () => {
  it('renders the interstitial\'s exact strings, and renders NO option rows and NO remind row — "before any options are offered"', () => {
    const c = makeCase('sir', sirD, sirAnswers)
    render(<CasefileScreen case={c} answers={c.answers} d={sirD} {...baseProps({ phaseDrift: true })} />)
    expect(document.querySelector(SEL.updateMod)).toHaveTextContent(UI.casefile.phaseDriftKicker)
    expect(document.querySelector(SEL.updateMod)).toHaveTextContent(UI.casefile.phaseDriftTitle)
    expect(document.querySelector(SEL.updateMod)).toHaveTextContent(UI.casefile.phaseDriftBody)
    expect(screen.getByRole('button', { name: new RegExp(UI.casefile.phaseDriftCta) })).toBeInTheDocument()
    // Absences, using the SAME selectors the open-variant tests above
    // assert PRESENT (this file's own header rule).
    expect(document.querySelectorAll(SEL.optionRow).length).toBe(0)
    expect(document.querySelector(SEL.remindRow)).toBeNull()
    // The ordinary "Add an update" module is gone too — REPLACED, not
    // layered alongside.
    expect(screen.queryByText(UI.casefile.whatsHappenedTitle)).toBeNull()
  })

  it('the ordinary update module renders instead when phaseDrift is false', () => {
    const c = makeCase('sir', sirD, sirAnswers)
    render(<CasefileScreen case={c} answers={c.answers} d={sirD} {...baseProps({ phaseDrift: false })} />)
    expect(screen.queryByText(UI.casefile.phaseDriftTitle)).toBeNull()
    expect(document.querySelector(SEL.updateMod)).toHaveTextContent(UI.casefile.whatsHappenedTitle)
    expect(document.querySelectorAll(SEL.optionRow).length).toBeGreaterThan(0)
  })

  it('the interstitial\'s CTA dispatches PHASE_DRIFT_RECHECK', () => {
    const c = makeCase('sir', sirD, sirAnswers)
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={sirD} {...baseProps({ phaseDrift: true, dispatch })} />)
    screen.getByRole('button', { name: new RegExp(UI.casefile.phaseDriftCta) }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'PHASE_DRIFT_RECHECK' })
  })

  it('case-links and the save/remove tail are unaffected by phaseDrift', () => {
    const c = makeCase('sir', sirD, sirAnswers)
    render(<CasefileScreen case={c} answers={c.answers} d={sirD} {...baseProps({ phaseDrift: true })} />)
    expect(screen.getByRole('button', { name: UI.casefile.diagnosisLink })).toBeInTheDocument()
    expect(document.querySelector('.case-remove')).toBeInTheDocument()
  })
})

describe('closed variant — the case is not still_open', () => {
  it('renders the two headline branches, the closed half of the meta line, the journey log, "This came back; reopen it" and the remove control', () => {
    const gotIt = makeCase('passport', state1D, state1Answers, {
      outcome: 'deliverable_received', closedAt: NOW + 1000,
    })
    const { unmount } = render(<CasefileScreen case={gotIt} answers={gotIt.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-h1')).toHaveTextContent(UI.casefile.closedGotItHeadline)
    expect(document.querySelector('.case-meta-line')).toHaveTextContent(
      UI.casefile.metaClosedSuffix.replace('{date}', fmtDay(gotIt.closedAt!)).trim(),
    )
    expect(document.querySelector('.journey')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(UI.casefile.reopen) })).toBeInTheDocument()
    expect(document.querySelector('.case-remove')).toBeInTheDocument()
    unmount()

    const unresolved = makeCase('passport', state1D, state1Answers, {
      outcome: 'closed_unresolved', closedAt: NOW + 1000,
    })
    render(<CasefileScreen case={unresolved} answers={unresolved.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-h1')).toHaveTextContent(UI.casefile.closedUnresolvedHeadline)
  })

  it('a superseded case renders its own headline, not the got-it or unresolved one (D3)', () => {
    const c = makeCase('passport', state1D, state1Answers, { outcome: 'superseded', closedAt: NOW + 1000 })
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.case-h1')).toHaveTextContent(UI.casefile.closedSupersededHeadline)
    expect(document.querySelector('.case-h1')).not.toHaveTextContent(UI.casefile.closedGotItHeadline)
    expect(document.querySelector('.case-h1')).not.toHaveTextContent(UI.casefile.closedUnresolvedHeadline)
  })

  it('closed-deliverable_received crumbs use CLOSED_TITLE; closed-unresolved crumbs use stateLabel', () => {
    const gotIt = makeCase('passport', state1D, state1Answers, { outcome: 'deliverable_received' })
    const { unmount } = render(<CasefileScreen case={gotIt} answers={gotIt.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.crumbs')).toHaveTextContent(CLOSED_TITLE.passport)
    expect(document.querySelector('.crumbs')).not.toHaveTextContent(gotIt.stateLabel)
    unmount()

    const unresolved = makeCase('passport', state1D, state1Answers, { outcome: 'closed_unresolved' })
    render(<CasefileScreen case={unresolved} answers={unresolved.answers} d={state1D} {...baseProps()} />)
    expect(document.querySelector('.crumbs')).toHaveTextContent(unresolved.stateLabel)
    expect(document.querySelector('.crumbs')).not.toHaveTextContent(CLOSED_TITLE.passport)
  })

  it('"This came back; reopen it" fires REOPEN_CASE', () => {
    const c = makeCase('passport', state1D, state1Answers, { outcome: 'closed_unresolved' })
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch })} />)
    screen.getByRole('button', { name: new RegExp(UI.casefile.reopen) }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'REOPEN_CASE', id: 'c1', now: NOW })
  })

  it("D5 — renders the reopen control when no OTHER still_open case shares this case's engine", () => {
    const c = makeCase('passport', state1D, state1Answers, { outcome: 'closed_unresolved' })
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ savedCases: [c] })} />)
    expect(screen.getByRole('button', { name: new RegExp(UI.casefile.reopen) })).toBeInTheDocument()
  })

  it(
    'D5 — does NOT render the reopen control when a sibling still_open passport case already exists: ' +
    "reopening would be rejected server-side by casefiles_one_open_per_service (Task 2's partial unique index)",
    () => {
      const c = makeCase('passport', state1D, state1Answers, { outcome: 'closed_unresolved' })
      const sibling = makeCase('passport', state5aD, state5aAnswers, { id: 'c2', outcome: 'still_open' })
      render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ savedCases: [c, sibling] })} />)
      expect(screen.queryByRole('button', { name: new RegExp(UI.casefile.reopen) })).not.toBeInTheDocument()
    },
  )

  it('renders NO check-in machinery: no .update-mod, no .arow option rows, no .remind-row', () => {
    const c = makeCase('passport', state5aD, state5aAnswers, { outcome: 'deliverable_received' })
    render(<CasefileScreen case={c} answers={c.answers} d={state5aD} {...baseProps()} />)
    // Each query string here is the BYTE-IDENTICAL selector the open-variant
    // tests above assert PRESENT, per this file's own header rule.
    expect(document.querySelector(SEL.updateMod)).toBeNull()
    expect(document.querySelectorAll(SEL.optionRow).length).toBe(0)
    expect(document.querySelector(SEL.remindRow)).toBeNull()
  })

  it("'Journey · 1 entry' vs 'Journey · 3 entries' also holds on the closed variant", () => {
    const one = makeCase('passport', state1D, state1Answers, {
      outcome: 'closed_unresolved', log: [{ t: NOW, kind: 'diagnosed', text: 'x' }],
    })
    render(<CasefileScreen case={one} answers={one.answers} d={state1D} {...baseProps()} />)
    expect(screen.getByText(UI.casefile.journeyOne.replace('{n}', '1'))).toBeInTheDocument()
  })

  it("the remove control works identically on the closed variant", () => {
    const c = makeCase('passport', state1D, state1Answers, { outcome: 'closed_unresolved' })
    const dispatch = vi.fn()
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps({ dispatch, removeConfirm: 'c1' })} />)
    expect(document.querySelector('.restart-confirm')).toHaveTextContent(UI.casefile.removePrompt)
    screen.getByRole('button', { name: UI.casefile.removeYes }).click()
    expect(dispatch).toHaveBeenCalledWith({ type: 'REMOVE_SAVED', id: 'c1' })
  })
})

describe('C6: the freshBanner, first child of the right column (prototype 2924)', () => {
  it('renders it when freshDegraded is true, with the changedOn date interpolated', () => {
    const c = makeCase('passport', state1D, state1Answers)
    render(
      <CasefileScreen
        case={c} answers={c.answers} d={state1D}
        {...baseProps({ freshDegraded: true, freshChangedOn: '3 Sep 2026' })}
      />,
    )
    expect(screen.getByText(UI.freshness.reverifiedLead)).toBeInTheDocument()
    expect(document.querySelector('.banner')).toHaveTextContent(
      UI.freshness.reverifiedBody.replace('{date}', '3 Sep 2026'),
    )
    const rightCol = document.querySelector('.split-r')!
    expect(rightCol.children[0]).toHaveClass('banner')
  })

  it('renders BEFORE the phaseDrift interstitial when both are true', () => {
    const c = makeCase('sir', sirD, sirAnswers)
    render(
      <CasefileScreen
        case={c} answers={c.answers} d={sirD}
        {...baseProps({ freshDegraded: true, freshChangedOn: '3 Sep 2026', phaseDrift: true })}
      />,
    )
    const rightCol = document.querySelector('.split-r')!
    const bannerIdx = Array.from(rightCol.children).findIndex(el => el.classList.contains('banner'))
    const updateModIdx = Array.from(rightCol.children).findIndex(el => el.classList.contains('update-mod'))
    expect(bannerIdx).toBeGreaterThanOrEqual(0) // guard
    expect(updateModIdx).toBeGreaterThan(-1) // guard: the phaseDrift interstitial still rendered
    expect(bannerIdx).toBeLessThan(updateModIdx)
  })

  it('omits it when freshDegraded is false (baseProps default — pre-existing behaviour)', () => {
    const c = makeCase('passport', state1D, state1Answers)
    render(<CasefileScreen case={c} answers={c.answers} d={state1D} {...baseProps()} />)
    expect(screen.queryByText(UI.freshness.reverifiedLead)).toBeNull()
  })
})
