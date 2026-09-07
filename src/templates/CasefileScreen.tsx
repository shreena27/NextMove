/** The casefile screen — port of the prototype's `renderCheckin` (design/
 *  nextmove-v1-prototype.html, lines 2830-2970, tag v1-design-lock-2).
 *
 *  Per the compact-card spec, this screen IS the case's home: "No fifth
 *  surface: the check-in screen becomes the case's home." It composes
 *  nearly everything C5 has built so far (`StatusStamp`, `CaseTrail`,
 *  `CaseProgress`, `EscalationLadder`, `JourneyLog`, `SaveControl`) into two
 *  structural variants — open (`case.outcome === 'still_open'`) and closed
 *  (anything else) — never a government-process branch, only "is this case
 *  open or closed? saved or working? does this diagnosis have a prep plan?
 *  does this service have a ladder?" (Global Constraints).
 *
 *  `case`/`d` mirror `PrepareScreen`'s `prep` — REQUIRED and non-nullable.
 *  The prototype's own guard (`if(!c){ restart(); return renderHome(); }`,
 *  2832) has no equivalent here: Task 13's router resolves the active case
 *  before construction (reusing `App.tsx`'s existing `RestartToHome`
 *  component, the same seam `PrepareScreen`'s missing-plan guard reuses),
 *  the same way "no plan for this rule" is a state `PrepareScreen` cannot be
 *  in. `d` is the diagnosis recomputed from the SESSION's live answers
 *  (`diagnose(ENGINES[case.engineKey], state.answers)`) — supplied by the
 *  caller, exactly as every other screen in this codebase receives `d`
 *  pre-resolved rather than computing it internally. FIX WAVE (2026-09-06,
 *  whole-branch final review, Critical finding 1): this was previously
 *  computed from `case.answers` (the case's last-stored snapshot), which
 *  could diverge from `state.answers` after an answer change followed by
 *  Back navigation — see `App.tsx`'s `'checkin'` case and `session/cases.ts`'s
 *  `ciChoose` for the full mechanism. `answers` (new prop, same fix) is the
 *  same `state.answers` value, threaded through for `<EscalationLadder>`
 *  (see the `answers` prop's own doc comment below) for the identical reason.
 *
 *  `prepChecks` is `SessionState.prepChecks` (the LIVE, in-progress copy),
 *  not `case.prepChecks` (the last-saved snapshot) — the same distinction
 *  `CaseProgress.tsx` already draws by taking `prepChecks` as its own
 *  separate prop rather than reading it off a `case`. They are kept in sync
 *  by `openCheckin`/`beginWorkingCheckin`/`loadCase` (session/cases.ts)
 *  whenever a case becomes active, so in practice they agree; the
 *  distinction only matters architecturally (this component never reaches
 *  into a `Casefile` for interaction-in-progress state).
 *
 *  Every `CI_*`/`REOPEN_CASE`/`REMOVE_SAVED`/`SET_REMIND`/`TOGGLE_LOG`/
 *  `SET_REMOVE_CONFIRM`/`SET_REMINDER_COPIED`/`BEGIN_SAVE`/`NAVIGATE` action
 *  this screen can fire is constructed inline against a single `dispatch`
 *  prop — the same shape `PrepareScreen`/`NextMoveScreen` already use for
 *  `RESTART`, just with more actions, because this screen has more to do.
 *  There is no separate `onNavigate`: `.case-links`' two navigations go
 *  through the same `dispatch` as everything else on this screen.
 *
 *  DESIGN NOTE 1 (C6's freshBanner and Task 13's phaseDrift module, both
 *  now built): `freshBanner` (see the `freshDegraded`/`freshChangedOn`
 *  props) is the first child of the right column, same position it takes
 *  on Diagnosis/NextMove/Prepare. The phase-drift MODULE (the
 *  prototype's `S.phaseDrift` branch, 2921-2931) is built below: when
 *  `phaseDrift` is true, it REPLACES the whole `.update-mod` — same shell
 *  (`border-color:var(--line-strong)`), its own kicker/title/body and a
 *  single primary CTA that clears `phaseDrift` and navigates to `'sir-q1'`
 *  (`PHASE_DRIFT_RECHECK`, session.ts) — so no option row and no remind row
 *  are reachable while a SIR case's stamped phase has drifted from the live
 *  config ("before any update" mechanically means "before any options are
 *  offered").
 *
 *  DESIGN NOTE 2 (the `pickedEcho` line is NOT rendered on the reassure
 *  panel — a literal-transcription call, not the brief's own paraphrase).
 *  The prototype's `pickedEcho` constant is computed once
 *  (`opt ? ... : ''`) and spliced into the confirm/valence/closureq panel
 *  template strings, but the reassure panel's own template string never
 *  references it at all (2866-2872). This is not a meaningful omission:
 *  `ciChoose`'s 'nothing' branch (the only path to `ciReassure`) clears
 *  `ciPending` to `null` in the SAME state update that sets
 *  `ciReassure=true` (session/cases.ts), so `opt`/`ciPending` is always
 *  `null` by the time the reassure panel would render, and `pickedEcho`
 *  would evaluate to nothing anyway. Rendered output is identical either
 *  way; this file follows the literal code structure.
 *
 *  DESIGN NOTE 3 (SaveControl's `savedCases`/`answers`). The tail's
 *  `<SaveControl>` needs them to compute `caseIsSaved` (SaveControl.tsx's
 *  own header note) — `savedCases` is threaded through as its own prop
 *  (`SessionState.savedCases`), `answers` is `case.answers`.
 *
 *  DESIGN NOTE 4 (`.case-links`' navigation targets are cast, not narrowed).
 *  `` `${c.engineKey}-diagnosis` `` and `` `${c.engineKey}-prepare` `` are
 *  provably valid `ScreenId` members for all three services (session.ts's
 *  own union), but a template literal over a 3-value union widens to plain
 *  `string` at the type level — the same reason `session.ts`'s own
 *  `navigateTo as ScreenId` casts exist. Cast, with this note as the record. */
