/** The "Prepare this for me" shell — port of the prototype's `renderPrepare`
 *  (design/nextmove-v1-prototype.html, lines 3746-3771ish, tag
 *  v1-design-lock-2): the crumb, headline, lede, trust line, and the
 *  official-channel card, plus (Task 4) the draft card and (Task 5) the
 *  step checklist, done note, in-person visit card, and closing control.
 *
 *  Props deliberately mirror `NextMoveScreen`'s shape (`{ serviceLabel,
 *  engineKey, d, ..., topbar?, dispatch? }`), with one difference: `prep:
 *  PrepPlan` is required and non-nullable. The prototype's own guard —
 *  `if(!prep){ restart(); return renderHome(); }` (3749) — exists because
 *  `renderPrepare` is called with only a `ruleId` and has to look the plan
 *  up itself. This component is never handed a ruleId; it is handed the
 *  plan already resolved, so "no plan for this rule" is a state the router
 *  (Task 6) filters out before construction, not a state this component
 *  can be in. Non-nullability is the type-safe form of the same guard.
 *
 *  DESIGN NOTE 1 (the C6 freshBanner seam): `freshBanner(engineKey)` is
 *  prototype line 3770 — the first child of the right column, before the
 *  channel card, the same position it takes on Diagnosis and Next Move.
 *  See the comment at that exact spot below.
 *
 *  DESIGN NOTE 2 (the C8 fillDraft middle branch is deliberately
 *  unbuilt, not stubbed): the prototype's `renderPrepare` composes a draft
 *  card with autofill-from-bracket parsing between the trust line and the
 *  checklist (3772 onward). Task 4 builds the draft textarea and the copy
 *  control, but NOT the fill-review panel: the prototype's `fillDraft()`
 *  (autofill from `S.caseFacts` into matching brackets) is not ported, so
 *  the draft is always the RAW template, and `bracketHintText`'s middle
 *  branch (`fills>0 && !S.fillsReviewed`) has no equivalent here — the
 *  hint below has exactly two branches, not three. That whole
 *  `S.caseFacts`/`.fill-list`/`.fill-review` mechanism is C8's.
 *
 *  DESIGN NOTE 2b (mechanism deviation, not a behaviour one): the
 *  prototype's `updateBracketHint` (3721-3723) patches `#bracket-hint`'s
 *  `textContent` directly because the prototype has no re-render on
 *  input. This component re-renders on every `setDraft`, so the hint is
 *  simply computed from `draft` during render — same behaviour, one fewer
 *  moving part (no `document.getElementById`).
 *
 *  DESIGN NOTE 2c (the Copy button's frozen count): the blank count shown
 *  on the Copy button is the count AT THE MOMENT OF COPYING, captured into
 *  `copied` state before the flash starts (prototype: `S.copiedBrackets =
 *  bracketCount(ta.value)`, 3741, captured before `S.copied=true`). If the
 *  citizen edits the draft during the 2200ms flash, the button keeps
 *  reporting what was true when they copied — it does not track the live
 *  count. `copied: number | null` carries both facts in one piece of
 *  state: `null` is idle, and any number (including 0) is "just copied,
 *  with this many blanks left at that moment."
 *
 *  DESIGN NOTE 3 (the C5 saveControl tail is deliberately absent): the
 *  prototype's full `renderPrepare` ends with a "Save this case" control
 *  (C5 scope). This screen ends at "Done, back to Home" (dispatches
 *  `RESTART`, prototype 3816) — there is no save/casefile element anywhere
 *  in this file, now or later in this chunk.
 *
 *  DESIGN NOTE 4 (`.channel-phone` is optional-by-data, not dead): the
 *  helpline row is conditional on `d.where.phone`, an optional field —
 *  not because it never renders (it does, today: `state-5a`'s real
 *  `where.phone` is `1800-258-1800`, a reachable FOLLOW_UP outcome), but
 *  because the field itself is optional. Do not "clean up" this branch if
 *  a future data change happens to leave phone-less rules as the only
 *  ones reachable — the branch is doing its job either way.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Diagnosis } from '../domain/types'
import type { ServiceKey, SessionAction } from '../session/session'
import { VISIT_EXPECT, type PrepPlan } from '../playbooks/prep'
import { PhaseEyebrow } from '../ui/Crumbs'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'
import { ICONS } from '../ui/icons'
import { UI } from '../screens/screenCopy'

/** [Bracketed] blanks are real sub-tasks ("find your ARN"), so they get
 *  counted and surfaced, live — never left as invisible work the citizen
 *  discovers after sending. Prototype 3699, verbatim. */
