// A *.test.tsx file, so guardrails/isolation.test.ts's scan (which walks
// *non-test* .ts files under src/, and .ts files only — see that file's own
// header comment) does not cover it, and it MAY import the guardrail
// harness. `screenCopy.ts` itself may NOT — see its own header comment and
// design note 6 of the task brief. (JSX needs a .tsx file; screenCopy.ts's
// own data module stays plain .ts, which is what the isolation scan
// actually walks.)
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { extraCopy } from '../playbooks/guardrails/contentSafety'
import { passportPlaybook, PASSPORT_STAGE_SHORT } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook, SIR_STATES, SIR_PHASES, sirCopyExtras } from '../playbooks/sirPlaybook'
import { PREP, type PrepPlan } from '../playbooks/prep'
import type { Diagnosis } from '../domain/types'
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { initialSession, type SessionState } from '../session/session'
import { caseSnapshot, LOG_COPY, type Casefile } from '../domain/casefile'
import { checkinOptionsFor } from '../domain/checkinOptions'
import { fmtDay, fmtRemind } from '../ui/dates'
import * as LABELS from './labels'
import { SCREEN_COPY, UI, PASSPORT_COPY, SIR_COPY, type CopyLocation } from './screenCopy'
import { INTERACTION_GATED } from './interactionGated'
import { Home } from './Home'
import { OtherServices } from './OtherServices'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './passport/PassportScreens'
import {
  PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow, PASTE_MATCH_EXAMPLES,
} from './passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from './voter/VoterScreens'
import { SirState, SirUnsupported, SirReverifying, SirQ1 } from './sir/SirScreens'
import { Topbar } from '../ui/Topbar'
import { Footer } from '../ui/Footer'
import { PhaseEyebrow } from '../ui/Crumbs'
import { DiagnosisScreen } from '../templates/DiagnosisScreen'
import { NextMoveScreen } from '../templates/NextMoveScreen'
import { PrepareScreen } from '../templates/PrepareScreen'
import { SOURCES_VERIFIED } from '../templates/TrustDisclosure'
import { verifiedDateFor } from '../domain/freshness'
import { LADDER_DEFS, LADDER_TAG } from '../templates/ladder'
import { CaseProgress } from '../templates/CaseProgress'
import { JourneyLog } from '../templates/JourneyLog'
import { CaseCard } from '../templates/CaseCard'
import { CasefileScreen } from '../templates/CasefileScreen'
import { SaveControl } from '../templates/SaveControl'
import { DeadEndScreen } from '../templates/DeadEndScreen'
import { CaseClosedScreen } from '../templates/CaseClosedScreen'
import { SaveDoneScreen } from '../templates/SaveDoneScreen'

const noop = () => {}

// -----------------------------------------------------------------------
// Every authored answer-option Record that predates C3 and stays a single
// source of truth in its own file (labels.ts, PASSPORT_STAGE_SHORT,
// LADDER_DEFS/LADDER_TAG) — NOT duplicated into SCREEN_COPY, only flattened
// here for the scan, exactly the way sirPlaybook.ts's own `sirCopyExtras()`
// is already flattened into the sir guardrail test below (design note 6 /
// Step 3's header note; design note 5's "unconditional" scan-input list).
function recordCopy(bucket: string, at: string, record: Record<string, string>): CopyLocation[] {
  return Object.entries(record).map(([k, v]) => extraCopy(`${bucket}:${at}.${k}`, v))
}

/** True when every value on `v` is a string — the shape `recordCopy`
 *  expects. Used to auto-discover every answer-label Record `labels.ts`
 *  exports (review fix round 1, Minor): the sweep used to hand-list
 *  `PASSPORT_Q1_LABELS`/`PASSPORT_Q2_LABELS`/`VOTER_Q1_LABELS`/
 *  `VOTER_APPEAL_LABELS` by name, so a later `PASSPORT_Q3_LABELS` would
 *  silently escape the scan unless someone remembered to add a line here.
 *  Walking every export instead makes the guarantee hold by construction,
 *  the same way `screenCopy.ts`'s own `flatten()` walks its tree. */
function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v).every(x => typeof x === 'string')
  )
}

/** Every `labels.ts` export whose name starts with `namePrefix` and whose
 *  value is a string-keyed Record, flattened for the guardrail scan. */
function labelRecordsCopy(bucket: string, namePrefix: string): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const [name, value] of Object.entries(LABELS)) {
    if (!name.startsWith(namePrefix) || !isStringRecord(value)) continue
    out.push(...recordCopy(bucket, name, value))
  }
  return out
}

/** `LADDER_DEFS[bucket]`'s title/caption/rungs, flattened for the scan.
 *  `EscalationLadder.tsx` doesn't exist yet (deferred to C5 — Open Question
 *  1's ruling), but this citizen-facing copy shipped with Task 8's data and
 *  design note 5 names it as an unconditional Task 9 scan input regardless
 *  of when the component mounts. */
function ladderDefCopy(bucket: 'passport' | 'voter'): CopyLocation[] {
  const def = LADDER_DEFS[bucket]
  return [
    extraCopy(`${bucket}:LADDER_DEFS.${bucket}.title`, def.title),
    extraCopy(`${bucket}:LADDER_DEFS.${bucket}.caption`, def.caption),
    ...def.rungs.map((r, i) => extraCopy(`${bucket}:LADDER_DEFS.${bucket}.rungs[${i}]`, r)),
  ]
}

/** `LADDER_TAG`'s rung-status labels — used by both services' ladders, so
 *  swept under whichever bucket the caller is currently scanning. */
function ladderTagCopy(bucket: string): CopyLocation[] {
  return Object.entries(LADDER_TAG).map(([k, v]) => extraCopy(`${bucket}:LADDER_TAG.${k}`, v))
}

/** `PASTE_MATCH_EXAMPLES`' example phrases render as visible button labels
 *  on the recovery-paste screen (review fix round 1, Minor) — derived from
 *  the array itself, not hand-copied, so a fourth example is swept
 *  automatically. */
function pasteMatchExamplesCopy(): CopyLocation[] {
  return PASTE_MATCH_EXAMPLES.map((e, i) => extraCopy(`passport:PASTE_MATCH_EXAMPLES[${i}].text`, e.text))
}

