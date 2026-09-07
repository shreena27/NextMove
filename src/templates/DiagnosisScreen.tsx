/** The shared Diagnosis template — port of the prototype's `renderDiagnosis`
 *  (design/nextmove-v1-prototype.html, lines 3581-3611), the one template
 *  all three services render through unmodified (implementation plan §1's
 *  central architectural claim, now made executable).
 *
 *  `freshBanner` (C6) is now built — see the `freshDegraded`/`freshChangedOn`
 *  props below, rendered between the `ciJustUpdated` banner and `phaseDrift`,
 *  the prototype's own order (renderDiagnosis, 3597-3600). The `phaseDrift`
 *  banner is Task 13's own (see the `phaseDrift` prop below). The `ciJustUpdated` undo banner
 *  and `updateEntry`'s "Add an update"
 *  button are Task 11's own (this commit) — see the `ciJustUpdated`/
 *  `ciSnapshot`/`onUndo`/`onUpdate` props below. The escalation ladder is
 *  still out of scope here (`renderLadder` is called only from
 *  `renderCasefile`, C5's Task 9 — never from here).
 *
 *  Government-process rules never live here — the only branching is
 *  structural: `d.dependency !== 'Unknown'` decides whether the "Waiting on"
 *  block shows (all three C2 UNCLASSIFIED fallbacks carry `dependency:
 *  'Unknown'`, so there is no separate UNCLASSIFIED branch), and
 *  `engineKey === 'passport'` decides whether a case trail is even computed
 *  (FR-V-10: fix-round-1 finding — `d.matchedAnswers` is a snapshot of the
 *  WHOLE session answer record, not just the current service's, since
 *  session answers are only cleared by RESTART, not by BACK/NAVIGATE; a
 *  stale `q1` left over from an earlier Passport attempt in the same
 *  session can otherwise satisfy `passportTrailFor`'s stage fallback for a
 *  Voter/SIR diagnosis that happens to carry it too). This is the same
 *  *structural* branching the plan's Global Constraints already permit
 *  ("does this service have a case trail?" vs. "what does this state
 *  mean?") — not a new exception. `preNote` is a generic ReactNode slot:
 *  SIR's phase banner and any future per-service context note both arrive
 *  through it exactly the same way, so there is no `if (service ===
 *  'sir')` anywhere in this file.
 */
import type { ReactNode } from 'react'
import type { Diagnosis } from '../domain/types'
import type { ServiceKey, ScreenId } from '../session/session'
import type { CiSnapshot } from '../session/cases'
import { PhaseEyebrow } from '../ui/Crumbs'
import { StatusStamp } from '../ui/StatusStamp'
import { Gems } from '../ui/Gems'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'
import { Banner } from '../ui/Banner'
import { TrustDisclosure } from './TrustDisclosure'
import { CaseTrail, passportTrailFor } from './CaseTrail'
import { UpdateEntry } from './UpdateEntry'
import { UI } from '../screens/screenCopy'

export interface DiagnosisScreenProps {
  serviceLabel: string
  /** The routing/storage prefix (ServiceEngine.key). Used to gate the case
   *  trail (Passport only — FR-V-10) and to build the CTA's next-move
   *  navigation target. Never rendered as text. */
  engineKey: ServiceKey
  d: Diagnosis
  /** Composite "questionId:value" -> label map for TrustDisclosure; build
   *  with `labelMap()` (src/screens/labels.ts). */
  answerLabels: Record<string, string>
  trustOpen: boolean
  onToggleTrust: () => void
  /** Rendered first, ahead of the diagnosis content (matching the
   *  prototype's own `topbar(true,true)` at the top of `renderDiagnosis`,
   *  line 3589). Optional and untyped further than `ReactNode`, symmetric
   *  with `preNote` — Task 7 supplies the real `<Topbar>` wired to session
   *  dispatch; this template has no `state`/`dispatch` of its own. */
  topbar?: ReactNode
  /** Generic per-service context note shown above the "Waiting on" block
   *  (design note 4) — e.g. SIR's phase banner. Passport and Voter pass
   *  nothing. */
  preNote?: ReactNode
  /** The Passport recovery echoes (design note 10), forwarded to
   *  TrustDisclosure untouched. */
  extraToldUs?: string
  /** Called with the engineKey-derived next-move screen id
   *  (`${engineKey}-nextmove`) when the CTA is pressed. Wiring this to an
   *  actual navigation dispatch is Task 7's job. */
  onNavigate?: (screen: ScreenId) => void

  // ---- Task 11 additions (design note 3). Every one of these five is
  // optional with an `undefined` default, so every pre-existing test above
  // (which passes none of them) renders BYTE-IDENTICAL output — the
  // PRE-CHANGE PIN in DiagnosisScreen.test.tsx pins exactly this. ----

  /** The ciJustUpdated undo banner (design note 3.1; prototype 3598).
   *  Rendered only when this AND `ciSnapshot` are both present — there must
   *  be something to undo, not merely a flag saying an update happened. */
  ciJustUpdated?: boolean
  ciSnapshot?: CiSnapshot | null
  /** Fires the reducer's CI_UNDO action. Wired for real in App.tsx (Task 13). */
  onUndo?: () => void
  /** The "Add an update" entry point (design note 3.5; prototype 3607) —
   *  gates whether `<UpdateEntry>` renders at all, same convention `topbar`
   *  already uses on this file. A dumb button: see UpdateEntry.tsx's own
   *  header note for why the routing decision does NOT live here. */
  onUpdate?: () => void