import type { ReactNode, CSSProperties } from 'react'
import type { AnswerRecord, Diagnosis } from '../domain/types'
import type { Casefile } from '../domain/casefile'
import { CLOSED_TITLE, DELIVERABLE_Q, checkinOptionsFor, type CheckinOption } from '../domain/checkinOptions'
import type { ScreenId, SessionAction } from '../session/session'
import type { CiSnapshot } from '../session/cases'
import { prepPlanFor } from '../playbooks/prep'
import { Crumbs } from '../ui/Crumbs'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'
import { StatusStamp } from '../ui/StatusStamp'
import { ICONS } from '../ui/icons'
import { SERVICE_SQ } from '../ui/serviceSquare'
import { fmtDay, fmtRemind } from '../ui/dates'
import { CaseTrail, passportTrailFor } from './CaseTrail'
import { CaseProgress } from './CaseProgress'
import { EscalationLadder } from './EscalationLadder'
import { JourneyLog } from './JourneyLog'
import { SaveControl } from './SaveControl'
import { Banner } from '../ui/Banner'
import { UI } from '../screens/screenCopy'

/** The COPY FLASH duration (prototype 3742, reused by copyReminder at
 *  3728-3730) — how long the Copy button keeps showing "Copied" before
 *  reverting. Same value C4's `PrepareScreen` uses. */
const COPY_FLASH_MS = 2200