describe('C3 screen copy passes the same content-safety scan as rule copy (§7)', () => {
  it('passport playbook + passport screen copy is clean', () => {
    expect(guardrailFindings(passportPlaybook, {
      extra: [
        ...SCREEN_COPY.passport,
        ...recordCopy('passport', 'PASSPORT_STAGE_SHORT', PASSPORT_STAGE_SHORT),
        ...labelRecordsCopy('passport', 'PASSPORT_'),
        ...ladderDefCopy('passport'),
        ...ladderTagCopy('passport'),
        ...pasteMatchExamplesCopy(),
      ],
    })).toEqual([])
  })

  it('voter playbook + voter screen copy is clean', () => {
    expect(guardrailFindings(voterPlaybook, {
      extra: [
        ...SCREEN_COPY.voter,
        ...labelRecordsCopy('voter', 'VOTER_'),
        ...ladderDefCopy('voter'),
        ...ladderTagCopy('voter'),
      ],
    })).toEqual([])
  })

  it('sir playbook + sir screen copy + state names is clean', () => {
    expect(guardrailFindings(sirPlaybook, {
      currentPhaseId: SIR_STATES.delhi.phase!.id,
      extra: [
        ...sirCopyExtras(),
        ...SCREEN_COPY.sir,
        ...Object.values(SIR_STATES).map(s => extraCopy(`sir:SIR_STATES.${s.id}.name`, s.name)),
      ],
    })).toEqual([])
  })

  it('unsupported.lede\'s "Delhi only" claim is pinned to the actually-supported states', () => {
    // SIR_COPY.unsupported.lede says "Right now, that's Delhi only." — true
    // only because SIR_STATES currently marks exactly one state supported.
    // Nothing enforces that if a second state is later marked supported, so
    // pin it here: adding one fails this test loudly, forcing the copy to
    // be revisited rather than silently going stale.
    expect(Object.values(SIR_STATES).filter(s => s.supported).map(s => s.name)).toEqual(['Delhi'])
  })

  it('q1.ledeTail\'s "already behind us" claim is pinned to the phases it actually holds for', () => {
    // SIR_COPY.q1.ledeTail says "Enumeration and the Draft Roll are both
    // already behind us, so that's what these options reflect." That's true
    // for claims_notice (which starts only once both have happened) and for
    // final_roll (later still), but would stop being true if an earlier
    // phase — one covering enumeration itself — were added to SIR_PHASES and
    // a state moved into it. Pin the claim to exactly the phase ids it is
    // actually true for (not "whatever SIR_PHASES currently contains"), so
    // such an addition fails here instead of shipping stale copy.
    const phasesWhereEnumerationAndDraftRollAreBehindUs = ['claims_notice', 'final_roll']
    // Sanity: the ids above must be real SIR_PHASES entries, not typos.
    expect(phasesWhereEnumerationAndDraftRollAreBehindUs.every(id => id in SIR_PHASES)).toBe(true)

    const phaseIdsInUse = Object.values(SIR_STATES)
      .map(s => s.phase?.id)
      .filter((id): id is string => id !== undefined)
    expect(phaseIdsInUse.length).toBeGreaterThan(0) // the check below isn't vacuous
    for (const id of phaseIdsInUse) {
      expect(phasesWhereEnumerationAndDraftRollAreBehindUs).toContain(id)
    }
  })

  it('the ui: bucket is scanned too, not just declared', () => {
    // Service-agnostic chrome: topbar labels, the restart-confirm prompt,
    // Home's hero + lead-ins, OtherServices' Coming Soon rows, the trust
    // toggle and its row labels. Without this assertion the fourth bucket
    // would be declared-but-unscanned — a declared guardrail with no test.
    // Any playbook works: the content-safety and numeric scanners read
    // options.extra regardless of which playbook supplies copyStrings.
    expect(guardrailFindings(passportPlaybook, { extra: SCREEN_COPY.ui })).toEqual([])
  })

  it('every bucket exists and is non-empty (the sweep cannot pass by being empty)', () => {
    for (const key of ['passport', 'voter', 'sir', 'ui'] as const) {
      expect(SCREEN_COPY[key].length, key).toBeGreaterThan(0)
    }
  })

  it('the auto-discovered extras are not vacuous (a naming mismatch would silently scan nothing)', () => {
    // Guards the "holds by construction" claim for labelRecordsCopy/
    // ladderDefCopy/pasteMatchExamplesCopy themselves: if any of these
    // returned [] because of a typo'd prefix or an import that resolved to
    // nothing, guardrailFindings would still pass vacuously and the
    // guardrail-sweep tests above would give false confidence.
    expect(labelRecordsCopy('passport', 'PASSPORT_').length).toBeGreaterThan(0)
    expect(labelRecordsCopy('voter', 'VOTER_').length).toBeGreaterThan(0)
    expect(ladderDefCopy('passport').length).toBeGreaterThan(0)
    expect(ladderDefCopy('voter').length).toBeGreaterThan(0)
    expect(ladderTagCopy('passport').length).toBe(Object.keys(LADDER_TAG).length)
    expect(pasteMatchExamplesCopy().length).toBe(PASTE_MATCH_EXAMPLES.length)
  })

  it('every SCREEN_COPY location carries a service or ui prefix matching its bucket', () => {
    for (const [bucket, entries] of Object.entries(SCREEN_COPY)) {
      for (const c of entries) expect(c.at).toMatch(new RegExp(`^${bucket}:`))
    }
  })

  it("screenCopy.ts declares its own {at,text} type and imports no guardrail module", () => {
    // Belt-and-braces alongside guardrails/isolation.test.ts, and it names
    // the reason at the site where someone would be tempted to break it.
    // (sirPlaybook.ts's CopyLocation is the pattern being followed.)
    // Derive the path via node:path, NOT `new URL('./x', import.meta.url)` —
    // Vite statically rewrites that literal form into an asset URL, which
    // under jsdom resolves to http://localhost:3000/... and makes
    // fileURLToPath throw. Same fix guardrails/manifest.ts and
    // guardrails/isolation.test.ts already use, for the same reason.
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'screenCopy.ts'), 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*guardrails/)
  })
})

// -----------------------------------------------------------------------
// SCREEN_COPY is the single definition site — coverage holds by
// construction. Screens import their strings from SCREEN_COPY's nested
// trees and inline no citizen-facing literal, so "does SCREEN_COPY cover
// the screens?" cannot drift. What CAN drift is the reverse: an entry left
// in SCREEN_COPY after the screen stopped rendering it. That is what this
// checks, mechanically — one mount per BUCKET (not per individual screen),
// aggregating every C3 screen that owns a piece of that bucket's copy, so
// the whole bucket is provably present somewhere in real, production
// component output.

const sirUnsupportedState: SessionState = { ...initialSession, answers: { sirState: 'bihar' } }
const sirQ1State: SessionState = { ...initialSession, answers: { sirState: 'delhi' } }
const voterExplainState: SessionState = { ...initialSession, voterEntryExplain: true }

