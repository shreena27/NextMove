/** InterpConfirmScreen — "Here's how we read it" — port of the prototype's
 *  `renderInterpConfirm`'s MAPPED-cards path only (design/nextmove-v1-
 *  prototype.html, 3067-3105, tag v1-design-lock-2): the feature's actual
 *  safety gate (FR-AI-02 — "the confirm screen is the sole safety gate").
 *
 *  THE UNPLACEABLE PATH (prototype 3044-3065) IS TASK 14'S OWN FILE
 *  (`UnplaceablePanel`), NOT THIS ONE'S. The prototype has one function with
 *  an early return; this port splits it into two screens sharing a shell so
 *  each test file stays about one thing. This component renders NOTHING
 *  (`null`) whenever `state.interp` is absent or `interp.unplaceable` —
 *  design note 1 of task-12-brief.md literally says this component "renders
 *  the unplaceable one... by composition", but Task 14's file does not
 *  exist yet at this task's start, so the composing switch between this
 *  component and Task 14's belongs to whichever later task wires the two
 *  together (Task 17's App.tsx router), never to a forward import here.
 *
 *  WIRED into App.tsx's router by Task 17: the `'interp-confirm'` case
 *  mounts this component and `UnplaceablePanel` as SIBLINGS, and the two
 *  self-guards are exact complements, so exactly one of them ever produces
 *  output for any given `state.interp`. Until then this was built and tested
 *  standalone via direct RTL renders, the same way `DescribeBlock` (Task 11)
 *  was fully built and tested before its six mount sites existed in the
 *  router-reachable sense.
 *
 *  FACT CHIPS (`FactChips`, `src/templates/FactChips.tsx`; prototype
 *  `factChips(it.facts)`, 3099, between the cards and the primary action)
 *  ARE composed here, by Task 13 (which owns that file) — always fed
 *  `state.interp.facts`/`droppedSensitive`/`state.factEditIdx`/
 *  `state.factEditVal`, per `FactChips`'s own standalone-component contract
 *  (owned by neither this screen nor `UnplaceablePanel`, Task 14, which
 *  composes the same component into its own file).
 *
 *  DESIGN NOTE — the clock (D6). `now` is a REQUIRED prop, taken directly
 *  (not a pre-bound callback the way `PrepareScreen.onTogglePrepStep` is) —
 *  this codebase's OTHER established D6 convention, the one `Home`/
 *  `SaveNameScreen`/`SaveCaseScreen`/`SaveOtpScreen` already use. Chosen as
 *  the simpler test seam and the more literal reading of the brief's own
 *  phrasing ("the confirm screen's ... handler passes it" — the handler
 *  INSIDE this component). `Date.now()` is never called here; Task 17's
 *  App.tsx wiring supplies `now` the same way it already does for those
 *  four screens.
 *
 *  DESIGN NOTE — `.ropt` is its OWN element here, never a reuse of
 *  `AnswerRow`. `AnswerRow`'s own header comment explains its refusal of
 *  `aria-pressed`: "these buttons are not toggles — they navigate
 *  immediately and the screen changes underneath them, so a pressed state
 *  is never observable." `.ropt` is the opposite shape: it changes a
 *  PENDING selection in place, the citizen stays on this screen looking at
 *  it, and the pressed state IS observable and meaningful — the prototype
 *  has it (3085). The two controls are deliberately different for
 *  deliberately different reasons; a future reader who knows `AnswerRow`'s
 *  rule should not "fix" this into a bug by merging them.
 *
 *  DESIGN NOTE — D11's persistent Change control. The prototype mounts
 *  `.read-change` only in the collapsed ("seen", closed) branch, with a
 *  HARDCODED `aria-expanded="false"` (3076) — the open branch has no
 *  control at all, an incomplete ARIA contract with no way back for a
 *  keyboard user. This port keeps ONE `.read-change` button per `seen`
 *  question, mounted in BOTH its open and closed renders, `aria-expanded`
 *  tracking the real reveal state, `aria-controls` pointing at that
 *  question's option-list id, focus moved to the first option on open and
 *  back to the control on collapse. The visible label stays "Change" in
 *  both states — `aria-expanded` alone carries the state, no new string is
 *  authored. A NEVER-SEEN question gets no Change control at all, in either
 *  branch: D12's whole point is that it is ALWAYS shown as a full option
 *  list (never a lone label), so there is no "collapsed" state for it to
 *  offer a way back into — adding one would let a value the citizen never
 *  reviewed be hidden behind a label again.
 *
 *  DESIGN NOTE — the composed live-region summary is `UI.interp.summary`
 *  (screenCopy.ts), a Task-12-authored, screen-reader-only string with no
 *  prototype source (see that entry's own doc comment there for the full
 *  reasoning). `composeSummary` below builds it from three already-complete
 *  grammatical pieces — never a suffix glued onto a shared stem, the same
 *  discipline `AccountChip.tsx`'s own casefilesOne/Many join already uses —
 *  joined with a comma, then (only when something was set aside) a
 *  semicolon clause before the final period, mirroring
 *  `UI.interp.framingParagraph`'s own D8 semicolon, this bucket's
 *  established voice. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AnswerRecord } from '../domain/types'
import type { SessionAction, SessionState } from '../session/session'
import type { DescribeEntryScreenId } from '../domain/interpret'
import { DESCRIBE_CHAINS } from '../domain/interpret'
import { SIR_STATES, SIR_Q1_OPTIONS_FOR } from '../playbooks/sirPlaybook'
import { optionsForPhase } from '../domain/sirConfig'
import {
  PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS,
  VOTER_Q1_LABELS, VOTER_APPEAL_LABELS, VOTER_ENTRY_LABELS,
} from '../screens/labels'
import { Split } from '../ui/Split'
import { Crumbs } from '../ui/Crumbs'
import { SERVICE_SQ } from '../ui/serviceSquare'
import { Button } from '../ui/Button'
import { FactChips } from './FactChips'
import { UI } from '../screens/screenCopy'

/** Design note 4 of task-12-brief.md: ONE label-resolution helper, not six
 *  inline lookups — six lookups is six places to forget SIR's own phase
 *  argument. Maps a question's option VALUE to its display label; `domain/`
 *  only ever hands this component a value (D1's split), never a label.
 *
 *  Exported for `UnplaceablePanel.tsx` (Task 14, "Gap 1" of that task's own
 *  brief): the unplaceable panel offers one question from this exact same
 *  six-source universe (SIR's phase-dependent throw guard included), so it
 *  reuses this resolution rather than carrying a second copy of the same
 *  switch — this file's own reasoning above applies doubly across two
 *  components sharing it. Adding `export` here changes nothing about this
 *  file's own callers below; they are unaffected by a function also being
 *  visible to another module. */
