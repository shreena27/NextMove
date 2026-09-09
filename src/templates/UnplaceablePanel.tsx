/** UnplaceablePanel — "We couldn't safely place this." — port of the
 *  prototype's `renderInterpConfirm`'s UNPLACEABLE branch (design/nextmove-
 *  v1-prototype.html, 3044-3065, tag v1-design-lock-2): the screen a citizen
 *  sees when the AI interpretation fails, or reads something it cannot
 *  confidently place (FR-AI-05; spec's own "every failure path lands on the
 *  unplaceable panel with text preserved"). `InterpConfirmScreen.tsx`'s own
 *  header comment already named this file as the unplaceable path's real
 *  home: "THE UNPLACEABLE PATH (prototype 3044-3065) IS TASK 14'S OWN FILE
 *  (`UnplaceablePanel`), NOT THIS ONE'S."
 *
 *  WIRED into App.tsx's router, and mounted in screenCopy.test.tsx's own
 *  coverage sweep, by Task 17 — both of which this comment previously listed
 *  as owed. The router's `'interp-confirm'` case mounts this component and
 *  `InterpConfirmScreen` as SIBLINGS; the guard below and that component's
 *  own guard are exact complements, so exactly one of them ever produces
 *  output. Until then this was built and tested standalone via direct RTL
 *  renders, the same way `DescribeBlock`/`InterpConfirmScreen`/`FactChips`
 *  were before their own router mount sites existed.
 *
 *  REUSE, NOT A SECOND IMPLEMENTATION — the two real cross-file gaps this
 *  task closes with a single additive `export` each, never a duplicate copy:
 *   - `labelsFor` (`InterpConfirmScreen.tsx`) — the six-source option-value-
 *     to-label resolution, SIR's own defensive try/catch (that file's own
 *     comment: "a label lookup that throws mid-render blanks the whole
 *     confirm screen") included. This screen offers exactly one question
 *     from the same six-source universe, so it needs the identical
 *     resolution — a second copy would be a second place to forget SIR's
 *     phase argument.
 *   - `resolveOptionValues` (`domain/interpretGates.ts`) — resolves a
 *     `ChainEntry`'s `optionValues`, whether it is a plain array or (SIR's
 *     case) a function of the known answers. `templates/` importing from
 *     `domain/` is layering-legal; only the reverse direction is forbidden.
 *
 *  DESIGN NOTE — the offered question (prototype 3045): `chain.find(c =>
 *  !state.answers[c.questionId]) ?? chain[0]` — the first UNANSWERED
 *  question in the chain, falling back to `chain[0]` so a chain whose every
 *  question is already answered never offers `undefined` (which would crash
 *  the render below). D2 (already established by Task 7's
 *  `unplaceablePickPlan`, `domain/interpret.ts`: the `voterEntry` case's own
 *  `writes: []`): `voterEntry` is NEVER written into `answers`, even once a
 *  citizen has confirmed it — so for the `voter-entry` chain this always
 *  resolves to `voterEntry` itself, correctly, because it genuinely is the
 *  first thing to ask. A reader who conflates "the screen the citizen typed
 *  on" (what `InterpConfirmScreen`'s own `seenQuestionId` heuristic calls
 *  "seen") with "already written to `answers`" will wrongly expect
 *  `voterQ1` here — those are different questions this file must not merge.
 *
 *  DESIGN NOTE — picking an option (prototype 2483-2489, `unplaceablePick`).
 *  Dispatches the single `UNPLACEABLE_PICK` action Task 7 built for exactly
 *  this, carrying the facts and text this panel is CURRENTLY rendering
 *  (`interp.facts`/`interp.text`/`interp.provenance`) plus the clicked
 *  `questionId`/`value` — nothing else. AC-AI-1's second permitted path: "a
 *  direct pick on the unplaceable panel," the citizen choosing from the
 *  closed list themselves.
 *
 *  DESIGN NOTE — same panel regardless of reason (design note 5 of this
 *  task's brief). This component never reads or renders `reason` — it isn't
 *  even part of `ActiveInterpretation`. A citizen does not need to know
 *  whether the quota ran out or the JSON was malformed; naming the reason
 *  would be both useless to them and a small information leak about the
 *  provider. `'quota'` never reaches this panel at all (I7 — Task 6's
 *  `INTERPRETATION_FAILED` does not navigate on that reason); there is no
 *  branch here for it and there must never be one.
 *
 *  FACT CHIPS (`FactChips`, Task 13) are composed here exactly as
 *  `InterpConfirmScreen` composes them (prototype 3062's own `factChips`
 *  call) — the unplaceable path still shows facts, since they passed the
 *  verbatim gate independently of any mapping. */