export interface CasefileScreenProps {
  /** Required and non-nullable — see the file header note. */
  case: Casefile
  /** The diagnosis recomputed from `state.answers` — see the file header. */
  d: Diagnosis
  /** `SessionState.answers` — the session's LIVE answers, not `case.answers`
   *  (the case's last-stored snapshot). FIX WAVE (2026-09-06, whole-branch
   *  final review, Critical finding 1): the prototype's `renderLadder` reads
   *  `S.answers` directly (design/nextmove-v1-prototype.html, 2793), never
   *  the case's own stored answers, so `<EscalationLadder>` below is wired
   *  to this prop, not `case.answers` — matching `d` above, which the router
   *  (App.tsx) now also derives from `state.answers` rather than
   *  `case.answers`, closing a divergence where the two could disagree
   *  after an answer change followed by Back navigation (see cases.ts's own
   *  `ciChoose` and caseStore.ts's migration fix, same review finding). */
  answers: AnswerRecord
  /** `SessionState.prepChecks` (the live copy) — see the file header. */
  prepChecks: Record<number, boolean>
  /** `SessionState.savedCases` — threaded through to `<SaveControl>` only
   *  (design note 3). */
  savedCases: Casefile[]
  /** D6: the injected clock every timestamped action carries. */
  now: number
  ciPending: CheckinOption | null
  ciPendingIdx: number | null
  ciStage: 'confirm' | 'valence' | 'closureq' | null
  ciReassure: boolean
  ciSnapshot: CiSnapshot | null
  ciConsecutive: boolean
  /** `SessionState.phaseDrift` (Task 13) — see the file header note. Gates
   *  the whole `.update-mod` between the phase-drift interstitial and the
   *  ordinary "Add an update" module; irrelevant to (and never set for) a
   *  non-SIR case. */
  phaseDrift: boolean
  /** C6's freshBanner (prototype 2924) — computed by App.tsx
   *  (domain/freshness.ts's degradedFor/changedOnFor over this case's
   *  engine's playbook rules), same App.tsx-computed convention as `d`
   *  itself. Required, not optional, matching every other domain-derived
   *  prop on this file (`d`, `phaseDrift`) — this file has no history of
   *  optional-prop-added-later evolution the way Diagnosis/NextMove/
   *  Prepare do, so there is no byte-identical-old-tests concern to
   *  preserve here. */
  freshDegraded: boolean
  freshChangedOn: string | null
  /** `SessionState.reminderCopied` — SESSION state, not component-local
   *  `useState` the way `PrepareScreen`'s `copied` is (session/cases.ts's
   *  own `setReminderCopied` doc comment: this screen is reducer-driven,
   *  not its own standalone component the way `PrepareScreen` is, so the
   *  flash flag is cleared by RESTART like every other transient field
   *  rather than resetting on unmount). */
  reminderCopied: boolean
  logOpen: Record<string, boolean>
  removeConfirm: string | null
  /** Rendered first, matching the prototype's own `topbar(true,false)` at
   *  the top of both `renderCheckin` variants (2885, 2903). */
  topbar?: ReactNode
  dispatch?: (action: SessionAction) => void
}