  /** Task 13's SIR phase-drift banner (prototype 3600; `SessionState.
   *  phaseDrift`). Optional with an `undefined` default, same convention as
   *  the Task 11 additions above: every pre-existing render call (none of
   *  which pass this) keeps rendering byte-identical output. Irrelevant to
   *  (and never true for) a non-SIR diagnosis. */
  phaseDrift?: boolean

  /** C6's freshBanner (prototype 3599, freshBanner(engineKey)) — computed
   *  by App.tsx (domain/freshness.ts's degradedFor/changedOnFor over this
   *  engine's playbook rules) and handed down as plain values, the same
   *  convention every other domain-derived prop on this file already uses
   *  (Diagnosis is always derived fresh at render time, never stored).
   *  Optional with an `undefined` default, so every pre-existing render
   *  call (none of which pass these) keeps rendering byte-identical
   *  output. `freshChangedOn` is only meaningful when `freshDegraded` is
   *  true; a false/undefined `freshDegraded` renders no banner regardless
   *  of what `freshChangedOn` holds. */
  freshDegraded?: boolean
  freshChangedOn?: string | null
}

export function DiagnosisScreen({
  serviceLabel,
  engineKey,
  d,
  answerLabels,
  trustOpen,
  onToggleTrust,
  topbar,
  preNote,
  extraToldUs,
  onNavigate,
  ciJustUpdated,
  ciSnapshot,
  onUndo,
  onUpdate,
  phaseDrift,
  freshDegraded,
  freshChangedOn,
}: DiagnosisScreenProps) {
  // The reveal headline gets the highlighter swipe on its key word — the
  // marker stroke lands where the answer is. UNCLASSIFIED gets no swipe:
  // nothing was "found," and the design shouldn't celebrate that.
  const headline: ReactNode =
    d.rec === 'UNCLASSIFIED' ? (
      UI.diagnosis.headlineUnclassified
    ) : (
      <>{UI.diagnosis.headlineFound} <span className="mark">{UI.diagnosis.headlineMark}</span>.</>
    )
  // Passport-only (FR-V-10) — gated on engineKey, not just on
  // passportTrailFor's own state-shape check, because d.matchedAnswers can
  // carry a stale q1 from an earlier Passport attempt in the same session
  // (see the file header note). Structural branching, not a
  // government-process one: "does this service have a case trail?"
  const trail = engineKey === 'passport' ? passportTrailFor(d) : null

  return (
    <>
      {topbar}
      <div className="stage screen">
        <Split
          left={
            <>
              {d.rec !== 'UNCLASSIFIED' ? <Gems placement="reveal" /> : null}
              <PhaseEyebrow service={serviceLabel} phase={UI.phase.diagnosis} />
              <h2 className="reveal-headline">{headline}</h2>
              <div className="stamp-row">
                <StatusStamp rec={d.rec} />
              </div>
              <p className="explain">{d.explanation}</p>
            </>
          }
          right={
            <>
              {/* Design note 3.1: the ciJustUpdated undo banner (prototype
                  3598) — rendered first, ahead of everything else in this
                  column, only when there is a real snapshot to undo. */}
              {ciJustUpdated && ciSnapshot ? (
                <Banner style={{ borderColor: 'var(--butter)', background: 'var(--butter-soft)' }}>
                  {UI.diagnosis.updateRecorded}
                  <button className="read-change" style={{ margin: '0 0 0 6px' }} onClick={onUndo}>
                    {UI.diagnosis.undoUpdate}
                  </button>
                </Banner>
              ) : null}
              {freshDegraded ? (
                <Banner>
                  <b>{UI.freshness.reverifiedLead}</b> {UI.freshness.reverifiedBody.replace('{date}', freshChangedOn ?? '')}
                </Banner>
              ) : null}
              {phaseDrift ? (
                <Banner>
                  <b>{UI.diagnosis.phaseDriftLead}</b> {UI.diagnosis.phaseDriftBody}
                </Banner>
              ) : null}
              {preNote}
              {d.dependency && d.dependency !== 'Unknown' ? (
                <div className="dep-block">
                  <div className="dep-k">{UI.diagnosis.waitingOn}</div>
                  <div className="dep-v">{d.dependency}</div>
                </div>
              ) : null}
              {trail ? <CaseTrail trail={trail} /> : null}
              <Button block arrow onClick={() => onNavigate?.(`${engineKey}-nextmove`)}>
                {UI.diagnosis.cta}
              </Button>
              {onUpdate ? <UpdateEntry onUpdate={onUpdate} /> : null}
              <TrustDisclosure
                d={d}
                answerLabels={answerLabels}
                extraToldUs={extraToldUs}
                open={trustOpen}
                onToggle={onToggleTrust}
              />
            </>
          }
        />
      </div>
    </>
  )
}