export function labelsFor(questionId: string, answers: AnswerRecord): Record<string, string> {
  switch (questionId) {
    case 'q1': return PASSPORT_Q1_LABELS
    case 'q2': return PASSPORT_Q2_LABELS
    case 'voterEntry': return VOTER_ENTRY_LABELS
    case 'voterQ1': return VOTER_Q1_LABELS
    case 'voterAppealedRaw': return VOTER_APPEAL_LABELS
    case 'sirQ1': {
      // `optionsForPhase` genuinely THROWS for an unsupported/misconfigured
      // state (sirConfig.ts:24-36; D16/I2) — a label lookup that throws
      // mid-render would blank the whole confirm screen. Degraded, not
      // destroyed: an empty map here just means the pick/option VALUE
      // renders as itself below, never a crash.
      const state = SIR_STATES[answers.sirState]
      if (!state) return {}
      try {
        return optionsForPhase(state, SIR_Q1_OPTIONS_FOR)
      } catch {
        return {}
      }
    }
    default: return {}
  }
}

/** The question's own display label (`.read-q`) — a DIFFERENT lookup from
 *  `labelsFor` above: this is the question's own headline-like label
 *  (`UI.interp.qLabel`, Task 10 design note 5's verbatim transcription of
 *  `DESCRIBE_CTX`'s own `label` fields), never a similarly-worded screen
 *  headline — three of the six differ from the shipped headline by a word
 *  or a contraction, and screenCopy.test.tsx pins the negative rows. */
