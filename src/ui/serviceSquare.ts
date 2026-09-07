/** `SERVICE_SQ` — Teak's marker-square device (design/nextmove-v1-prototype.
 *  html, tag v1-design-lock-2, lines 2310-2312): every crumb strip and every
 *  Home casefile card leads with the owning service's coloured square.
 *
 *  MOVED OUT of `Crumbs.tsx` on purpose (Task 8 design note 1). `Crumbs.tsx`
 *  declared this map privately, but `CaseCard` (src/templates/CaseCard.tsx)
 *  needs it too, and `Crumbs.tsx` exports components — exporting a plain
 *  data map alongside them would trip oxlint's react(only-export-components)
 *  Fast Refresh rule and add a 5th warning beyond the 4 this project's
 *  baseline forbids. This module is plain data, no JSX, no component, so the
 *  rule never applies to it. `Crumbs.tsx` now imports SERVICE_SQ from here
 *  instead of declaring its own copy.
 *
 *  Keyed off `UI.serviceLabel.*` (screenCopy.ts), not re-typed string
 *  literals, for the same reason Crumbs.tsx's own review-fix comment gives:
 *  every real caller passes UI.serviceLabel.passport/.voterServices/.sir as
 *  its service label, so keying off the same constants makes "a renamed
 *  service label silently drops the coloured square" impossible by
 *  construction, rather than something a test has to catch after the fact.
 *
 *  Both Voter Services and SIR reuse the pink square (sq-voter) — the
 *  prototype never cut a separate square colour for SIR. Transcribed as-is.
 *
 *  TWO CALL SITES, TWO DELIBERATELY DIFFERENT FALLBACKS. Do not unify them
 *  behind a shared default parameter — that would silently change one of
 *  the two:
 *   - `CaseCard` (prototype `caseCard`, 3123): `SERVICE_SQ[c.serviceLabel]
 *     || 'sq-butter'`. An unrecognised service still shows SOME coloured
 *     square on Home — a card with none would read as a rendering bug.
 *   - `PhaseEyebrow`'s crumbs (`Crumbs.tsx`, prototype `phaseEyebrow`
 *     2319 / the casefile screen's own crumbs call, 2888, 2911):
 *     `SERVICE_SQ[service] ?? null`. `Crumbs` treats `null` as "no square
 *     at all", which is the correct render for an unrecognised label in a
 *     breadcrumb, not a rendering bug.
 *
 *  HANDOFF NOTE FOR C7: `CaseCard` looks this map up by a persisted
 *  `serviceLabel` STRING read back out of `localStorage`, not a live value.
 *  If a service label is ever reworded, every already-stored casefile
 *  silently loses its colour square (falling through to 'sq-butter').
 *  Fixing that means keying the square off `engineKey` — which the casefile
 *  already stores — or migrating stored labels. Out of C5's scope (this is
 *  a faithful transcription of the prototype's own keying); C7's migration
 *  code needs to know this exists. */
import { UI } from '../screens/screenCopy'

export const SERVICE_SQ: Record<string, string> = {
  [UI.serviceLabel.passport]: 'sq-passport',
  [UI.serviceLabel.voterServices]: 'sq-voter',
  [UI.serviceLabel.sir]: 'sq-voter',
}