const classifiedDiagnosis = diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })
const unclassifiedDiagnosis = diagnose(passportEngine, { q1: 'not_sure' })
// The prepare-screen fixtures (C4, design note 5): REAL data, no synthetic
// `where` spread. state-5a is the one reachable rule whose where carries a
// phone (passportPlaybook.ts:161-165, 1800-258-1800) — the draft-bearing
// mount. s-notice is draft-less (one of the three SIR checklist-only
// plans) but DOES carry a visit block — the visit-bearing, draft-less
// mount design note 4 asks for.
const helplineDiagnosis = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })          // state-5a
const noticeDiagnosis = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })             // s-notice

// C5 Task 8 fixtures: CaseProgress/JourneyLog/CaseCard reuse helplineDiagnosis
// (state-5a — a real whatShort and a real PREP['state-5a'] plan), so their
// own new ui: entries get swept off REAL data, not a synthetic case.
const CASE_NOW = 1_760_000_000_000
const CASE_DAY = 86400000
const caseSnap = caseSnapshot(
  'passport', UI.serviceLabel.passport, 'passport-nextmove', helplineDiagnosis, { q1: 'adverse', q2: 'informal' }, {}, CASE_NOW,
)
const openCase: Casefile = {
  ...caseSnap, id: 'ui-case-open', outcome: 'still_open',
  lastCheck: CASE_NOW, remindAt: '2026-10-12', log: [],
}
const yesterdayCase: Casefile = { ...openCase, id: 'ui-case-yesterday', lastCheck: CASE_NOW - CASE_DAY, remindAt: null }
const daysAgoCase: Casefile = { ...openCase, id: 'ui-case-days-ago', lastCheck: CASE_NOW - 3 * CASE_DAY, remindAt: null }
const closedGotItCase: Casefile = {
  ...caseSnap, id: 'ui-case-closed-got-it', outcome: 'deliverable_received',
  lastCheck: null, remindAt: null, closedAt: CASE_NOW, log: [],
}
const closedUnresolvedCase: Casefile = {
  ...caseSnap, id: 'ui-case-closed-unresolved', outcome: 'closed_unresolved',
  lastCheck: null, remindAt: null, closedAt: CASE_NOW, log: [],
}
// Task 5 (D3): the 'superseded' outcome's own card kicker (card.closedSuperseded).
const closedSupersededCase: Casefile = {
  ...caseSnap, id: 'ui-case-closed-superseded', outcome: 'superseded',
  lastCheck: null, remindAt: null, closedAt: CASE_NOW, log: [],
}