const bracketCount = (t: string) => (t.match(/\[[^\]]*\]/g) ?? []).length

/** The COPY FLASH duration (prototype 3742): how long the button keeps
 *  showing its "Copied…" state before reverting to idle. */
const COPY_FLASH_MS = 2200

export interface PrepareScreenProps {
  serviceLabel: string
  /** The routing/storage prefix (ServiceEngine.key). Kept for parity with
   *  `NextMoveScreen.engineKey` and for the real `freshBanner(engineKey)`
   *  call Task-C6 wires in at design note 1's seam — not read by this file
   *  today. Never rendered as text. */
  engineKey: ServiceKey
  d: Diagnosis
  /** The resolved prep plan for `d`'s matched rule. Required and
   *  non-nullable — see the file header note on why the prototype's
   *  `if(!prep)` guard has no equivalent here. */
  prep: PrepPlan
  /** Rendered first, matching the prototype's own `topbar(true,true)` at
   *  the top of `renderPrepare`, line 3762 — symmetric with
   *  `NextMoveScreen`'s and `DiagnosisScreen`'s own `topbar` slot. */
  topbar?: ReactNode
  /** Dispatches session actions. Unused by this shell (Task 3 has no
   *  button that dispatches); kept in the prop shape for parity with
   *  `NextMoveScreen` and for the checklist/"Done, back to Home" controls
   *  Task 5 adds. */
  dispatch?: (action: SessionAction) => void
}

