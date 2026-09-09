/** DescribeBlock — port of the prototype's `describeBlock` (design/nextmove-
 *  v1-prototype.html, lines 3003-3024, tag v1-design-lock-2): "Not sure
 *  which fits? Describe it instead." — the entry row + free-text box that
 *  offers an AI-interpreted alternative to tapping through the option list,
 *  mounted at the tail of six question screens' own `.answers` list
 *  (`PassportQ1`/`PassportQ2`, `VoterEntry`/`VoterQ1`/`VoterQ2`, `SirQ1` —
 *  Task 11 design note 3). Deliberately NOT mounted on `PassportRecovery`'s
 *  three screens (scope exclusion 5) — the chain guard below would make it
 *  inert there anyway, but the correct fix is simply never mounting it.
 *
 *  THE ONLY PLACE IN `src/` THAT CALLS `runInterpretation` (I5) — pinned by
 *  this file's own test (a repo-wide grep, mirroring Task 17's) as well as
 *  Task 17's own pin. The call is a user action (a tap on "Read my
 *  situation"), not a lifecycle consequence, so it lives in an async
 *  handler here rather than an `App.tsx` effect — see the task brief's own
 *  design note 7 for the full reasoning (an effect would need a
 *  trigger-flag whose only job is to be watched, and `App.tsx` already
 *  carries six auth effects C7's review found lifecycle bugs in).
 *
 *  DESIGN NOTE 1 (structure). `.describe-entry` -> the `.describe-row`
 *  button (pen icon + label) -> when open, `.describe-box` containing the
 *  textarea, `.describe-meta` (lang note + live char count), the example
 *  chips, the error, and the primary action. `ICONS.pen` (icons.tsx:51) and
 *  `Button` (ui/Button.tsx) are reused, not re-authored.
 *
 *  DESIGN NOTE 2 (the flag gate lives HERE, in one place). Three guards,
 *  three reasons, all tested: `describeItEnabled()` off -> the launch
 *  control; `DESCRIBE_CHAINS[screenId]` missing -> this screen was never
 *  configured for describe-it (this is what makes scope exclusion 5's "not
 *  offered on the pasted-status screen" structural, not a rule someone has
 *  to remember); `state.quotaExhausted` -> a session-scoped withdrawal of a
 *  feature that cannot currently work (spec §2: "the entry row is hidden,
 *  not broken" — I7, inert in practice until Task 18 wires a real 429 onto
 *  it, but built, guarded and pinned now). All six mount sites render this
 *  component UNCONDITIONALLY — every bit of gating lives here, never as a
 *  wrapping `{condition && <DescribeBlock/>}` at a call site.
 *
 *  DESIGN NOTE 3 (`describeText` is reducer state, not `useState`). Spec §1:
 *  "the typed text survives Back, failure, and re-entry." A component's
 *  local state dies on unmount, which is exactly what Back does — the same
 *  discipline C5 applied lifting `prepChecks`/`prepDraft` out of
 *  `PrepareScreen`'s own `useState`. The textarea is fully controlled from
 *  `state.describeText`; typing dispatches `SET_DESCRIBE_TEXT` and nothing
 *  here ever holds its own copy.
 *
 *  DESIGN NOTE 4 (the counter is live and the cap is hard but
 *  non-destructive). `maxLength={DESCRIBE_MAX}` lets the browser enforce
 *  the cap — nothing is silently truncated after the fact — and a live
 *  `${length} / ${DESCRIBE_MAX}` readout tracks it. The counter's container
 *  is `aria-live="polite"`, deliberately NOT `assertive`: a value that
 *  changes on every keystroke must never interrupt.
 *
 *  DESIGN NOTE 5 (empty input is blocked with a stated reason). Empty
 *  (after `.trim()`) dispatches `SET_DESCRIBE_ERR` with the registered
 *  string and never calls the interpreter (prototype 2421-2422). There is
 *  no separate "short input" branch — the prototype has none, and none is
 *  invented here; spec §1 / FR-AI-05's "hint, not a block" for a short
 *  input is satisfied by the placeholder and the example chips, which both
 *  model the expected length. Recorded here, per the task brief's own
 *  instruction, so the spec line is visibly accounted for rather than
 *  silently dropped — flagged as Open Question 3 for the owner.
 *
 *  DESIGN NOTE 6 (I5 — THE STALE-RESOLVE GUARD). The citizen can tap Back
 *  while a call is in flight: the component unmounts, but the promise does
 *  not. Nothing in the nav-clear set touches `reading` (Task 6 design note
 *  5 keeps describe fields off it, deliberately), so without a guard the
 *  resolve either leaves a dead "Reading…" button on the screen the citizen
 *  left, or fires `INTERPRETATION_DONE` and yanks them to the confirm
 *  screen from wherever they have since navigated. NOT a theoretical
 *  concern in this codebase — C7's final whole-branch review found real
 *  Critical instances of exactly this effect-lifecycle class. Two pieces:
 *   - A request-id guard: a module-level monotonic counter (`seq`) and a
 *     `useRef` holding THIS instance's active id. On submit:
 *     `const id = ++seq; active.current = id`. On resolve:
 *     `if (active.current !== id) return` BEFORE any dispatch — a response
 *     whose id has been superseded (a second submit) or invalidated (an
 *     unmount) dispatches nothing.
 *   - An unmount cleanup (`useEffect` with a `[]` dependency array, so it
 *     runs exactly once, on unmount): `active.current = -1` first, THEN
 *     `dispatch({ type: 'INTERPRETATION_ABANDONED' })`. Setting the ref
 *     first is what makes the guard above reject a late resolve; the
 *     dispatch clears `state.reading` so the screen the citizen left is not
 *     stuck showing "Reading…". Task 6's own reducer arm for that action is
 *     guarded on `s.reading`, so this SAME cleanup firing after a
 *     SUCCESSFUL interpretation (`INTERPRETATION_DONE` navigates, which
 *     unmounts this block too) is a reference-identical no-op — do not
 *     "optimise" it away on the success path; distinguishing the two paths
 *     here would need exactly the state this guard exists to avoid needing.
 *   The citizen's text is untouched by either piece — `describeText` is
 *   never on the nav-clear set, so returning to the screen shows their own
 *   words in the box again, per spec §1.
 *
 *  DESIGN NOTE 7 (a11y — a correction, in the same class as C7's
 *  `.auth-label` `<div>` -> real `<label>`). The prototype re-renders the
 *  whole screen on every toggle and manages no focus at all — a keyboard
 *  user is left wherever they were. This port carries `aria-expanded` AND
 *  `aria-controls` on `.describe-row` (the prototype has only the former,
 *  line 3007) and moves focus: to the textarea on open, back to the row
 *  button on close. The textarea keeps the prototype's own
 *  `aria-label="Describe your situation"` (line 3012) — it has no visible
 *  label, so an `aria-label` is correct here, not a shortcut. The error
 *  node carries `role="alert"`.
 *
 *  DESIGN NOTE 8 (the example chips: truncated visible label, full
 *  accessible name). The prototype truncates the chip's VISIBLE label at 52
 *  characters with an ellipsis (line 3017) but fills the textarea with the
 *  FULL story on tap. A chip whose accessible name is the truncated string
 *  would misdescribe what tapping it does, so this port additionally gives
 *  each chip an `aria-label` carrying the full text (and a matching `title`
 *  for a native tooltip) while the visible label stays truncated — a small
 *  addition the prototype does not make, the same a11y reasoning as design
 *  note 7, and tested. */
