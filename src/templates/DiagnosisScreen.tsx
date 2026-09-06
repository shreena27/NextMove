/** The shared Diagnosis template — port of the prototype's `renderDiagnosis`
 *  (design/nextmove-v1-prototype.html, lines 3581-3611), the one template
 *  all three services render through unmodified (implementation plan §1's
 *  central architectural claim, now made executable).
 *
 *  Deliberately NOT ported here (Out of Scope, later chunks): `freshBanner`
 *  (C6), the `ciJustUpdated` undo banner and `phaseDrift` banner (C5),
 *  `updateEntry`'s "Add an update" button (C5), and the escalation ladder
 *  (`renderLadder` is called only from `renderCasefile`, C5's — never from
 *  here).
 *
 *  Government-process rules never live here — the only branching is
 *  structural: `d.dependency !== 'Unknown'` decides whether the "Waiting on"
 *  block shows (all three C2 UNCLASSIFIED fallbacks carry `dependency:
 *  'Unknown'`, so there is no separate UNCLASSIFIED branch), and
 *  `passportTrailFor(d)` decides whether a case trail exists — it returns
 *  `null` for every non-Passport diagnosis on its own (see CaseTrail.tsx),
 *  so this file never compares a service name to decide that either.
 *  `preNote` is a generic ReactNode slot: SIR's phase banner and any future
 *  per-service context note both arrive through it exactly the same way, so
 *  there is no `if (service === 'sir')` anywhere in this file.
 */
import type { ReactNode } from 'react'
import type { Diagnosis } from '../domain/types'
import { PhaseEyebrow } from '../ui/Crumbs'
import { StatusStamp } from '../ui/StatusStamp'
import { Gems } from '../ui/Gems'
import { Split } from '../ui/Split'
import { Button } from '../ui/Button'
import { TrustDisclosure } from './TrustDisclosure'
import { CaseTrail, passportTrailFor } from './CaseTrail'

export interface DiagnosisScreenProps {
  serviceLabel: string
  /** The routing/storage prefix (ServiceEngine.key) — used only to build the
   *  CTA's next-move navigation target. Never rendered as text. */
  engineKey: string
  d: Diagnosis
  /** Composite "questionId:value" -> label map for TrustDisclosure; build
   *  with `labelMap()` (src/screens/labels.ts). */
  answerLabels: Record<string, string>
  trustOpen: boolean
  onToggleTrust: () => void
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
  onNavigate?: (screen: string) => void
}

export function DiagnosisScreen({
  serviceLabel,
  engineKey,
  d,
  answerLabels,
  trustOpen,
  onToggleTrust,
  preNote,
  extraToldUs,
  onNavigate,
}: DiagnosisScreenProps) {
  // The reveal headline gets the highlighter swipe on its key word — the
  // marker stroke lands where the answer is. UNCLASSIFIED gets no swipe:
  // nothing was "found," and the design shouldn't celebrate that.
  const headline: ReactNode =
    d.rec === 'UNCLASSIFIED' ? (
      "We don't have enough information to call this safely."
    ) : (
      <>We found where this is <span className="mark">waiting</span>.</>
    )
  const trail = passportTrailFor(d)

  return (
    <div className="stage screen">
      <Split
        left={
          <>
            {d.rec !== 'UNCLASSIFIED' ? <Gems placement="reveal" /> : null}
            <PhaseEyebrow service={serviceLabel} phase="Diagnosis" />
            <h2 className="reveal-headline">{headline}</h2>
            <div className="stamp-row">
              <StatusStamp rec={d.rec} />
            </div>
            <p className="explain">{d.explanation}</p>
          </>
        }
        right={
          <>
            {preNote}
            {d.dependency && d.dependency !== 'Unknown' ? (
              <div className="dep-block">
                <div className="dep-k">Waiting on</div>
                <div className="dep-v">{d.dependency}</div>
              </div>
            ) : null}
            {trail ? <CaseTrail trail={trail} /> : null}
            <Button block arrow onClick={() => onNavigate?.(`${engineKey}-nextmove`)}>
              See my next move
            </Button>
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
  )
}