export function PrepareScreen({
  serviceLabel,
  engineKey: _engineKey,
  d,
  prep,
  topbar,
  dispatch,
}: PrepareScreenProps) {
  // Local state only (this task's scope exclusion 2 — see the plan). Nothing
  // here goes into SessionState: the prototype uses S.prepDraft/S.copied
  // because it has one global object and no components; C5 is the chunk
  // with a reason (persistence) to lift this.
  const [draft, setDraft] = useState(prep.draft ?? '')
  // null = idle. Any number (0 included) = "just copied, this many blanks
  // were left AT THE MOMENT OF COPYING" — frozen, not live (design note 2c).
  const [copied, setCopied] = useState<number | null>(null)
  // Step ticks: local only, same reasoning as `draft`/`copied` above. The
  // prototype's `togglePrepStep` (3685-3695) also syncs an active casefile
  // and re-renders — that part is C5's (activeCase()/caseSnapshot()/
  // persistCases()) and must not appear here in any form (design note 1).
  const [checks, setChecks] = useState<boolean[]>(() => prep.steps.map(() => false))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Cleared on unmount so a flash mid-flight never calls setState on a
    // dead component.
    return () => {
      if (flashTimer.current !== undefined) clearTimeout(flashTimer.current)
    }
  }, [])

  const handleCopy = () => {
    // The copy always succeeds — remaining blanks are named, not policed
    // (prototype 3740's own comment). Never disabled, never blocked.
    const n = bracketCount(draft)
    const flash = () => {
      setCopied(n)
      if (flashTimer.current !== undefined) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setCopied(null), COPY_FLASH_MS)
    }
    const fallback = () => {
      // navigator.clipboard.writeText isn't implemented in jsdom, and
      // navigator.clipboard may be undefined entirely — the same fallback
      // the prototype uses on rejection or throw (design note 5).
      textareaRef.current?.select()
    }
    try {
      navigator.clipboard.writeText(draft).then(flash, fallback)
    } catch {
      fallback()
    }
  }

  const toggleStep = (i: number) => {
    setChecks(prev => prev.map((c, idx) => (idx === i ? !c : c)))
  }
  const done = checks.filter(Boolean).length

  const liveBlanks = bracketCount(draft)
  const hint =
    liveBlanks > 0
      ? (liveBlanks === 1 ? UI.prepare.hintOne : UI.prepare.hintMany).replace('{n}', String(liveBlanks))
      : UI.prepare.hintReady

  const copyLabel =
    copied === null
      ? UI.prepare.copy
      : copied === 0
        ? UI.prepare.copied
        : (copied === 1 ? UI.prepare.copiedOne : UI.prepare.copiedMany).replace('{n}', String(copied))
  const copyClass =
    copied === null ? 'copy-btn' : copied === 0 ? 'copy-btn copied' : 'copy-btn copied-warn'

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <PhaseEyebrow service={`${serviceLabel} · ${d.label}`} phase={UI.phase.prepare} />
              <h1 className="headline">{prep.title ?? UI.prepare.headlineFallback}</h1>
              <p className="lede">{prep.draft ? UI.prepare.ledeDraft : UI.prepare.ledeSteps}</p>
              <p className="prep-trust">{UI.prepare.trust}</p>
            </>
          }
          right={
            <>
              {/* DESIGN NOTE 1: freshBanner(engineKey) (prototype 3770)
                  slots in here, first child of the right column, before
                  the channel card — Task C6's seam, same position it
                  takes on Diagnosis and Next Move. */}
              <div className="channel-card">
                <div className="channel-body">
                  <div className="channel-k">{UI.prepare.channelK}</div>
                  <div className="channel-v">{d.where.label}</div>
                  {d.where.phone ? (
                    <div className="channel-phone">
                      {UI.prepare.channelPhone.replace('{phone}', d.where.phone)}
                    </div>
                  ) : null}
                </div>
                {d.where.url ? (
                  <a className="channel-open" href={d.where.url} target="_blank" rel="noopener">
                    {UI.prepare.channelOpen}
                  </a>
                ) : null}
              </div>
              {prep.draft ? (
                <div className="prep-card">
                  {/* .nm-k, not a new .prep-k — this file's design note 8:
                      the lifted CSS (Task 2) defines no .prep-k, and the
                      inline margin is the prototype's own (3773), not a
                      new rule. */}
                  <div className="nm-k" style={{ marginBottom: 10 }}>{UI.prepare.draftK}</div>
                  <textarea
                    ref={textareaRef}
                    className="prep-draft"
                    aria-label={UI.prepare.draftAria}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                  />
                  <div className="prep-card-foot">
                    <div className="prep-hint">{hint}</div>
                    <button className={copyClass} onClick={handleCopy}>
                      {copyLabel}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="psteps-count">
                {UI.prepare.stepsCount
                  .replace('{done}', String(done))
                  .replace('{total}', String(prep.steps.length))}
              </div>
              <div className="psteps">
                {prep.steps.map((s, i) => {
                  const step = typeof s === 'string' ? { text: s } : s
                  const checked = checks[i]
                  return (
                    <div key={i} className={`pstep${checked ? ' done' : ''}`}>
                      <button
                        className="pstep-tick"
                        aria-pressed={checked}
                        onClick={() => toggleStep(i)}
                      >
                        {/* DESIGN NOTE (icon always in the DOM): the CSS
                            (.pstep-box svg{opacity:0} / .pstep.done
                            .pstep-box svg{opacity:1}) does the showing —
                            never conditionally rendered. */}
                        <span className="pstep-box">{ICONS.stepCheck}</span>
                        <span className="pstep-text">{step.text}</span>
                      </button>
                      {/* DESIGN NOTE (link is a SIBLING, not nested): an <a>
                          inside a <button> is invalid HTML and breaks
                          keyboard reachability of the link. */}
                      {'url' in step ? (
                        <a className="pstep-link" href={step.url} target="_blank" rel="noopener">
                          {UI.prepare.stepOpen}
                        </a>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              {done === prep.steps.length ? (
                <p className="psteps-done">{prep.doneNote ?? UI.prepare.doneNoteFallback}</p>
              ) : null}
              {prep.visit ? (
                <div className="visit-card">
                  <div className="visit-title">{UI.prepare.visitTitle}</div>
                  <div className="visit-cols">
                    <div>
                      <div className="visit-k">{UI.prepare.visitCarry}</div>
                      <ul className="visit-list">
                        {prep.visit.carry.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="visit-k">{UI.prepare.visitExpect}</div>
                      <ul className="visit-list">
                        {VISIT_EXPECT.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {prep.visit.after ? (
                    <>
                      {/* DESIGN NOTE: reuses .visit-k with the prototype's
                          own inline margin-top (3813) — not a new
                          .visit-k-then class; that would be restyling a
                          locked design. */}
                      <div className="visit-k" style={{ marginTop: 14 }}>
                        {UI.prepare.visitThen}
                      </div>
                      <ul className="visit-list">
                        <li>{prep.visit.after}</li>
                      </ul>
                    </>
                  ) : null}
                  <div className="visit-note">{UI.prepare.visitNote}</div>
                </div>
              ) : null}
              {/* DESIGN NOTE 3 (file header): no saveControl tail — this is
                  the last control on the screen in C4. */}
              <Button variant="secondary" block onClick={() => dispatch?.({ type: 'RESTART' })}>
                {UI.prepare.doneBackHome}
              </Button>
            </>
          }
        />
      </div>
    </>
  )
}