import { useEffect, useRef } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import type { DescribeEntryScreenId } from '../domain/interpret'
import { DESCRIBE_CHAINS, DESCRIBE_MAX } from '../domain/interpret'
import { runInterpretation } from '../session/interpretation'
import { describeItEnabled } from '../session/featureFlags'
import { redactRefusedNumbers } from '../domain/interpretFacts'
import { Button } from '../ui/Button'
import { ICONS } from '../ui/icons'
import { UI } from '../screens/screenCopy'

const DESCRIBE_BOX_ID = 'describe-box'
/** Prototype 3017's own cutoff — transcribed, not invented. */
const EX_CHIP_TRUNCATE_AT = 52

/** I5 design note 6: a module-level monotonic request id, shared by every
 *  `DescribeBlock` instance that has ever existed in this process. There is
 *  only ever one mounted at a time in production (one per screen, and only
 *  one screen is ever on-stage), so a single shared counter is simpler than
 *  — and exactly as correct as — a per-instance one: each instance only
 *  ever compares against the id IT captured, never another instance's. */
let seq = 0

export interface DescribeBlockProps {
  /** A plain string, not `DescribeEntryScreenId` — design note 2's second
   *  guard exists precisely to handle a screen id that is NOT a member of
   *  that union (e.g. `PassportRecovery`'s own screen ids), so the prop
   *  type must accept one. */
  screenId: string
  state: SessionState
  dispatch: (action: SessionAction) => void
}