import type { ReactNode } from 'react'
import type { SessionAction, SessionState } from '../session/session'
import type { DescribeEntryScreenId } from '../domain/interpret'
import { DESCRIBE_CHAINS } from '../domain/interpret'
import { resolveOptionValues } from '../domain/interpretGates'
import { labelsFor } from './InterpConfirmScreen'
import { Split } from '../ui/Split'
import { Crumbs } from '../ui/Crumbs'
import { SERVICE_SQ } from '../ui/serviceSquare'
import { FactChips } from './FactChips'
import { UI } from '../screens/screenCopy'

/** The question's own display label (`.read-q`) — the SAME small lookup
 *  `InterpConfirmScreen.tsx`'s own private `qLabelFor` performs, kept as its
 *  own copy here rather than a third export: unlike `labelsFor`/
 *  `resolveOptionValues` above, this is a single `Record` read with a
 *  fallback, no branching, no SIR-shaped throw hazard — not the "six places
 *  to forget one argument" class of duplication this file's header note
 *  names as the reason to share the other two. Used for both the offered
 *  question's own heading AND the discard note's `{question}` (a
 *  DIFFERENT, possibly unrelated question id), so it takes a plain
 *  `questionId` parameter rather than being inlined at either call site. */
function qLabelFor(questionId: string): string {
  return (UI.interp.qLabel as Record<string, string>)[questionId] ?? questionId
}

export interface UnplaceablePanelProps {
  state: SessionState
  dispatch: (action: SessionAction) => void
  /** Rendered first, the same `topbar?: ReactNode` slot convention
   *  `InterpConfirmScreen`/`DiagnosisScreen`/`NextMoveScreen`/
   *  `DeadEndScreen` already use — the real `<Topbar>` wired to session is
   *  Task 17's App.tsx's job to supply, `topbar(true, false)` (back shown,
   *  restart hidden), matching the prototype's own call at the top of
   *  `renderInterpConfirm`. */
  topbar?: ReactNode
}

export function UnplaceablePanel({ state, dispatch, topbar }: UnplaceablePanelProps) {
  const interp = state.interp
  // This component only ever renders the UNPLACEABLE path — the mirror
  // image of InterpConfirmScreen's own "only ever renders MAPPED" guard.
  // 'quota' (design note 5, above) never produces an interp that reaches
  // here at all, so there is no third branch to guard against.
  if (!interp || !interp.unplaceable) return null

  const chain = DESCRIBE_CHAINS[interp.ctxScreen as DescribeEntryScreenId]?.chain ?? []
  // Design note above: the first unanswered question, falling back to
  // chain[0] so a fully-answered chain never offers `undefined`. Transcribed
  // from the prototype (3045) with both halves intact.
  const q0 = chain.find(c => !state.answers[c.questionId]) ?? chain[0]
  const optionValues = resolveOptionValues(q0, state.answers)
  const labels = labelsFor(q0.questionId, state.answers)

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <Crumbs parts={[interp.service, UI.interp.crumbTail]} sqClass={SERVICE_SQ[interp.service] ?? null} />
              <h1 className="headline">{UI.unplaceable.headline}</h1>
              <p className="lede">{UI.unplaceable.lede}</p>
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
              <div className="unplace-panel">
                <div className="read-q">{qLabelFor(q0.questionId)}</div>
                <div className="read-opts" style={{ borderTop: 'none', marginTop: 4 }}>
                  {optionValues.map(v => (
                    <button
                      key={v}
                      type="button"
                      className="ropt"
                      onClick={() => dispatch({
                        type: 'UNPLACEABLE_PICK',
                        questionId: q0.questionId,
                        value: v,
                        facts: interp.facts,
                        text: interp.text,
                        provenance: interp.provenance,
                      })}
                    >
                      <span className="ropt-dot" />
                      <span>{labels[v] ?? v}</span>
                    </button>
                  ))}
                </div>
              </div>
              <FactChips
                facts={interp.facts}
                droppedSensitive={interp.droppedSensitive}
                factEditIdx={state.factEditIdx}
                factEditVal={state.factEditVal}
                dispatch={dispatch}
              />
              <div className="demo-hint" style={{ marginTop: 20 }}>{UI.interp.simulatorNote}</div>
            </>
          }
        />
      </div>
    </>
  )
}
