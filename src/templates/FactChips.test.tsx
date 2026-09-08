// RED for Task 13 — FactChips, port of the prototype's `factChips` (design/
// nextmove-v1-prototype.html, 3025-3036): "What we picked up" — a standalone
// component owned by neither InterpConfirmScreen nor UnplaceablePanel (Task
// 14 builds the latter). This file tests FactChips entirely on its own,
// off a direct render, the same way DescribeBlock.test.tsx tests
// DescribeBlock before its own mount sites exist in the router-reachable
// sense. The two INTERACTION_GATED coverage assertions this task also owes
// (`ui:facts.editLabel`/`saveLabel`) live in interactionGated.test.tsx
// instead, per that file's own established split — not duplicated here.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useReducer } from 'react'
import { FactChips } from './FactChips'
import { UI } from '../screens/screenCopy'
import type { Fact, GatedInterpretation } from '../domain/interpret'
import {
  sessionReducer, initialSession, type SessionState, type SessionAction, type ActiveInterpretation,
} from '../session/session'

const noop = () => {}

// Fixtures. `ARN`'s value is deliberately short (7 digits) so it is safe to
// use inside the "no 12-digit run anywhere in the DOM" test below without
// itself tripping the very regex that test is checking.
const FILE_NUMBER: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
  value: 'BN1068334517807', fills: '[File Number / ARN]',
}
const ARN: Fact = {
  kind: 'reference_number', refType: 'arn', label: 'ARN', value: 'AB1234567', fills: null,
}
const UNKNOWN_NUM: Fact = {
  kind: 'reference_number', refType: 'unknown', label: 'A number you mentioned', value: '99887766', fills: null,
}

// Same test-only escape hatch InterpConfirmScreen.test.tsx's own
// `makeInterp` establishes — re-declared here, not imported, matching this
// codebase's "own its own fixtures" convention (this file's own header
// note).
function makeInterp(overrides: Partial<ActiveInterpretation> = {}): ActiveInterpretation {
  return {
    __gated: 'test-only' as unknown as GatedInterpretation['__gated'],
    mappings: [],
    discarded: [],
    facts: [],
    droppedSensitive: false,
    unplaceable: false,
    provenance: 'simulated (local matcher)',
    ctxScreen: 'passport-q1',
    engine: 'passport',
    service: UI.serviceLabel.passport,
    text: 'default fixture text',
    ...overrides,
  }
}

/** A real `useReducer(sessionReducer, ...)` harness — needed for every test
 *  that exercises `SET_FACT_EDIT`/`SET_FACT_EDIT_VAL`/`SAVE_FACT_EDIT`/
 *  `REMOVE_FACT`, since those are real reducer arms operating on
 *  `state.interp.facts`, not a prop this component could fake locally (the
 *  task brief's own instruction: build FactChips to dispatch faithfully to
 *  whatever `facts` it was given, never re-derive the reducer's behaviour).
 *  Renders nothing when `state.interp` is absent — every test here seeds
 *  one via `seed`. */
function Harness({
  seed, dispatchSpy, onState,
}: {
  seed?: Partial<SessionState>
  dispatchSpy?: (a: SessionAction) => void
  onState?: (s: SessionState) => void
}) {
  const [state, realDispatch] = useReducer(sessionReducer, { ...initialSession, ...seed })
  useEffect(() => {
    onState?.(state)
  })
  const dispatch = (a: SessionAction) => {
    dispatchSpy?.(a)
    realDispatch(a)
  }
  if (!state.interp) return null
  return (
    <FactChips
      facts={state.interp.facts}
      droppedSensitive={state.interp.droppedSensitive}
      factEditIdx={state.factEditIdx}
      factEditVal={state.factEditVal}
      dispatch={dispatch}
    />
  )
}

// ---------------------------------------------------------------------------
// Design note 1 — the three render states, prototype's own check order.