const journeyLogA: Casefile = {
  ...caseSnap, id: 'ui-log-a', outcome: 'still_open', lastCheck: null, remindAt: null,
  log: [
    { t: CASE_NOW, kind: 'diagnosed', text: 'Diagnosed A' },
    { t: CASE_NOW + CASE_DAY, kind: 'reported', text: 'Reported A' },
    { t: CASE_NOW + 2 * CASE_DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
    { t: CASE_NOW + 3 * CASE_DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
    { t: CASE_NOW + 4 * CASE_DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
    { t: CASE_NOW + 5 * CASE_DAY, kind: 'checked', text: LOG_COPY.elseReDiagnose },
  ],
}
const journeyLogB: Casefile = {
  ...caseSnap, id: 'ui-log-b', outcome: 'still_open', lastCheck: null, remindAt: null,
  log: [
    { t: CASE_NOW, kind: 'diagnosed', text: 'Diagnosed B' },
    { t: CASE_NOW + CASE_DAY, kind: 'checked', text: LOG_COPY.checkedNoChange, noChange: true },
  ],
}

// C5 Task 9 fixtures: CasefileScreen/SaveControl. Reuses helplineDiagnosis
// (state-5a — real prep + ladder + one 'action' + one 'deliverable' option)
// and adds one real voter diagnosis (v-1) for the one panel kind state-5a's
// own config doesn't carry: 'valence'.
const voterDecisionDiagnosis = diagnose(voterEngine, { voterQ1: 'no_word' }) // v-1
const helplineOptions = checkinOptionsFor(helplineDiagnosis, {}, 'passport')
const helplineActionOpt = helplineOptions.find(o => o.k === 'action')!
const helplineDeliverableOpt = helplineOptions.find(o => o.k === 'deliverable')!
const voterOptions = checkinOptionsFor(voterDecisionDiagnosis, {}, 'voter')
const voterValenceOpt = voterOptions.find(o => o.k === 'valence')!

const voterCaseSnap = caseSnapshot(
  'voter', UI.serviceLabel.voterServices, 'voter-nextmove', voterDecisionDiagnosis, { voterQ1: 'no_word' }, {}, CASE_NOW,
)

const cfWorking: Casefile = {
  ...caseSnap, id: 'ui-cf-working', outcome: 'still_open', unsaved: true,
  lastCheck: null, remindAt: '2026-10-12', log: [{ t: CASE_NOW, kind: 'diagnosed', text: 'x' }],
}
const cfSavedValence: Casefile = {
  ...voterCaseSnap, id: 'ui-cf-saved-valence', outcome: 'still_open',
  lastCheck: null, remindAt: null, log: [{ t: CASE_NOW, kind: 'diagnosed', text: 'x' }],
}
const cfSavedClosureq: Casefile = {
  ...caseSnap, id: 'ui-cf-saved-closureq', outcome: 'still_open',
  lastCheck: null, remindAt: null,
  log: [
    { t: CASE_NOW, kind: 'diagnosed', text: 'a' },
    { t: CASE_NOW + CASE_DAY, kind: 'reported', text: 'b' },
    { t: CASE_NOW + 2 * CASE_DAY, kind: 'checked', text: 'c' },
  ],
}
const cfReassure: Casefile = {
  ...caseSnap, id: 'ui-cf-reassure', outcome: 'still_open',
  lastCheck: null, remindAt: null, log: [{ t: CASE_NOW, kind: 'diagnosed', text: 'x' }],
}
const cfClosedGotIt: Casefile = {
  ...caseSnap, id: 'ui-cf-closed-gotit', outcome: 'deliverable_received',
  lastCheck: null, remindAt: null, closedAt: CASE_NOW, log: [{ t: CASE_NOW, kind: 'diagnosed', text: 'x' }],
}
const cfClosedUnresolved: Casefile = {
  ...caseSnap, id: 'ui-cf-closed-unresolved', outcome: 'closed_unresolved',
  lastCheck: null, remindAt: null, closedAt: CASE_NOW, log: [{ t: CASE_NOW, kind: 'diagnosed', text: 'x' }],
}
// Task 5 (D3): the 'superseded' outcome's own headline (casefile.closedSupersededHeadline).
const cfClosedSuperseded: Casefile = {
  ...caseSnap, id: 'ui-cf-closed-superseded', outcome: 'superseded',
  lastCheck: null, remindAt: null, closedAt: CASE_NOW, log: [{ t: CASE_NOW, kind: 'diagnosed', text: 'x' }],
}

const casefileBaseProps = {
  prepChecks: {}, savedCases: [] as Casefile[], now: CASE_NOW,
  ciPending: null, ciPendingIdx: null, ciStage: null, ciReassure: false,
  ciSnapshot: null, ciConsecutive: false, phaseDrift: false, reminderCopied: false,
  logOpen: {}, removeConfirm: null, dispatch: noop,
  freshDegraded: false, freshChangedOn: null,
}

// PrepareScreen's four now-required controlled props (Task 13's ADDED
// REQUIREMENT — the local-state fallback is gone). Both `UiChrome()` mounts
// below are purely presentational (no tick/draft interaction happens in
// this sweep), so trivial, static values are enough — no stateful wrapper
// needed here, unlike PrepareScreen.test.tsx's own behavioural tests.
const prepareControlledProps = {
  prepChecks: {}, prepDraft: null, onTogglePrepStep: noop, onSetPrepDraft: noop,
}

/** The one PrepareScreen mount that genuinely edits the draft (the
 *  `CAPTION_SUBSTITUTIONS` test below, via repeated `fireEvent.change` +
 *  Copy clicks) needs REAL backing state for `prepDraft` — the same small
 *  stateful wrapper PrepareScreen.test.tsx's own `ControlledPrepareScreen`
 *  uses, standing in for the session reducer. `prepChecks`/its toggle are
 *  static here (this mount never ticks a step). */
function DraftEditablePrepareScreen(props: { serviceLabel: string; engineKey: 'passport'; d: Diagnosis; prep: PrepPlan }) {
  const [prepDraft, setPrepDraft] = useState<string | null>(null)
  return (
    <PrepareScreen {...props} prepChecks={{}} onTogglePrepStep={noop} prepDraft={prepDraft} onSetPrepDraft={setPrepDraft} />
  )
}

function PassportBucketScreens() {
  return (
    <>
      <PassportGuardrail state={initialSession} dispatch={noop} />
      <PassportOutOfScope state={initialSession} dispatch={noop} />
      <PassportQ1 state={initialSession} dispatch={noop} />
      <PassportQ2 state={initialSession} dispatch={noop} />
      <PassportRecovery state={initialSession} dispatch={noop} />
      <PassportRecoveryPaste state={initialSession} dispatch={noop} />
      <PassportRecoveryShow state={initialSession} dispatch={noop} />
      {/* Case trail (Passport-only): a matched, trail-bearing diagnosis. */}
      <DiagnosisScreen
        serviceLabel="Passport" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen={false} onToggleTrust={noop}
      />
      {/* The recovery echoes (design note 10) — composed by the router, so
          they are exercised here via DiagnosisScreen's extraToldUs prop. */}
      <DiagnosisScreen
        serviceLabel="Passport" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        extraToldUs={`${PASSPORT_COPY.recovery.extraToldUsPasted} "example status text"`}
      />
      <DiagnosisScreen
        serviceLabel="Passport" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        extraToldUs={PASSPORT_COPY.recovery.extraToldUsSafest}
      />
    </>
  )
}

function VoterBucketScreens() {
  return (
    <>
      <VoterEntry state={initialSession} dispatch={noop} />
      <VoterEntry state={voterExplainState} dispatch={noop} />
      <VoterQ1 state={initialSession} dispatch={noop} />
      <VoterQ2 state={initialSession} dispatch={noop} />
    </>
  )
}

function SirBucketScreens() {
  return (
    <>
      <SirState state={initialSession} dispatch={noop} />
      <SirUnsupported state={sirUnsupportedState} dispatch={noop} />
      {/* C6: reuses sirQ1State's 'delhi' answer (the one supported state) —
          SirReverifying only reads state.answers.sirState, same as
          SirUnsupported/SirQ1 above. Real freshness.json currently has
          nothing flagged 'changed', so changedOnFor(sirPlaybook.rules)
          resolves to null here and the lede's {date} substitutes to ''
          (see CAPTION_SUBSTITUTIONS' own comment on this below) — the DATE
          VALUE's correctness is covered separately by domain/freshness.test.ts;
          this sweep proves the copy is wired to real SCREEN_COPY, not a
          hand-typed duplicate. */}
      <SirReverifying state={sirQ1State} dispatch={noop} />
      <SirQ1 state={sirQ1State} dispatch={noop} />
    </>
  )
}

/** Matches App.tsx's own `topbar(showBack, showRestart)` closure — used
 *  only for the two new PrepareScreen mounts below (design note 4: "Pass
 *  topbar={topbar(true, true)} to both mounts, matching prototype 3762").
 *  The pre-existing NextMoveScreen mounts below don't pass one; ui:topbar.*
 *  copy is already covered by the two direct <Topbar/> mounts above, so
 *  this is added only where design note 4 explicitly asks for it. */
function topbar(showBack: boolean, showRestart: boolean) {
  return <Topbar showBack={showBack} showRestart={showRestart} hasAnswers={false} restartConfirm={false} dispatch={noop} />
}

function UiChrome() {
  return (
    <>
      <Topbar showBack showRestart hasAnswers={false} restartConfirm={false} dispatch={noop} />
      <Topbar showBack showRestart hasAnswers restartConfirm dispatch={noop} />
      <Footer />
      <Home state={initialSession} dispatch={noop} />
      <OtherServices state={initialSession} dispatch={noop} />
      <PhaseEyebrow service={UI.serviceLabel.sir} />
      <PhaseEyebrow service="x" phase={UI.phase.understandingYourCase} />
      <PhaseEyebrow service="x" phase={UI.phase.lastQuestion} />
      <PhaseEyebrow service="x" phase={UI.phase.recovery} />
      <PhaseEyebrow service="x" phase={UI.phase.justOneQuestion} />
      {/* Diagnosis: classified (headlineFound/Mark, waitingOn, howLong,
          expectNext) and UNCLASSIFIED (headlineUnclassified) — both with
          empty answerLabels so the trust panel's "not enough" fallback and
          "Based on" caption both render. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
      />
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={unclassifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
      />
      {/* Next Move: no-prep ("Back to Home") and with-prep ("Prepare this
          for me") branches. */}
      <NextMoveScreen serviceLabel="X" engineKey="passport" d={classifiedDiagnosis} dispatch={noop} />
      <NextMoveScreen serviceLabel="X" engineKey="passport" d={classifiedDiagnosis} hasPrepPlan onPrepare={noop} />
      {/* Task 13: NextMoveScreen with the new props supplied too (design
          note 8) — onUpdate/onSave, same convention DiagnosisScreen's own
          dedicated mount below already uses. Coverage-wise this duplicates
          what the SaveControl/CasefileScreen mounts already prove, but
          design note 8 asks for it explicitly. */}
      <NextMoveScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        onUpdate={noop} savedCases={[]} onSave={noop}
      />
      {/* C5 Task 11: the ciJustUpdated undo banner (diagnosis.updateRecorded/
          undoUpdate) and the "Add an update" entry point (updateEntry.label)
          — both new optional props, so covered via their own dedicated
          mount rather than changing an existing DiagnosisScreen mount's
          props. One mount covers all three strings: the banner renders
          `<UpdateEntry>` too, ahead of the trust toggle. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen={false} onToggleTrust={noop}
        ciJustUpdated onUndo={noop} onUpdate={noop}
        ciSnapshot={{ answers: caseSnap.answers, prepChecks: {}, casefile: openCase }}
      />
      {/* Task 13: the SIR phase-drift banner (diagnosis.phaseDriftLead/
          phaseDriftBody) — its own dedicated mount, same convention as the
          ciJustUpdated banner just above. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="sir" d={noticeDiagnosis}
        answerLabels={{}} trustOpen={false} onToggleTrust={noop}
        phaseDrift
      />
      {/* C6: freshBanner (freshness.reverifiedLead/reverifiedBody) — its own
          dedicated mount, same convention as ciJustUpdated/phaseDrift just
          above. reverifiedBody is a CAPTION_TEMPLATES entry (interpolates
          {date}); reverifiedLead is plain and must appear verbatim. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="sir" d={noticeDiagnosis}
        answerLabels={{}} trustOpen={false} onToggleTrust={noop}
        freshDegraded freshChangedOn="5 Sep 2026"
      />
      {/* Prepare (C4): draft-bearing (real state-5a — channelPhone,
          hintMany, stepsCount, copy and channelOpen all reach real,
          substituted or verbatim text at FIRST RENDER, no interaction
          needed) and visit-bearing/draft-less (s-notice — visitTitle,
          visitCarry, visitExpect, visitThen, visitNote). Together the pair
          this file's coverage sweep and CAPTION_TEMPLATES carve-out rely
          on (design notes 4 and 5). */}
      <PrepareScreen
        serviceLabel="X" engineKey="passport" d={helplineDiagnosis} prep={PREP['state-5a']}
        topbar={topbar(true, true)} {...prepareControlledProps}
      />
      <PrepareScreen
        serviceLabel="X" engineKey="sir" d={noticeDiagnosis} prep={PREP['s-notice']}
        topbar={topbar(true, true)} {...prepareControlledProps}
      />
      {/* C5 Task 8: CaseProgress (prepareStepsK, prepareCount), JourneyLog
          (whoReported/whoDiagnosed/whoOther/note, showAll, collapsedOne/
          Many — split across two mounts, see the fixtures' own comment) and
          CaseCard (savedPrefix/closedGotIt/closedUnresolved/next/steps/
          lastUpdate/checkBack/closedMark, time.today/yesterday/daysAgo). */}
      <CaseProgress prep={PREP['state-5a']} prepChecks={{ 0: true }} />
      <JourneyLog case={journeyLogA} logOpen={{}} onShowAll={noop} />
      <JourneyLog case={journeyLogB} logOpen={{}} onShowAll={noop} />
      <CaseCard case={openCase} onOpen={noop} now={CASE_NOW} />
      <CaseCard case={yesterdayCase} onOpen={noop} now={CASE_NOW} />
      <CaseCard case={daysAgoCase} onOpen={noop} now={CASE_NOW} />
      <CaseCard case={closedGotItCase} onOpen={noop} now={CASE_NOW} />
      <CaseCard case={closedUnresolvedCase} onOpen={noop} now={CASE_NOW} />
      <CaseCard case={closedSupersededCase} onOpen={noop} now={CASE_NOW} />
      {/* C5 Task 9: CasefileScreen — open (working + confirm panel),
          (saved + valence panel), (saved + closureq panel + remove-confirm),
          (reassure panel), and both closed headline branches. Together with
          the SaveControl mounts below, every new ui:casefile and
          ui:saveControl string reaches real, production component output. */}
      <CasefileScreen
        case={cfWorking} answers={cfWorking.answers} d={helplineDiagnosis} {...casefileBaseProps}
        ciStage="confirm" ciPending={helplineActionOpt} ciPendingIdx={helplineOptions.indexOf(helplineActionOpt)}
      />
      <CasefileScreen
        case={cfSavedValence} answers={cfSavedValence.answers} d={voterDecisionDiagnosis} {...casefileBaseProps}
        ciStage="valence" ciPending={voterValenceOpt} ciPendingIdx={voterOptions.indexOf(voterValenceOpt)}
      />
      <CasefileScreen
        case={cfSavedClosureq} answers={cfSavedClosureq.answers} d={helplineDiagnosis} {...casefileBaseProps}
        removeConfirm="ui-cf-saved-closureq"
        ciStage="closureq" ciPending={helplineDeliverableOpt} ciPendingIdx={helplineOptions.indexOf(helplineDeliverableOpt)}
      />
      <CasefileScreen
        case={cfReassure} answers={cfReassure.answers} d={helplineDiagnosis} {...casefileBaseProps}
        ciReassure ciConsecutive
        ciSnapshot={{ answers: { q1: 'adverse', q2: 'informal' }, prepChecks: {}, casefile: cfReassure }}
      />
      <CasefileScreen case={cfClosedGotIt} answers={cfClosedGotIt.answers} d={helplineDiagnosis} {...casefileBaseProps} />
      <CasefileScreen case={cfClosedUnresolved} answers={cfClosedUnresolved.answers} d={helplineDiagnosis} {...casefileBaseProps} />
      <CasefileScreen case={cfClosedSuperseded} answers={cfClosedSuperseded.answers} d={helplineDiagnosis} {...casefileBaseProps} />
      {/* copiedLabel ("Copied") only renders once reminderCopied is true —
          no click needed to reach it (props-driven, unlike PrepareScreen's
          own internal copy state), just its own static mount. */}
      <CasefileScreen case={cfWorking} answers={cfWorking.answers} d={helplineDiagnosis} {...casefileBaseProps} reminderCopied />
      {/* Task 13: the SIR phase-drift interstitial (casefile.phaseDriftKicker/
          phaseDriftTitle/phaseDriftBody/phaseDriftCta) — REPLACES the whole
          update-mod, so this mount's own ciStage/ciPending are irrelevant
          (the panel they'd open is unreachable while phaseDrift is true). */}
      <CasefileScreen case={cfWorking} answers={cfWorking.answers} d={helplineDiagnosis} {...casefileBaseProps} phaseDrift />
      <SaveControl engineKey="passport" stepsDone={0} savedCases={[]} answers={caseSnap.answers} onSave={noop} />
      <SaveControl engineKey="passport" stepsDone={2} savedCases={[]} answers={caseSnap.answers} onSave={noop} />
      <SaveControl
        engineKey="passport" stepsDone={0} answers={caseSnap.answers} onSave={noop}
        savedCases={[{ ...caseSnap, id: 'ui-sc-saved', outcome: 'still_open', lastCheck: null, remindAt: null, log: [] }]}
      />
      {/* C5 Task 11: Home's casefiles section (home.casefilesOne/
          casefilesMany, both CAPTION_TEMPLATES — see below — and
          home.closedLead, a literal). One open case for the singular lead;
          openCase + yesterdayCase (both still_open) plus closedGotItCase
          (deliverable_received) together for the plural lead + Closed
          section, reusing the SAME fixtures CaseCard's own mounts above
          already use. */}
      <Home state={{ ...initialSession, savedCases: [openCase] }} dispatch={noop} now={CASE_NOW} />
      <Home
        state={{ ...initialSession, savedCases: [openCase, yesterdayCase, closedGotItCase] }}
        dispatch={noop} now={CASE_NOW}
      />
      {/* C5 Task 10: DeadEndScreen (crumbTail, headline, lede, keepOpen,
          closeUnresolved), CaseClosedScreen (crumb, headlineLead/Mark,
          ledeLead, backToHome), and SaveDoneScreen (crumb, headline, lede,
          backToCase, goHome). All reachable at FIRST RENDER — props-driven,
          no interaction needed. `ledeSavedClause` needs a case that is not
          `unsaved` to render at all (design note 2's gate); `cfClosedGotIt`
          carries no `unsaved` field, so this same mount covers it. The
          unsaved branch's own ABSENCE is CaseClosedScreen.test.tsx's own
          concern, not this sweep's — this coverage test only asks "does
          every UI string appear SOMEWHERE", never "does every branch
          render". */}
      <DeadEndScreen case={openCase} logOpen={{}} now={CASE_NOW} dispatch={noop} />
      <CaseClosedScreen case={cfClosedGotIt} logOpen={{}} dispatch={noop} />
      <SaveDoneScreen
        pendingSave={{ engineKey: 'passport', serviceLabel: UI.serviceLabel.passport, returnScreen: 'passport-nextmove' }}
        dispatch={noop}
      />
      {/* Task 13: SaveDoneScreen WITHOUT pendingSave too (design note 8) —
          goHome/crumb/headline/lede are unaffected by pendingSave's
          presence, so this duplicates coverage the mount above already
          gives; design note 8 asks for it explicitly regardless. */}
      <SaveDoneScreen pendingSave={null} dispatch={noop} />
    </>
  )
}

/** The template carve-outs (Open Question 3, and C4's design note 4). Each
 *  entry's REGISTERED string carries a `{…}` placeholder that gets
 *  interpolated at render, so the rendered form can never equal the
 *  registered one — the only legitimate reason an entry may be absent from
 *  the literal-string sweep below. Adding to this set needs a recorded
 *  reason, written next to the entry, exactly like these. */
const CAPTION_TEMPLATES = new Set([
  'ui:trust.verifiedOn', // interpolates SOURCES_VERIFIED for {date}
  'ui:prepare.channelPhone', // interpolates d.where.phone for {phone}
  'ui:prepare.hintOne', // interpolates the live singular blank count for {n}
  'ui:prepare.hintMany', // interpolates the live plural blank count for {n}
  'ui:prepare.copiedOne', // interpolates the blank count AT THE MOMENT OF COPYING (singular) for {n}
  'ui:prepare.copiedMany', // interpolates the blank count AT THE MOMENT OF COPYING (plural) for {n}
  'ui:prepare.stepsCount', // interpolates the tick count for {done} and the step total for {total}
  // C5 Task 8 (CaseProgress/JourneyLog/CaseCard). Each interpolates a
  // number computed from the citizen's OWN saved casefile at render time —
  // day counts and calendar dates over their own journey log, not a claim
  // about a government process (the same category ui:trust.verifiedOn's
  // own comment already carves out). See dates.ts / CaseCard.tsx / JourneyLog.tsx.
  'ui:casefile.prepareCount', // interpolates the tick count for {done} and the plan's step total for {total}
  'ui:card.savedPrefix', // interpolates fmtDay(savedAt) for {date}
  'ui:card.next', // interpolates the diagnosis's own whatShort for {what}
  'ui:card.steps', // interpolates the tick count for {done} and the plan's step total for {total}
  'ui:card.lastUpdate', // interpolates daysAgo(lastCheck, now) for {ago}
  'ui:card.checkBack', // interpolates fmtRemind(remindAt) for {date}
  'ui:log.showAll', // interpolates the collapsed entry count for {n}
  'ui:log.collapsedOne', // interpolates the run's day count (always 1) for {n} and fmtDay(from) for {from}
  'ui:log.collapsedMany', // interpolates the run's day count for {n} and fmtDay(from)/fmtDay(to) for {from}/{to}
  'ui:time.daysAgo', // interpolates the live day count for {n}
  // C5 Task 9 (CasefileScreen). Same category as Task 8's own entries above
  // — arithmetic/dates over the citizen's own casefile, never a government-
  // process claim.
  'ui:casefile.metaStarted', // interpolates fmtDay(savedAt) for {day}
  'ui:casefile.metaSaved', // interpolates fmtDay(savedAt) for {day}
  'ui:casefile.metaCheckBackSuffix', // interpolates fmtRemind(remindAt) for {date}
  'ui:casefile.metaClosedSuffix', // interpolates fmtDay(closedAt) for {date}
  'ui:casefile.journeyOne', // interpolates the entry count (always 1) for {n}
  'ui:casefile.journeyMany', // interpolates the entry count for {n}
  'ui:casefile.reminderText', // interpolates fmtRemind(remindAt) for {date}
  // C5 Task 11 (Home's casefiles section). Same category as the entries
  // above — a count of the citizen's OWN saved casefiles, never a
  // government-process claim.
  'ui:home.casefilesOne', // interpolates the open-case count (always 1) for {n}
  'ui:home.casefilesMany', // interpolates the open-case count for {n}
  // C6 (freshBanner). Interpolates the degraded document's own changedOn
  // date from sources/freshness.json (domain/freshness.ts's changedOnFor)
  // — real freshness-job metadata, not a government-process claim.
  'ui:freshness.reverifiedBody', // interpolates changedOnFor(engine.rules) for {date}
  // C6 (SirReverifying). headline/lede interpolate the SIR state's own
  // name (from SIR_STATES, config data, not a government-process claim);
  // lede additionally interpolates changedOnFor for {date}, same category
  // as freshness.reverifiedBody above. verifiedNote interpolates
  // SOURCES_VERIFIED, same category as ui:trust.verifiedOn.
  'sir:reverifying.headline', // interpolates the SIR state's name for {state}
  'sir:reverifying.lede', // interpolates the SIR state's name for {state} and changedOnFor for {date}
  'sir:reverifying.verifiedNote', // interpolates SOURCES_VERIFIED for {date}
])

// `INTERACTION_GATED` itself (design note 4a: entries no STATIC mount can
// produce — a tick, a click, or a draft shape no shipped plan has) now
// lives in the shared `./interactionGated` module (imported above), NOT as
// a local literal here. A fix-round review finding: two independently
// hand-typed copies of the same five names (one here, one in
// PrepareScreen.test.tsx) could drift — a 6th entry added to one and not
// the other would silently delete coverage with nothing to catch it. A
// single shared source makes that structurally impossible. This file uses
// it only to skip these entries in the bucket sweep below; the coverage
// guarantee itself — that every one of these five actually renders under a
// real interaction — is mechanized in PrepareScreen.test.tsx via a
// `Record` of per-entry assertions whose keys are asserted to equal
// `[...INTERACTION_GATED]`, the same pattern `CAPTION_SUBSTITUTIONS` below
// already uses for `CAPTION_TEMPLATES`.

const SCREENS: [keyof typeof SCREEN_COPY, () => ReactElement][] = [
  ['passport', PassportBucketScreens],
  ['voter', VoterBucketScreens],
  ['sir', SirBucketScreens],
  ['ui', UiChrome],
]

describe('SCREEN_COPY is the single definition site — coverage holds by construction', () => {
  it.each(SCREENS)("every %s entry appears in its screen's rendered output", (bucket, mount) => {
    const { container } = render(mount())
    // `textContent` misses attribute-only text (the recovery textarea's
    // `placeholder`, the prep draft textarea's `aria-label`), which is
    // still real, visible/accessible, rendered copy — so it is checked
    // too, not carved out.
    const placeholders = Array.from(container.querySelectorAll('[placeholder]'))
      .map(el => el.getAttribute('placeholder') ?? '')
      .join(' ')
    const ariaLabels = Array.from(container.querySelectorAll('[aria-label]'))
      .map(el => el.getAttribute('aria-label') ?? '')
      .join(' ')
    const text = `${container.textContent ?? ''} ${placeholders} ${ariaLabels}`
    for (const c of SCREEN_COPY[bucket]) {
      if (CAPTION_TEMPLATES.has(c.at) || INTERACTION_GATED.has(c.at)) continue
      expect(text, c.at).toContain(c.text)
    }
  })

  // Every CAPTION_TEMPLATES entry's substituted form, keyed the same way —
  // registering a carve-out FORCES supplying its substituted expectation
  // (design note 6), so a future carve-out cannot be added without one.
  // `channelPhone`, `hintMany` and `stepsCount` are reachable at the
  // draft-bearing mount's FIRST RENDER (real state-5a data, design note 5:
  // its shipped draft carries brackets, so this is hintMANY not hintOne,
  // and 0-of-N is a legal stepsCount substitution before any tick). `hintOne`
  // needs a draft edited down to exactly one bracket — no shipped draft has
  // one (design note 4a) — which is a plain controlled-input change, not a
  // click/tick interaction (the hint is computed from `draft` on every
  // render, design note 2b), so it is not INTERACTION_GATED. `copiedOne`/
  // `copiedMany` ARE also INTERACTION_GATED (a Copy click is the only way
  // to reach either), so producing their substituted form here requires a
  // real click, mocking navigator.clipboard exactly as PrepareScreen.test.tsx
  // does.
  const CAPTION_SUBSTITUTIONS: Record<string, string> = {
    // C6: classifiedDiagnosis cites Citizens_Charter.pdf (state-1), one of
    // check_freshness.py's covered documents — computed via the SAME
    // live-then-fallback logic TrustDisclosure.tsx itself uses, not
    // hardcoded, so this doesn't rot every time the freshness job updates
    // the committed sources/freshness.json.
    'ui:trust.verifiedOn': UI.trust.verifiedOn.replace(
      '{date}', verifiedDateFor(classifiedDiagnosis.source.docId) ?? SOURCES_VERIFIED,
    ),
    'ui:prepare.channelPhone': UI.prepare.channelPhone.replace('{phone}', helplineDiagnosis.where.phone!),
    'ui:prepare.hintOne': UI.prepare.hintOne.replace('{n}', '1'),
    'ui:prepare.hintMany': UI.prepare.hintMany.replace(
      '{n}', String((PREP['state-5a'].draft!.match(/\[[^\]]*\]/g) ?? []).length),
    ),
    'ui:prepare.copiedOne': UI.prepare.copiedOne.replace('{n}', '1'),
    'ui:prepare.copiedMany': UI.prepare.copiedMany.replace('{n}', '2'),
    'ui:prepare.stepsCount': UI.prepare.stepsCount.replace('{done}', '0').replace(
      '{total}', String(PREP['state-5a'].steps.length),
    ),
    // C5 Task 8 — derived from the SAME fixtures the UiChrome mounts above
    // use (openCase/journeyLogA/journeyLogB/PREP['state-5a']), so these
    // strings cannot drift from what actually renders.
    'ui:casefile.prepareCount': UI.casefile.prepareCount.replace('{done}', '1').replace(
      '{total}', String(PREP['state-5a'].steps.length),
    ),
    'ui:card.savedPrefix': UI.card.savedPrefix.replace('{date}', fmtDay(CASE_NOW)),
    'ui:card.next': UI.card.next.replace('{what}', helplineDiagnosis.whatShort),
    'ui:card.steps': UI.card.steps.replace('{done}', String(openCase.stepsDone)).replace(
      '{total}', String(openCase.stepsTotal),
    ),
    'ui:card.lastUpdate': UI.card.lastUpdate.replace('{ago}', UI.time.today),
    'ui:card.checkBack': UI.card.checkBack.replace('{date}', '12 Oct'),
    'ui:log.showAll': UI.log.showAll.replace('{n}', '4'),
    'ui:log.collapsedOne': UI.log.collapsedOne.replace('{n}', '1').replace('{from}', fmtDay(CASE_NOW + CASE_DAY)),
    'ui:log.collapsedMany': UI.log.collapsedMany.replace('{n}', '3')
      .replace('{from}', fmtDay(CASE_NOW + 2 * CASE_DAY)).replace('{to}', fmtDay(CASE_NOW + 4 * CASE_DAY)),
    'ui:time.daysAgo': UI.time.daysAgo.replace('{n}', '3'),
    // C5 Task 9 — derived from the SAME fixtures the UiChrome mounts above
    // use (cfWorking/cfSavedClosureq/cfClosedGotIt, all stamped CASE_NOW).
    'ui:casefile.metaStarted': UI.casefile.metaStarted.replace('{day}', fmtDay(CASE_NOW)),
    'ui:casefile.metaSaved': UI.casefile.metaSaved.replace('{day}', fmtDay(CASE_NOW)),
    'ui:casefile.metaCheckBackSuffix': UI.casefile.metaCheckBackSuffix.replace('{date}', fmtRemind('2026-10-12')),
    'ui:casefile.metaClosedSuffix': UI.casefile.metaClosedSuffix.replace('{date}', fmtDay(CASE_NOW)),
    'ui:casefile.journeyOne': UI.casefile.journeyOne.replace('{n}', '1'),
    'ui:casefile.journeyMany': UI.casefile.journeyMany.replace('{n}', '3'),
    'ui:casefile.reminderText': UI.casefile.reminderText.replace('{date}', fmtRemind('2026-10-12')),
    // C5 Task 11 — derived from the SAME Home mounts the UiChrome mounts
    // above use ([openCase] for the singular; [openCase, yesterdayCase,
    // closedGotItCase] for the plural).
    'ui:home.casefilesOne': UI.home.casefilesOne.replace('{n}', '1'),
    'ui:home.casefilesMany': UI.home.casefilesMany.replace('{n}', '2'),
    // C6 — matches the literal freshChangedOn="5 Sep 2026" prop the
    // dedicated UiChrome mount above passes directly (not derived from
    // freshness.json — this is a component-prop substitution, same
    // category as ui:card.checkBack's own literal-date prop above).
    'ui:freshness.reverifiedBody': UI.freshness.reverifiedBody.replace('{date}', '5 Sep 2026'),
    // C6 — SirReverifying computes changedOnFor(sirPlaybook.rules) itself
    // (not a prop); real freshness.json currently has nothing 'changed',
    // so it resolves to null and the component's own `?? ''` fallback
    // substitutes an empty string here. The date VALUE's correctness is
    // covered by domain/freshness.test.ts's own dedicated unit tests with
    // injected 'changed' fixtures — this sweep only proves the copy comes
    // from real SCREEN_COPY, wired through a real render.
    'sir:reverifying.headline': SIR_COPY.reverifying.headline.replace('{state}', 'Delhi'),
    'sir:reverifying.lede': SIR_COPY.reverifying.lede.replace('{state}', 'Delhi').replace('{date}', ''),
    'sir:reverifying.verifiedNote': SIR_COPY.reverifying.verifiedNote.replace('{date}', SOURCES_VERIFIED),
  }

  it('CAPTION_SUBSTITUTIONS covers exactly CAPTION_TEMPLATES, and each substituted form actually renders', async () => {
    expect(Object.keys(CAPTION_SUBSTITUTIONS).sort()).toEqual([...CAPTION_TEMPLATES].sort())

    const { container: trustContainer } = render(
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
      />,
    )
    expect(trustContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:trust.verifiedOn'])

    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    })
    try {
      const { container: prepContainer } = render(
        <DraftEditablePrepareScreen serviceLabel="Passport" engineKey="passport" d={helplineDiagnosis} prep={PREP['state-5a']} />,
      )
      // channelPhone, hintMany, stepsCount — no interaction needed, the
      // real state-5a draft ships with brackets and no step is ticked yet.
      expect(prepContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:prepare.channelPhone'])
      expect(prepContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:prepare.hintMany'])
      expect(prepContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:prepare.stepsCount'])

      // hintOne — a plain edit, not an interaction (design note 2b).
      const ta = prepContainer.querySelector('.prep-draft') as HTMLTextAreaElement
      fireEvent.change(ta, { target: { value: 'only [one] bracket left to fill' } })
      expect(prepContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:prepare.hintOne'])

      // copiedMany / copiedOne — genuinely interaction-gated: a real Copy
      // click is the only way to reach either string at all.
      const copyBtn = prepContainer.querySelector('.copy-btn') as HTMLButtonElement
      fireEvent.change(ta, { target: { value: 'a [x] b [y]' } })
      await userEvent.click(copyBtn)
      await waitFor(() => expect(prepContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:prepare.copiedMany']))

      fireEvent.change(ta, { target: { value: 'ready [x] set' } })
      await userEvent.click(copyBtn)
      await waitFor(() => expect(prepContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:prepare.copiedOne']))
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }

    // C5 Task 8 — all reachable at FIRST RENDER, no interaction needed
    // (CaseProgress/JourneyLog/CaseCard are static, prop-driven views).
    // Reuses UiChrome's own mounts (the fixtures above) rather than
    // duplicating them, so there is only one place these fixtures live.
    const { container: uiContainer } = render(UiChrome())
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.prepareCount'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:card.savedPrefix'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:card.next'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:card.steps'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:card.lastUpdate'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:card.checkBack'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:log.showAll'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:log.collapsedOne'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:log.collapsedMany'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:time.daysAgo'])
    // C5 Task 9 — CasefileScreen, all reachable at FIRST RENDER (props-driven,
    // no interaction needed) off the SAME uiContainer mount above.
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.metaStarted'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.metaSaved'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.metaCheckBackSuffix'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.metaClosedSuffix'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.journeyOne'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.journeyMany'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:casefile.reminderText'])
    // C5 Task 11 — Home's casefiles section, off the SAME uiContainer mount.
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:home.casefilesOne'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:home.casefilesMany'])
    // C6 — freshBanner, off the SAME uiContainer mount (freshDegraded
    // DiagnosisScreen is part of UiChrome() too).
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:freshness.reverifiedBody'])
    // C6 — SirReverifying, its own mount (SirBucketScreens, not UiChrome).
    const { container: sirContainer } = render(SirBucketScreens())
    expect(sirContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['sir:reverifying.headline'])
    expect(sirContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['sir:reverifying.lede'])
    expect(sirContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['sir:reverifying.verifiedNote'])
  })

  // `INTERACTION_GATED` needs no membership pin here (fix-round review
  // finding): it is imported from the single shared `./interactionGated`
  // module, so there is nothing left for this file to drift out of sync
  // with. Its coverage guarantee — that every one of its five entries
  // actually renders under a real interaction — is mechanized in
  // PrepareScreen.test.tsx via a `Record` of per-entry assertions keyed
  // identically, with an assertion that those keys equal
  // `[...INTERACTION_GATED]`.
})