export function CasefileScreen({
  case: c,
  d,
  answers,
  prepChecks,
  savedCases,
  now,
  ciPending,
  ciPendingIdx,
  ciStage,
  ciReassure,
  ciSnapshot,
  ciConsecutive,
  phaseDrift,
  freshDegraded,
  freshChangedOn,
  reminderCopied,
  logOpen,
  removeConfirm,
  topbar,
  dispatch,
}: CasefileScreenProps) {
  const sqClass = SERVICE_SQ[c.serviceLabel] ?? null

  const journeyHeading = (c.log.length === 1 ? UI.casefile.journeyOne : UI.casefile.journeyMany)
    .replace('{n}', String(c.log.length))

  // The remove control (design note 9, prototype 2879-2883) — shared by
  // both variants. `Yes` folds `screen:'home', history:[]` into the SAME
  // REMOVE_SAVED dispatch (session.ts's own reducer arm, prototype 2881) so
  // the citizen is never left on a dead case's screen.
  const removeCtl =
    removeConfirm === c.id ? (
      <span className="restart-confirm" style={{ marginTop: 18, display: 'inline-flex' }}>
        {UI.casefile.removePrompt}
        <button className="yes" onClick={() => dispatch?.({ type: 'REMOVE_SAVED', id: c.id })}>
          {UI.casefile.removeYes}
        </button>
        <button className="no" onClick={() => dispatch?.({ type: 'SET_REMOVE_CONFIRM', id: null })}>
          {UI.casefile.cancel}
        </button>
      </span>
    ) : (
      <button className="case-remove" onClick={() => dispatch?.({ type: 'SET_REMOVE_CONFIRM', id: c.id })}>
        {UI.casefile.removeButton}
      </button>
    )

  // -------------------------------------------------------------------
  // Closed variant (design note 2, prototype 2884-2901). No check-in
  // machinery of any kind — no update module, no option rows, no remind
  // row (asserted absent in CasefileScreen.test.tsx via its shared SEL,
  // against the SAME query strings the open variant asserts present with).
  // -------------------------------------------------------------------
  if (c.outcome !== 'still_open') {
    const gotIt = c.outcome === 'deliverable_received'
    // Task 5 (D3): a superseded case's headline must not claim "unresolved"
    // (false — it was set aside, never exhausted) or "got it" (also false).
    const superseded = c.outcome === 'superseded'
    const headline = gotIt
      ? UI.casefile.closedGotItHeadline
      : superseded ? UI.casefile.closedSupersededHeadline : UI.casefile.closedUnresolvedHeadline
    // Task 5 (D5) — the server-side mirror of casefiles_one_open_per_service
    // (Task 2's partial unique index, on (user_id, engine_key) where
    // outcome = 'still_open'): session/cases.ts's reopenCase returns null
    // under this SAME condition, because Postgres would reject that write.
    // The reopen control renders only when reopening is actually possible —
    // the same shape SaveControl already uses for caseIsSaved (render the
    // note instead of the button) — no replacement copy: the control is
    // simply absent.
    const canReopen = !savedCases.some(
      x => x.id !== c.id && x.engineKey === c.engineKey && x.outcome === 'still_open',
    )
    return (
      <>
        {topbar}
        <div className="stage screen">
          <Split
            left={
              <>
                <Crumbs
                  parts={[
                    `${c.serviceLabel} · ${gotIt ? (CLOSED_TITLE[c.engineKey] ?? c.stateLabel) : c.stateLabel}`,
                    UI.casefile.yourCasefile,
                  ]}
                  sqClass={sqClass}
                />
                <h1 className="case-h1">{headline}</h1>
                <p className="lede">{UI.casefile.closedLede}</p>
                <div className="case-meta-line">
                  {UI.casefile.metaSaved.replace('{day}', fmtDay(c.savedAt))}
                  {c.closedAt ? UI.casefile.metaClosedSuffix.replace('{date}', fmtDay(c.closedAt)) : ''}
                </div>
              </>
            }
            right={
              <>
                <div className="nm-k" style={{ margin: '0 0 4px' }}>{journeyHeading}</div>
                <JourneyLog case={c} logOpen={logOpen} onShowAll={() => dispatch?.({ type: 'TOGGLE_LOG', caseId: c.id })} />
                {canReopen ? (
                  <div className="case-links">
                    <button className="case-link" onClick={() => dispatch?.({ type: 'REOPEN_CASE', id: c.id, now })}>
                      {UI.casefile.reopen}
                      <span className="arow-chevron" style={{ marginLeft: 'auto' }}>{ICONS.chevron}</span>
                    </button>
                  </div>
                ) : null}
                {removeCtl}
              </>
            }
          />
        </div>
      </>
    )
  }

  // -------------------------------------------------------------------
  // Open variant (design note 3, prototype 2902-2969).
  // -------------------------------------------------------------------
  const trail = c.engineKey === 'passport' ? passportTrailFor(d) : null
  const prep = prepPlanFor(d) ?? null
  const list = checkinOptionsFor(d, prepChecks, c.engineKey)

  const pickedEcho = ciPending ? (
    <p className="small" style={{ margin: '0 0 8px', color: 'var(--ink-soft)' }}>
      {UI.casefile.pickedEcho} <b>{ciPending.label}</b>
    </p>
  ) : null

  let panelNode: ReactNode = null
  if (ciStage === 'confirm' && ciPending) {
    const opt = ciPending
    panelNode = (
      <div className="ci-panel">
        {pickedEcho}
        <p className="small" style={{ margin: '0 0 12px' }}>
          <b>{UI.casefile.confirmQ}</b> {UI.casefile.confirmBody}
          {opt.k === 'action' || opt.k === 'event' ? UI.casefile.confirmDiagnosisClause : ''}.
        </p>
        <div className="inline-explain-actions" style={{ margin: 0 }}>
          <Button style={{ width: 'auto' }} onClick={() => dispatch?.({ type: 'CI_CONFIRM', now })}>
            {UI.casefile.confirmYes}
          </Button>
          <Button variant="secondary" onClick={() => dispatch?.({ type: 'CI_CANCEL' })}>
            {UI.casefile.cancel}
          </Button>
        </div>
      </div>
    )
  } else if (ciStage === 'valence' && ciPending) {
    panelNode = (
      <div className="ci-panel">
        {pickedEcho}
        <p className="small" style={{ margin: '0 0 12px' }}><b>{UI.casefile.valenceQ}</b></p>
        <div className="inline-explain-actions" style={{ margin: 0 }}>
          <Button variant="secondary" onClick={() => dispatch?.({ type: 'CI_VALENCE', accepted: true, now })}>
            {UI.casefile.favour}
          </Button>
          <Button variant="secondary" onClick={() => dispatch?.({ type: 'CI_VALENCE', accepted: false, now })}>
            {UI.casefile.against}
          </Button>
          <button className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={() => dispatch?.({ type: 'CI_CANCEL' })}>
            {UI.casefile.cancel}
          </button>
        </div>
      </div>
    )
  } else if (ciStage === 'closureq' && ciPending) {
    panelNode = (
      <div className="ci-panel">
        {pickedEcho}
        <p className="small" style={{ margin: '0 0 12px' }}><b>{DELIVERABLE_Q[c.engineKey]}</b></p>
        <div className="inline-explain-actions" style={{ margin: 0 }}>
          <Button style={{ width: 'auto' }} onClick={() => dispatch?.({ type: 'CI_CLOSURE', gotIt: true, now })}>
            {UI.casefile.closureYes}
          </Button>
          <Button variant="secondary" onClick={() => dispatch?.({ type: 'CI_CLOSURE', gotIt: false, now })}>
            {UI.casefile.closureNotYet}
          </Button>
        </div>
      </div>
    )
  } else if (ciReassure) {
    // Design note 2: no pickedEcho here — see the file header.
    panelNode = (
      <div className="ci-panel reassure">
        <p className="small" style={{ margin: '0 0 10px' }}><b>{UI.casefile.reassureLead}</b></p>
        {d.howLong ? <p className="small" style={{ margin: '0 0 8px' }}>{d.howLong}</p> : null}
        {d.expectNext ? <p className="small" style={{ margin: 0 }}>{d.expectNext}</p> : null}
        {ciConsecutive ? (
          <p className="small" style={{ margin: '10px 0 0', color: 'var(--ink-faint)' }}>
            {UI.casefile.reassureConsecutive}
          </p>
        ) : null}
        {ciSnapshot ? (
          <button className="read-change" style={{ marginTop: 8 }} onClick={() => dispatch?.({ type: 'CI_UNDO' })}>
            {UI.casefile.undoButton}
          </button>
        ) : null}
      </div>
    )
  }

  const reminderText = c.remindAt ? UI.casefile.reminderText.replace('{date}', fmtRemind(c.remindAt)) : ''

  const copyReminder = (text: string) => {
    // Same clipboard-then-fallback shape C4's PrepareScreen `handleCopy`
    // already built (design note 6 of the task brief) — try / .then(flash,
    // fallback) / catch, with a 2200ms flash. The fallback differs: a
    // TEMPORARY textarea (prototype copyReminder, 3728-3730), not selecting
    // a persistent field, since there is no persistent draft field here.
    // `reminderCopied` is SESSION state (see this file's own prop doc
    // comment), so `flash`/the revert both dispatch SET_REMINDER_COPIED
    // rather than calling a local setState.
    const flash = () => {
      dispatch?.({ type: 'SET_REMINDER_COPIED', value: true })
      setTimeout(() => dispatch?.({ type: 'SET_REMINDER_COPIED', value: false }), COPY_FLASH_MS)
    }
    const fallback = () => {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      // Matches the prototype's own try/catch around execCommand — a
      // rejection here is silent (no flash), exactly like the source.
      try {
        document.execCommand('copy')
        flash()
      } catch {
        /* silent, matching the prototype's own empty catch */
      }
      document.body.removeChild(ta)
    }
    try {
      navigator.clipboard.writeText(text).then(flash, fallback)
    } catch {
      fallback()
    }
  }

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              <Crumbs parts={[c.serviceLabel, UI.casefile.yourCasefile]} sqClass={sqClass} />
              <h1 className="case-h1">{d.label}</h1>
              <div className="stamp-row"><StatusStamp rec={d.rec} /></div>
              <div className="case-meta-line">
                {(c.unsaved ? UI.casefile.metaStarted : UI.casefile.metaSaved).replace('{day}', fmtDay(c.savedAt))}
                {c.remindAt ? UI.casefile.metaCheckBackSuffix.replace('{date}', fmtRemind(c.remindAt)) : ''}
              </div>
              {trail ? <CaseTrail trail={trail} /> : null}
              <CaseProgress prep={prep} prepChecks={prepChecks} />
              <EscalationLadder engineKey={c.engineKey} d={d} answers={answers} />
              <div className="nm-k" style={{ margin: '24px 0 4px' }}>{journeyHeading}</div>
              <JourneyLog case={c} logOpen={logOpen} onShowAll={() => dispatch?.({ type: 'TOGGLE_LOG', caseId: c.id })} />
            </>
          }
          right={
            <>
              {freshDegraded ? (
                <Banner>
                  <b>{UI.freshness.reverifiedLead}</b> {UI.freshness.reverifiedBody.replace('{date}', freshChangedOn ?? '')}
                </Banner>
              ) : null}
              {phaseDrift ? (
                <div className="update-mod" style={{ borderColor: 'var(--line-strong)' }}>
                  <div className="um-head">
                    <span className="dr-icon">{ICONS.pen}</span>
                    <span>
                      <span className="um-kicker">{UI.casefile.phaseDriftKicker}</span>
                      <h2 className="um-title">{UI.casefile.phaseDriftTitle}</h2>
                    </span>
                  </div>
                  <p className="small" style={{ margin: '0 0 14px' }}>{UI.casefile.phaseDriftBody}</p>
                  <Button block arrow style={{ marginTop: 0 }} onClick={() => dispatch?.({ type: 'PHASE_DRIFT_RECHECK' })}>
                    {UI.casefile.phaseDriftCta}
                  </Button>
                </div>
              ) : (
                <div className="update-mod">
                  <div className="um-head">
                    <span className="dr-icon">{ICONS.pen}</span>
                    <span>
                      <span className="um-kicker">{UI.casefile.addUpdateKicker}</span>
                      <h2 className="um-title">{UI.casefile.whatsHappenedTitle}</h2>
                    </span>
                  </div>
                  <p className="small" style={{ margin: '0 0 6px' }}>{UI.casefile.addUpdateLede}</p>
                  {panelNode ? <div style={{ marginTop: 14 }}>{panelNode}</div> : null}
                  <div className="answers" style={{ marginTop: panelNode ? '14px' : '8px' }}>
                    {list.map((o, i) => {
                      // The picked row is the ONLY filled check while a
                      // follow-up panel is open; the deliverable option gets
                      // a butter RING — its old solid fill read as an
                      // already-selected radio (prototype's own comment).
                      const picked = ciPending !== null && ciPendingIdx === i
                      const checkStyle: CSSProperties = picked
                        ? { background: 'var(--butter)', borderColor: 'var(--ink)' }
                        : o.k === 'deliverable'
                          ? { border: '2px solid var(--butter-deep)' }
                          : {}
                      return (
                        <button
                          className="arow"
                          key={i}
                          onClick={() => dispatch?.({ type: 'CI_CHOOSE', index: i, now })}
                          // Not a radio: each option OPENS A PANEL rather than
                          // selecting a value from a set (design note 19 of
                          // the task brief) — aria-current honestly describes
                          // "this is the row the open panel refers to".
                          aria-current={picked ? 'true' : undefined}
                        >
                          <span className="arow-check" style={checkStyle} />
                          <span className="arow-body">
                            <div className="arow-label" style={picked ? { fontWeight: 600 } : undefined}>{o.label}</div>
                          </span>
                          <span className="arow-chevron">{ICONS.chevron}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="remind-row">
                    <span className="small">{UI.casefile.remindPrompt}</span>
                    {/* The spec's hard rule: no default, no placeholder date,
                        no min, no suggested value of any kind (design note 6
                        of the task brief) — a user-picked date, never an
                        invented timeline. */}
                    <input
                      type="date"
                      className="remind-input"
                      aria-label={UI.casefile.checkBackAria}
                      value={c.remindAt ?? ''}
                      onChange={e => dispatch?.({ type: 'SET_REMIND', value: e.target.value })}
                    />
                  </div>
                  {c.remindAt ? (
                    <p className="small" style={{ marginTop: 6 }}>
                      {UI.casefile.remindLead} <b>{reminderText}</b>
                      <button className="read-change" style={{ marginLeft: 8 }} onClick={() => copyReminder(reminderText)}>
                        {reminderCopied ? UI.casefile.copiedLabel : UI.casefile.copyLabel}
                      </button>
                    </p>
                  ) : null}
                </div>
              )}
              <div className="case-links">
                <button
                  className="case-link"
                  // Design note 4: cast, see the file header.
                  onClick={() => dispatch?.({ type: 'NAVIGATE', screen: `${c.engineKey}-diagnosis` as ScreenId })}
                >
                  {UI.casefile.diagnosisLink}
                  <span className="arow-chevron" style={{ marginLeft: 'auto' }}>{ICONS.chevron}</span>
                </button>
                {prep ? (
                  <button
                    className="case-link"
                    onClick={() => dispatch?.({ type: 'NAVIGATE', screen: `${c.engineKey}-prepare` as ScreenId })}
                  >
                    {UI.casefile.prepareLink}
                    <span className="arow-chevron" style={{ marginLeft: 'auto' }}>{ICONS.chevron}</span>
                  </button>
                ) : null}
              </div>
              {c.unsaved ? (
                <>
                  <div className="small" style={{ marginTop: 18, color: 'var(--ink-soft)' }}>
                    {UI.casefile.livesOnlyNote}
                  </div>
                  <SaveControl
                    engineKey={c.engineKey}
                    // The prototype passes a LITERAL 0 here (2966), not the
                    // real ticked count — transcribed as-is, not "improved".
                    stepsDone={0}
                    savedCases={savedCases}
                    answers={c.answers}
                    onSave={() =>
                      dispatch?.({
                        type: 'BEGIN_SAVE',
                        engineKey: c.engineKey,
                        serviceLabel: c.serviceLabel,
                        // Design note 4: cast, see the file header (same
                        // layering reason as Casefile.returnScreen's own
                        // string type).
                        returnScreen: c.returnScreen as ScreenId,
                        now,
                      })
                    }
                  />
                </>
              ) : (
                removeCtl
              )}
            </>
          }
        />
      </div>
    </>
  )
}

// DESIGN NOTE (no unmount cleanup for the copy-reminder flash timer, unlike
// `PrepareScreen`'s own `useEffect` cleanup for `copyDraft`'s timer):
// `reminderCopied` is SESSION state (see this file's own prop doc comment),
// not component-local `useState` — the pending `setTimeout` dispatches a
// plain `SET_REMINDER_COPIED` action into the reducer, which is a no-op
// after unmount, not a "setState on a dead component" warning. There is
// nothing here for an effect cleanup to protect against.
