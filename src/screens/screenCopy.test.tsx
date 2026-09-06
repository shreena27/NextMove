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
import type { ReactElement } from 'react'
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { extraCopy } from '../playbooks/guardrails/contentSafety'
import { passportPlaybook, PASSPORT_STAGE_SHORT } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook, SIR_STATES, SIR_PHASES, sirCopyExtras } from '../playbooks/sirPlaybook'
import { PREP } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { initialSession, type SessionState } from '../session/session'
import * as LABELS from './labels'
import { SCREEN_COPY, UI, PASSPORT_COPY, type CopyLocation } from './screenCopy'
import { Home } from './Home'
import { OtherServices } from './OtherServices'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './passport/PassportScreens'
import {
  PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow, PASTE_MATCH_EXAMPLES,
} from './passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from './voter/VoterScreens'
import { SirState, SirUnsupported, SirQ1 } from './sir/SirScreens'
import { Topbar } from '../ui/Topbar'
import { PhaseEyebrow } from '../ui/Crumbs'
import { DiagnosisScreen } from '../templates/DiagnosisScreen'
import { NextMoveScreen } from '../templates/NextMoveScreen'
import { PrepareScreen } from '../templates/PrepareScreen'
import { SOURCES_VERIFIED } from '../templates/TrustDisclosure'
import { LADDER_DEFS, LADDER_TAG } from '../templates/ladder'

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
      {/* Prepare (C4): draft-bearing (real state-5a — channelPhone,
          hintMany, stepsCount, copy and channelOpen all reach real,
          substituted or verbatim text at FIRST RENDER, no interaction
          needed) and visit-bearing/draft-less (s-notice — visitTitle,
          visitCarry, visitExpect, visitThen, visitNote). Together the pair
          this file's coverage sweep and CAPTION_TEMPLATES carve-out rely
          on (design notes 4 and 5). */}
      <PrepareScreen
        serviceLabel="X" engineKey="passport" d={helplineDiagnosis} prep={PREP['state-5a']}
        topbar={topbar(true, true)}
      />
      <PrepareScreen
        serviceLabel="X" engineKey="sir" d={noticeDiagnosis} prep={PREP['s-notice']}
        topbar={topbar(true, true)}
      />
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
])

/** Entries no STATIC mount can produce (design note 4a): each needs a user
 *  interaction (a tick, a click) or a draft shape no shipped plan has —
 *  `screenCopy.test.tsx`'s coverage test is `render(mount())` with no
 *  interaction, and PrepareScreen's tick/draft state has no prop seam to
 *  pre-seed for a test (adding one purely for a test would be a production
 *  API existing for test convenience — the wrong trade). They are NOT
 *  caption templates and must not be folded into CAPTION_TEMPLATES — their
 *  coverage lives in PrepareScreen.test.tsx's interaction test, named below
 *  so the two can never drift apart silently. */
const INTERACTION_GATED = new Set([
  'ui:prepare.copied',
  'ui:prepare.copiedOne',
  'ui:prepare.copiedMany',
  'ui:prepare.hintReady',
  'ui:prepare.doneNoteFallback',
])

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
    'ui:trust.verifiedOn': UI.trust.verifiedOn.replace('{date}', SOURCES_VERIFIED),
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
        <PrepareScreen serviceLabel="Passport" engineKey="passport" d={helplineDiagnosis} prep={PREP['state-5a']} />,
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
  })

  // Same treatment for INTERACTION_GATED (design note 6): pin its exact
  // membership so a future addition or removal cannot slip through
  // unnoticed. Cross-importing PrepareScreen.test.tsx's own list here would
  // re-run that whole file's suite as a side effect of module evaluation
  // (Vitest registers describe/it at import time) — so the two lists are
  // kept in sync BY HAND, each independently pinned to the same five names,
  // with PrepareScreen.test.tsx's interaction test independently asserting
  // that it actually renders all five.
  it('INTERACTION_GATED names exactly the five entries PrepareScreen.test.tsx\'s interaction test independently covers', () => {
    expect([...INTERACTION_GATED].sort()).toEqual([
      'ui:prepare.copied',
      'ui:prepare.copiedMany',
      'ui:prepare.copiedOne',
      'ui:prepare.doneNoteFallback',
      'ui:prepare.hintReady',
    ])
  })
})