function qLabelFor(questionId: string): string {
  return (UI.interp.qLabel as Record<string, string>)[questionId] ?? questionId
}

/** See this file's own header note for the full reasoning behind this
 *  string existing at all. `matched`/`facts` are always the LIVE counts off
 *  `state.interp` at render time; `anySetAside` is a boolean, never a
 *  count — design note 9's own "never a count of discards, only a fact of
 *  one" discipline for the visible discard note applies identically here. */
function composeSummary(matched: number, facts: number, anySetAside: boolean): string {
  const matchedClause = matched === 1
    ? UI.interp.summary.matchedOne
    : UI.interp.summary.matchedMany.replace('{matched}', String(matched))
  const factsClause = facts === 1
    ? UI.interp.summary.factsOne
    : UI.interp.summary.factsMany.replace('{facts}', String(facts))
  const discardedClause = anySetAside ? UI.interp.summary.discardedNote : ''
  return `${matchedClause}, ${factsClause}${discardedClause}.`
}

export interface InterpConfirmScreenProps {
  state: SessionState
  dispatch: (action: SessionAction) => void
  /** D6: the clock `APPLY_INTERPRETATION`'s dispatch carries — see this
   *  file's own header note for the convention chosen and why. Never
   *  `Date.now()` inside this component. */
  now: number
  /** Rendered first, the same `topbar?: ReactNode` slot convention
   *  `DiagnosisScreen`/`NextMoveScreen`/`PrepareScreen`/`DeadEndScreen`
   *  already use — the real `<Topbar>` wired to session is Task 17's
   *  App.tsx's job to supply, `topbar(true, false)` (back shown, restart
   *  hidden), matching the prototype's own call at the top of
   *  `renderInterpConfirm`. */
  topbar?: ReactNode
}