describe('the three render states (design note 1, prototype factChips 3026-3028)', () => {
  it('no facts and droppedSensitive:false renders nothing — the container is absent', () => {
    const { container } = render(
      <FactChips facts={[]} droppedSensitive={false} factEditIdx={null} factEditVal="" dispatch={noop} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it(
    'no facts but droppedSensitive:true renders only the Aadhaar refusal, with no "What we picked up" heading',
    () => {
      expect.assertions(2)
      const { container } = render(
        <FactChips facts={[]} droppedSensitive factEditIdx={null} factEditVal="" dispatch={noop} />,
      )
      expect(container.textContent).toContain(UI.facts.aadhaarRefused)
      expect(
        container.textContent,
        'a heading over a refusal claims something was picked up',
      ).not.toContain(UI.facts.pickedUpKey)
    },
  )

  it('facts present renders the heading and one chip per fact, each showing its own label and value', () => {
    render(
      <FactChips facts={[FILE_NUMBER, ARN]} droppedSensitive={false} factEditIdx={null} factEditVal="" dispatch={noop} />,
    )
    expect(screen.getByText(UI.facts.pickedUpKey)).toBeInTheDocument()
    const chips = document.querySelectorAll('.fchip')
    expect(chips).toHaveLength(2)
    expect(chips[0]).toHaveTextContent(FILE_NUMBER.label)
    expect(chips[0]).toHaveTextContent(FILE_NUMBER.value)
    expect(chips[1]).toHaveTextContent(ARN.label)
    expect(chips[1]).toHaveTextContent(ARN.value)
  })
})

// ---------------------------------------------------------------------------
// Design note 4 / spec §7 — distinct accessible names.

describe('accessible names (design note 4, spec §7: "chips carry distinct accessible names")', () => {
  it('two facts sharing a label but not a value produce four buttons whose accessible names each carry both the label and the value', () => {
    expect.assertions(4)
    const dateA: Fact = { kind: 'date', refType: 'date_applied', label: 'Date applied', value: '12 March', fills: '[date]' }
    const dateB: Fact = { kind: 'date', refType: 'date_other', label: 'Date applied', value: '15 March', fills: null }
    render(
      <FactChips facts={[dateA, dateB]} droppedSensitive={false} factEditIdx={null} factEditVal="" dispatch={noop} />,
    )
    // Distinctness follows from these four checks themselves: dateA's pair
    // and dateB's pair differ by VALUE (12 March vs 15 March), and within a
    // chip, Edit vs Remove differ by their own verb prefix — so all four
    // strings below are pairwise distinct by construction, not asserted
    // separately.
    const [editA, removeA, editB, removeB] = document.querySelectorAll('.fchip button')
    expect(editA.getAttribute('aria-label')).toBe(`Edit ${dateA.label} ${dateA.value}`)
    expect(removeA.getAttribute('aria-label')).toBe(`Remove ${dateA.label} ${dateA.value}`)
    expect(editB.getAttribute('aria-label')).toBe(`Edit ${dateB.label} ${dateB.value}`)
    expect(removeB.getAttribute('aria-label')).toBe(`Remove ${dateB.label} ${dateB.value}`)
  })
})

// ---------------------------------------------------------------------------
// Design note 3 — the unknown-number note.

describe('the unknown-number note (design note 3, prototype 3034)', () => {
  it('renders when some fact has refType:"unknown"', () => {
    render(
      <FactChips facts={[FILE_NUMBER, UNKNOWN_NUM]} droppedSensitive={false} factEditIdx={null} factEditVal="" dispatch={noop} />,
    )
    expect(screen.getByText(UI.facts.unknownNumberNote)).toBeInTheDocument()
  })

  it('does not render when every fact is recognised', () => {
    render(
      <FactChips facts={[FILE_NUMBER, ARN]} droppedSensitive={false} factEditIdx={null} factEditVal="" dispatch={noop} />,
    )
    expect(screen.queryByText(UI.facts.unknownNumberNote)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Design note 2 — the Aadhaar refusal, alongside facts this time (state 3's
// tail), and the never-persisted, never-echoed guarantee it carries.

describe('the Aadhaar refusal alongside facts (design note 2, prototype 3035)', () => {
  it('renders when droppedSensitive is true even with facts present, and the rendered DOM contains no 12-digit run anywhere — the actual Aadhaar number is never in state to leak', () => {
    expect.assertions(2)
    const { container } = render(
      <FactChips facts={[ARN]} droppedSensitive factEditIdx={null} factEditVal="" dispatch={noop} />,
    )
    expect(container.textContent).toContain(UI.facts.aadhaarRefused)
    expect(container.textContent).not.toMatch(/\d{12}/)
  })
})

// ---------------------------------------------------------------------------
// Design note 5 — edit mode, driven entirely by factEditIdx/factEditVal
// PROPS, via a real reducer round trip.

describe('edit mode (design note 5, prototype 3031)', () => {
  it('clicking Edit dispatches SET_FACT_EDIT with the fact\'s own index (not always 0)', async () => {
    const user = userEvent.setup()
    const dispatched: SessionAction[] = []
    const interp = makeInterp({ facts: [FILE_NUMBER, ARN] })
    render(<Harness seed={{ interp }} dispatchSpy={a => dispatched.push(a)} />)
    await user.click(screen.getByRole('button', { name: `Edit ${ARN.label} ${ARN.value}` }))
    expect(dispatched).toContainEqual({ type: 'SET_FACT_EDIT', index: 1 })
  })

  it('with factEditIdx set, the chip renders an input carrying the registered aria-label, seeded from the fact\'s current value; typing dispatches SET_FACT_EDIT_VAL; Enter saves and closes the editor', async () => {
    const user = userEvent.setup()
    const interp = makeInterp({ facts: [FILE_NUMBER] })
    render(<Harness seed={{ interp }} />)
    await user.click(screen.getByRole('button', { name: `Edit ${FILE_NUMBER.label} ${FILE_NUMBER.value}` }))
    const input = screen.getByLabelText(
      UI.facts.editLabel.replace('{label}', FILE_NUMBER.label),
    ) as HTMLInputElement
    expect(input.value).toBe(FILE_NUMBER.value)

    await user.clear(input)
    await user.type(input, 'CORRECTED-99')
    expect(input.value).toBe('CORRECTED-99')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      screen.queryByLabelText(UI.facts.editLabel.replace('{label}', FILE_NUMBER.label)),
    ).not.toBeInTheDocument()
    expect(screen.getByText('CORRECTED-99')).toBeInTheDocument()
  })

  it('the save button dispatches the same SAVE_FACT_EDIT as Enter', async () => {
    const user = userEvent.setup()
    const interp = makeInterp({ facts: [FILE_NUMBER] })
    render(<Harness seed={{ interp }} />)
    await user.click(screen.getByRole('button', { name: `Edit ${FILE_NUMBER.label} ${FILE_NUMBER.value}` }))
    const input = screen.getByLabelText(UI.facts.editLabel.replace('{label}', FILE_NUMBER.label))
    await user.clear(input)
    await user.type(input, 'VIA-BUTTON')
    await user.click(
      screen.getByRole('button', { name: UI.facts.saveLabel.replace('{label}', FILE_NUMBER.label) }),
    )
    expect(
      screen.queryByLabelText(UI.facts.editLabel.replace('{label}', FILE_NUMBER.label)),
    ).not.toBeInTheDocument()
    expect(screen.getByText('VIA-BUTTON')).toBeInTheDocument()
  })

  it('a whitespace-only save closes the editor and leaves the value unchanged (the branch a naive port drops)', async () => {
    expect.assertions(2)
    const user = userEvent.setup()
    const interp = makeInterp({ facts: [FILE_NUMBER] })
    render(<Harness seed={{ interp }} />)
    await user.click(screen.getByRole('button', { name: `Edit ${FILE_NUMBER.label} ${FILE_NUMBER.value}` }))
    const input = screen.getByLabelText(UI.facts.editLabel.replace('{label}', FILE_NUMBER.label))
    await user.clear(input)
    await user.type(input, '   ')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      screen.queryByLabelText(UI.facts.editLabel.replace('{label}', FILE_NUMBER.label)),
      'the editor must close even though the whitespace-only value was discarded',
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(FILE_NUMBER.value),
      'a whitespace-only edit must not overwrite the original value',
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Design note 6 — the sharpest one: an edited fact is not re-gated.

describe('an edited fact is not re-gated against the text (design note 6)', () => {
  it('a saved edit marks the fact edited:true, and an edited value that is NOT a substring of the text (or anything else in the fixture) survives and renders', async () => {
    expect.assertions(2)
    const user = userEvent.setup()
    let latestState: SessionState | undefined
    const interp = makeInterp({
      facts: [FILE_NUMBER],
      text: 'Police came to my house but nothing has moved since. I called the office twice.',
    })
    render(<Harness seed={{ interp }} onState={s => { latestState = s }} />)
    await user.click(screen.getByRole('button', { name: `Edit ${FILE_NUMBER.label} ${FILE_NUMBER.value}` }))
    const input = screen.getByLabelText(UI.facts.editLabel.replace('{label}', FILE_NUMBER.label))
    await user.clear(input)
    const EDITED_VALUE = 'ZQ-77-NEVER-QUOTED-ANYWHERE-ELSE'
    await user.type(input, EDITED_VALUE)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(
      screen.getByText(EDITED_VALUE),
      'the verbatim gate constrains the MODEL, not the citizen; assuming every fact is a substring of the text is false the moment one is edited',
    ).toBeInTheDocument()
    expect(latestState?.interp?.facts[0]).toMatchObject({ value: EDITED_VALUE, edited: true })
  })
})

// ---------------------------------------------------------------------------
// Design note 7 — immediate removal, no confirm.

describe('removal (design note 7, prototype 2450)', () => {
  it('clicking Remove dispatches REMOVE_FACT with the index; the fact disappears immediately and no confirm dialog ever appears', async () => {
    const user = userEvent.setup()
    const dispatched: SessionAction[] = []
    const interp = makeInterp({ facts: [FILE_NUMBER, ARN] })
    render(<Harness seed={{ interp }} dispatchSpy={a => dispatched.push(a)} />)
    await user.click(screen.getByRole('button', { name: `Remove ${ARN.label} ${ARN.value}` }))
    expect(dispatched).toContainEqual({ type: 'REMOVE_FACT', index: 1 })
    expect(screen.queryByText(ARN.value)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText(FILE_NUMBER.value), 'the untouched fact survives the removal').toBeInTheDocument()
  })
})
