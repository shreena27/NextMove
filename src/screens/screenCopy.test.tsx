// A *.test.tsx file, so guardrails/isolation.test.ts's scan (which walks
// *non-test* .ts files under src/, and .ts files only — see that file's own
// header comment) does not cover it, and it MAY import the guardrail
// harness. `screenCopy.ts` itself may NOT — see its own header comment and
// design note 6 of the task brief. (JSX needs a .tsx file; screenCopy.ts's
// own data module stays plain .ts, which is what the isolation scan
// actually walks.)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { extraCopy } from '../playbooks/guardrails/contentSafety'
import { passportPlaybook, PASSPORT_STAGE_SHORT } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook, SIR_STATES, sirCopyExtras } from '../playbooks/sirPlaybook'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
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
    </>
  )
}

/** The one documented carve-out (Open Question 3). The archived-copy
 *  caption is REGISTERED as a template —
 *    'Checked against NextMove's archived copy of this source on {date}.'
 *  — so the scanned string carries no date and the fail-closed numeric
 *  scan stays sharp. The RENDERED string interpolates SOURCES_VERIFIED, so
 *  it can never equal the registered one. TrustDisclosure.test.tsx pins the
 *  constant to the manifest's captured date instead. This set is the only
 *  legitimate reason an entry may be absent from rendered output; adding to
 *  it needs a recorded reason, exactly like this one. */
const CAPTION_TEMPLATES = new Set(['ui:trust.verifiedOn'])

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
    // `placeholder`), which is still real, visible, rendered copy — so it
    // is checked too, not carved out.
    const placeholders = Array.from(container.querySelectorAll('[placeholder]'))
      .map(el => el.getAttribute('placeholder') ?? '')
      .join(' ')
    const text = `${container.textContent ?? ''} ${placeholders}`
    for (const c of SCREEN_COPY[bucket]) {
      if (CAPTION_TEMPLATES.has(c.at)) continue
      expect(text, c.at).toContain(c.text)
    }
  })

  it('each carve-out entry still appears with its placeholder substituted', () => {
    const t = SCREEN_COPY.ui.find(c => c.at === 'ui:trust.verifiedOn')!.text
    expect(t).toContain('{date}')
    const { container } = render(
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
      />,
    )
    expect(container.textContent).toContain(t.replace('{date}', SOURCES_VERIFIED))
  })
})