export function InterpConfirmScreen({ state, dispatch, now, topbar }: InterpConfirmScreenProps) {
  // Rules of hooks: every hook below runs on EVERY render, unconditionally,
  // ahead of the early-return guard further down — same discipline
  // DescribeBlock's own header note (design note 2 there) explains, for the
  // same reason: a guard whose condition can flip between renders must
  // never sit ahead of a hook call.
  const h1Ref = useRef<HTMLHeadingElement>(null)
  const prevOpenRef = useRef(state.interpChangeOpen)
  const changeBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const firstOptRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Design note 10 (spec §7): focus moves to the <h1> ON MOUNT, once — a
  // later re-render (a repick, a toggle) must never yank focus back here.
  useEffect(() => {
    h1Ref.current?.focus()
  }, [])

  // Fix round 1, Finding F1 (task-12 fix-round-1.md). The live region below
  // used to be inserted into the DOM ALREADY carrying its summary text, in
  // the SAME commit as the region itself — a region that arrives
  // pre-populated is not reliably announced by NVDA/JAWS/VoiceOver on
  // initial mount, since screen readers announce MUTATIONS to an
  // already-existing live region, not a node that shows up fully formed.
  // That defeated design note 10's actual point ("a screen-reader user has
  // no idea the screen changed"), even though it satisfied the RED item's
  // literal wording. Fixed by rendering the region EMPTY on the first
  // commit and populating it here, in an effect that runs AFTER mount — so
  // the text arrives as a genuine mutation. A later repick (or any other
  // re-render that changes `state.interp`) still recomputes and re-sets
  // this on every change, which is also a real mutation to the same
  // existing node — so that path needed no change at all.
  const [summary, setSummary] = useState('')
  useEffect(() => {
    const currentInterp = state.interp
    if (!currentInterp || currentInterp.unplaceable) return
    // This IS F1's entire fix, not an anti-pattern to clean up: the lint
    // rule's own suggestion, "derive the value during render instead", is
    // exactly the bug being corrected here — deriving it during render is
    // what put the text in the SAME commit as the region, which is why it
    // wasn't reliably announced; see design note above.
    // oxlint-disable-next-line react/set-state-in-effect -- deliberate, see comment above
    setSummary(composeSummary(
      currentInterp.mappings.length,
      currentInterp.facts.length,
      currentInterp.discarded.length > 0,
    ))
  }, [state.interp])

  // D11: focus follows a Change reveal — to the first option on open, back
  // to the Change control on collapse. Compares against a Record snapshot
  // rather than a single boolean (DescribeBlock's own `wasOpen` pattern,
  // generalised to per-question keys, since more than one question's reveal
  // can exist on this screen). Seeded from the CURRENT value at first
  // render (`useRef(state.interpChangeOpen)`, not `useRef({})`), so a test
  // (or a real mount) that starts with a reveal already open does not read
  // as a "just opened" transition and steal focus away from the <h1> mount
  // effect above.
  useEffect(() => {
    const prev = prevOpenRef.current
    for (const [questionId, isOpen] of Object.entries(state.interpChangeOpen)) {
      const wasOpen = !!prev[questionId]
      if (isOpen && !wasOpen) firstOptRefs.current[questionId]?.focus()
      else if (!isOpen && wasOpen) changeBtnRefs.current[questionId]?.focus()
    }
    prevOpenRef.current = state.interpChangeOpen
  }, [state.interpChangeOpen])

  const interp = state.interp
  // This component only ever renders the MAPPED path — see the file header.
  if (!interp || interp.unplaceable) return null

  const chain = DESCRIBE_CHAINS[interp.ctxScreen as DescribeEntryScreenId]?.chain ?? []
  // D12's heuristic: the ONE question on the screen the citizen typed on —
  // they already saw its options moments ago. Kept exactly as specified;
  // design note 3 records why "improving" this comparison is the wrong
  // move — read it before touching this line.
  const seenQuestionId = chain[0]?.questionId

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <Crumbs parts={[interp.service, UI.interp.crumbTail]} sqClass={SERVICE_SQ[interp.service] ?? null} />
              <h1 className="headline" ref={h1Ref} tabIndex={-1}>{UI.interp.headline}</h1>
              {/* Design note 10: a visually-hidden live region, never
                  visible prose — see UI.interp.summary's own doc comment
                  (screenCopy.ts) and this file's header note. Rendered
                  EMPTY here on purpose (fix round 1, F1, above) — `summary`
                  is populated by the mount/update effect, never inline,
                  so a screen reader sees a real mutation to this node
                  rather than a node that arrives already carrying text. */}
              <div className="vh" aria-live="polite">
                {summary}
              </div>
              <p className="interp-frame">{UI.interp.framingParagraph}</p>
              <div className="youwrote">
                <div className="nm-k">{UI.interp.youWrote}</div>
                <div className="youwrote-text">"{interp.text}"</div>
              </div>
              {interp.discarded.length > 0 ? (
                <p className="small" style={{ marginTop: 14 }}>
                  {UI.interp.discardNote.replace('{question}', qLabelFor(interp.discarded[0].questionId).toLowerCase())}
                </p>
              ) : null}
            </>
          }
          right={
            <>
              {interp.mappings.map(m => {
                const seen = m.questionId === seenQuestionId
                const open = !!state.interpChangeOpen[m.questionId]
                const labels = labelsFor(m.questionId, state.answers)
                const optsId = `interp-opts-${m.questionId}`
                // Design note 5: `m.changed` suppresses the span quote —
                // once a citizen has overridden a pick, the model's
                // justifying span no longer justifies anything; showing it
                // under a value the model never proposed would be a false
                // provenance record.
                // Fix round 1, Finding F2 (task-12 fix-round-1.md). This
                // prefix used to be a `.vh`-hidden span DUPLICATING
                // `index.css`'s `.span-quote::before{content:"you wrote: "}`
                // — design note 10's belt-and-braces choice, made on the
                // assumption that engines were inconsistent about exposing
                // `::before` generated content to the accessibility tree.
                // They are not: every current major engine DOES expose it,
                // so the hidden span plus the CSS content together
                // announced "you wrote: you wrote: '...'" — a real
                // double-read. This is now the ONLY source of that text: a
                // real, VISIBLE span (`.span-quote-prefix`, index.css —
                // carrying the exact declarations the deleted `::before`
                // rule used to) rather than a hidden duplicate. Do not
                // reintroduce a `.vh` wrapper or a CSS `::before` here.
                const spanQuote = !m.changed
                  ? <div className="span-quote"><span className="span-quote-prefix">{UI.interp.spanPrefix}</span>&quot;{m.span}&quot;</div>
                  : null

                if (seen && !open) {
                  return (
                    <div className="read-card" key={m.questionId}>
                      <div className="read-q">{qLabelFor(m.questionId)}</div>
                      <div className="read-pick">{labels[m.value] ?? m.value}</div>
                      {spanQuote}
                      <button
                        type="button"
                        className="read-change"
                        aria-expanded={open}
                        // Whole-branch review (2026-09-09 fix wave), Finding
                        // 7: NO `aria-controls` here — `.read-opts` (id=
                        // {optsId}) is structurally ABSENT (not merely
                        // hidden; InterpConfirmScreen.test.tsx pins
                        // `.read-opts` NOT in the document on this exact
                        // collapsed branch) while this branch renders `open`
                        // is always `false` here, by this branch's own
                        // condition), so a permanently-set `aria-controls`
                        // was a dangling IDREF pointing at nothing. The
                        // sibling `.read-change` below (the open/never-seen
                        // branch) keeps `aria-controls={optsId}` unconditionally
                        // because `.read-opts` genuinely renders every time
                        // that branch does.
                        ref={el => { changeBtnRefs.current[m.questionId] = el }}
                        onClick={() => dispatch({ type: 'TOGGLE_INTERP_CHANGE', questionId: m.questionId, open: true })}
                      >
                        {UI.interp.change}
                      </button>
                    </div>
                  )
                }

                // Never-seen questions, or a seen question with its reveal
                // open: the full option list, pre-selected — never a lone
                // label (design note 3 / FR-AI-03's "no lone-label
                // anchoring").
                return (
                  <div className="read-card" key={m.questionId}>
                    <div className="read-q">{qLabelFor(m.questionId)}</div>
                    {spanQuote}
                    <div className="read-opts" id={optsId}>
                      {m.optionValues.map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          className={`ropt ${m.value === v ? 'picked' : ''}`}
                          aria-pressed={m.value === v}
                          ref={i === 0 ? (el: HTMLButtonElement | null) => { firstOptRefs.current[m.questionId] = el } : undefined}
                          onClick={() => dispatch({ type: 'INTERP_REPICK', questionId: m.questionId, value: v })}
                        >
                          <span className="ropt-dot" />
                          <span>{labels[v] ?? v}</span>
                        </button>
                      ))}
                    </div>
                    {seen ? (
                      <button
                        type="button"
                        className="read-change"
                        aria-expanded={open}
                        aria-controls={optsId}
                        ref={el => { changeBtnRefs.current[m.questionId] = el }}
                        onClick={() => dispatch({ type: 'TOGGLE_INTERP_CHANGE', questionId: m.questionId, open: false })}
                      >
                        {UI.interp.change}
                      </button>
                    ) : null}
                  </div>
                )
              })}
              {/* Fact chips (Task 13's own file, FactChips) — prototype
                  3099, between the cards and the primary action. Standalone
                  component, owned by neither this screen nor
                  UnplaceablePanel (Task 14) — see FactChips.tsx's own
                  header for why. Always fed `state.interp.facts`/
                  `droppedSensitive` (never any other array), matching the
                  reducer's own "operates on state.interp.facts" contract
                  (session.ts's SET_FACT_EDIT/SAVE_FACT_EDIT/REMOVE_FACT). */}
              <FactChips
                facts={interp.facts}
                droppedSensitive={interp.droppedSensitive}
                factEditIdx={state.factEditIdx}
                factEditVal={state.factEditVal}
                dispatch={dispatch}
              />
              <Button block arrow onClick={() => dispatch({ type: 'APPLY_INTERPRETATION', now })}>
                {UI.interp.useTheseAnswers}
              </Button>
              <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'BACK' })}>
                {UI.interp.answerMyself}
              </button>
              <div className="demo-hint" style={{ marginTop: 14 }}>{UI.interp.simulatorNote}</div>
            </>
          }
        />
      </div>
    </>
  )
}