export function DescribeBlock({ screenId, state, dispatch }: DescribeBlockProps) {
  // Rules of hooks: every hook below runs on EVERY render of this
  // component, unconditionally, ahead of the three early-return guards —
  // React requires the same hooks in the same order on every render, and a
  // guard that returned before a hook call would violate that the moment
  // the flag/chain/quota state ever changed between renders.
  const active = useRef(0)
  const rowRef = useRef<HTMLButtonElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const wasOpen = useRef(state.describeOpen)

  // Design note 6, second piece: invalidate any in-flight call and clear a
  // stuck busy flag when this instance unmounts. `[]` deps: runs exactly
  // once, on unmount. `dispatch` is guaranteed stable by `useReducer` (React's
  // own contract), so capturing it here is identical to reading it fresh.
  useEffect(() => {
    return () => {
      active.current = -1
      dispatch({ type: 'INTERPRETATION_ABANDONED' })
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberate: unmount-only cleanup, not a re-run trigger; `dispatch` is stable (useReducer's own contract); see design note 6 above
  }, [])

  // Design note 7: focus management the prototype does not do.
  useEffect(() => {
    if (state.describeOpen && !wasOpen.current) {
      taRef.current?.focus()
    } else if (!state.describeOpen && wasOpen.current) {
      rowRef.current?.focus()
    }
    wasOpen.current = state.describeOpen
  }, [state.describeOpen])

  // Design note 2: three guards, three reasons — the container is
  // structurally ABSENT for all three, never merely hidden.
  if (!describeItEnabled()) return null
  const chain = DESCRIBE_CHAINS[screenId as DescribeEntryScreenId]
  if (!chain) return null
  if (state.quotaExhausted) return null

  const handleSubmit = async () => {
    const trimmed = state.describeText.trim()
    // Design note 5: no interpreter call for empty/whitespace-only input.
    if (!trimmed) {
      dispatch({ type: 'SET_DESCRIBE_ERR', error: UI.describe.err })
      return
    }
    // Design note 6, first piece: captured BEFORE the await, compared AFTER.
    const id = ++seq
    active.current = id
    dispatch({ type: 'INTERPRETATION_STARTED' })
    const result = await runInterpretation(screenId, state.answers, trimmed)
    // A superseded (second submit) or invalidated (unmounted) call
    // dispatches NOTHING — checked before any dispatch below.
    if (active.current !== id) return
    if (result.ok) {
      // session.ts's own `ActiveInterpretation` doc comment: "the party
      // that calls `runInterpretation` composes this wrapper before
      // dispatching `INTERPRETATION_DONE`" — that's here. `GatedInterpretation`
      // carries no `ctxScreen`/`engine`/`service`/`text` of its own.
      //
      // Whole-branch review (2026-09-09 fix wave), Finding 2: `text` is
      // `redactRefusedNumbers(chain.engine, trimmed)`, NOT the raw `trimmed`
      // — `result.interp` (the `facts`/`droppedSensitive` above) was already
      // gated against the UNREDACTED `trimmed` text (`runInterpretation`'s
      // own call), so the fact rules still see the real digits; only THIS
      // composed `text` — the value that becomes `appliedText`/the "You
      // wrote" row (TrustDisclosure.tsx, UnplaceablePanel.tsx) — is scrubbed,
      // so a citizen-typed Aadhaar number correctly refused from `facts`
      // cannot still survive, unredacted, in the persisted/displayed text.
      dispatch({
        type: 'INTERPRETATION_DONE',
        interp: { ...result.interp, ctxScreen: screenId, engine: chain.engine, service: chain.service, text: redactRefusedNumbers(chain.engine, trimmed) },
      })
    } else {
      dispatch({ type: 'INTERPRETATION_FAILED', reason: result.reason })
    }
  }

  // Safe once past the chain guard above: `screenId` is now a genuine
  // `DescribeEntryScreenId`, and `UI.describe.examples` registers exactly
  // that union's six keys (screenCopy.ts's own doc comment). Declaration
  // order per that same comment: `Object.values`, not re-sorted.
  const examples = Object.values(UI.describe.examples[screenId as DescribeEntryScreenId])

  return (
    <div className="describe-entry">
      <button
        ref={rowRef}
        type="button"
        className="describe-row"
        aria-expanded={state.describeOpen}
        // Whole-branch review (2026-09-09 fix wave), Finding 7: `aria-controls`
        // is only SET while `.describe-box` (id={DESCRIBE_BOX_ID}) actually
        // renders — that element is structurally ABSENT (not merely hidden;
        // `DescribeBlock.test.tsx` pins `.describe-box` NOT in the document
        // while collapsed) when `state.describeOpen` is false, so a
        // permanently-set `aria-controls` was a dangling IDREF pointing at
        // nothing for the entire collapsed lifetime of this component.
        aria-controls={state.describeOpen ? DESCRIBE_BOX_ID : undefined}
        onClick={() => dispatch({ type: 'TOGGLE_DESCRIBE' })}
      >
        <span className="dr-icon">{ICONS.pen}</span>
        <span className="dr-label">
          {UI.describe.rowLead}
          <b>{UI.describe.rowStrong}</b>
        </span>
      </button>
      {state.describeOpen ? (
        <div className="describe-box" id={DESCRIBE_BOX_ID}>
          <textarea
            ref={taRef}
            className="describe-ta"
            maxLength={DESCRIBE_MAX}
            placeholder={UI.describe.placeholder}
            aria-label={UI.describe.ariaLabel}
            value={state.describeText}
            onChange={e => dispatch({ type: 'SET_DESCRIBE_TEXT', text: e.target.value })}
          />
          <div className="describe-meta">
            <span className="lang-note">{UI.describe.langNote}</span>
            {/* Design note 4: live, polite — a per-keystroke value must
                never be assertive. */}
            <span className="char-count" aria-live="polite">
              {`${state.describeText.length} / ${DESCRIBE_MAX}`}
            </span>
          </div>
          <div className="ex-chips">
            {examples.map((story, i) => (
              <button
                key={i}
                type="button"
                className="ex-chip"
                // Design note 8: the accessible name (and native tooltip)
                // carry the FULL story; only the visible text is truncated.
                aria-label={story}
                title={story}
                onClick={() => dispatch({ type: 'FILL_DESCRIBE_EXAMPLE', text: story })}
              >
                {`"${story.length > EX_CHIP_TRUNCATE_AT ? `${story.slice(0, EX_CHIP_TRUNCATE_AT)}…` : story}"`}
              </button>
            ))}
          </div>
          {state.describeErr ? (
            <div className="describe-err" role="alert">
              {state.describeErr}
            </div>
          ) : null}
          <div className="describe-actions">
            {/* Prototype 3020: the arrow lives inside the "not reading" text
                only — `Reading…` never carries one. */}
            <Button
              block
              arrow={!state.reading}
              style={{ marginTop: 0 }}
              onClick={() => void handleSubmit()}
              disabled={state.reading}
            >
              {state.reading ? UI.describe.reading : UI.describe.read}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
