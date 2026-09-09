// A *.test.tsx file, so guardrails/isolation.test.ts's scan (which walks
// *non-test* .ts files under src/, and .ts files only — see that file's own
// header comment) does not cover it, and it MAY import the guardrail
// harness. `screenCopy.ts` itself may NOT — see its own header comment and
// design note 6 of the task brief. (JSX needs a .tsx file; screenCopy.ts's
// own data module stays plain .ts, which is what the isolation scan
// actually walks.)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer, useState, type ReactElement } from 'react'
import { guardrailFindings } from '../playbooks/guardrails/suite'
import { extraCopy } from '../playbooks/guardrails/contentSafety'
import { passportPlaybook, PASSPORT_STAGE_SHORT } from '../playbooks/passportPlaybook'
import { voterPlaybook } from '../playbooks/voterPlaybook'
import { sirPlaybook, SIR_STATES, SIR_PHASES, sirCopyExtras } from '../playbooks/sirPlaybook'
import { PREP, type PrepPlan } from '../playbooks/prep'
import type { Diagnosis } from '../domain/types'
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { sessionReducer, initialSession, type ActiveInterpretation, type SessionState } from '../session/session'
import { caseSnapshot, LOG_COPY, type Casefile } from '../domain/casefile'
import { checkinOptionsFor } from '../domain/checkinOptions'
import { fmtDay, fmtRemind } from '../ui/dates'
import * as LABELS from './labels'
import { SCREEN_COPY, UI, PASSPORT_COPY, VOTER_COPY, SIR_COPY, type CopyLocation } from './screenCopy'
import { INTERACTION_GATED } from './interactionGated'
import type { DescribeEntryScreenId, Fact, GatedInterpretation } from '../domain/interpret'
import { Home } from './Home'
import { OtherServices } from './OtherServices'
import { PassportGuardrail, PassportOutOfScope, PassportQ1, PassportQ2 } from './passport/PassportScreens'
import {
  PassportRecovery, PassportRecoveryPaste, PassportRecoveryShow, PASTE_MATCH_EXAMPLES,
} from './passport/PassportRecovery'
import { VoterEntry, VoterQ1, VoterQ2 } from './voter/VoterScreens'
import { SirState, SirUnsupported, SirReverifying, SirQ1 } from './sir/SirScreens'
import { Topbar } from '../ui/Topbar'
import { AccountChip } from '../ui/AccountChip'
import { Footer } from '../ui/Footer'
import { PhaseEyebrow } from '../ui/Crumbs'
import { DescribeBlock } from '../templates/DescribeBlock'
import { InterpConfirmScreen } from '../templates/InterpConfirmScreen'
import { UnplaceablePanel } from '../templates/UnplaceablePanel'
import { FactChips } from '../templates/FactChips'
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
import { SaveCaseScreen } from '../templates/SaveCaseScreen'
import { SaveOtpScreen } from '../templates/SaveOtpScreen'
import { SaveNameScreen } from '../templates/SaveNameScreen'

const noop = () => {}

// UiChrome() stubs VITE_DESCRIBE_IT 'on' (Task 11 fix round 1, Finding
// I-2's own DescribeBlock mount, below) so its own describe-it subtree
// renders instead of null — unstubbed here so that stub never leaks into a
// later test in this same file (or, if suite ordering ever changes, a
// different file).
afterEach(() => {
  vi.unstubAllEnvs()
})

// C8 (Task 10, design note 11): "C8 authors NO new citizen-facing string,
// and this task is where that is verified." Read once, at module load
// (still "at test time", not a copy pasted into any test — the whole point
// is that a hand-transcription slip in screenCopy.ts is caught by comparing
// against the ACTUAL file, not a second hardcoded copy of it), and reused
// by every test below that needs to check a string against the prototype.
const PROTOTYPE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'nextmove-v1-prototype.html'), 'utf8',
)

/** Extracts a `DESCRIBE_CTX` chain entry's `label` for the given `id` out of
 *  the REAL prototype text (design note 5's own it.each requirement — "each
 *  asserting against the string read out of design/nextmove-v1-
 *  prototype.html at test time rather than a copy pasted into the test").
 *  Some ids repeat across DESCRIBE_CTX chains with byte-identical text
 *  (q2 at 1754/1757, voterQ1 at 1761/1765, voterAppealedRaw at
 *  1762/1766/1769) — the first match is authoritative. */
function describeCtxLabel(id: string): string {
  const re = new RegExp(String.raw`\{id:'${id}',\s*label:(['"])((?:\\.|(?!\1).)*)\1`)
  const m = PROTOTYPE.match(re)
  if (!m) throw new Error(`DESCRIBE_CTX label for id "${id}" not found in the prototype`)
  return m[2]
}

/** True when `template`'s literal (non-`{placeholder}`) parts appear, IN
 *  ORDER and each following the last within the same line, somewhere in
 *  `source` — used by design note 11's verbatim check for the four chip
 *  aria-label templates and the discard-note template, the prototype's own
 *  carve-out (it assembles these inline, e.g. `aria-label="Edit ${f.label}
 *  ${f.value}"`, 3032, so the template string itself never appears whole). */
function templateLiteralPartsMatch(template: string, source: string): boolean {
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = template.split(/\{[^}]+\}/).map(escapeRe).join('[^\\n]*?')
  return new RegExp(pattern).test(source)
}

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

const TEXT_FILE_RE = /\.(ts|tsx|json|css|html?|md|txt|svg)$/i

/** Every text file under `dir`, recursively. Deliberately broad (not scoped
 *  to .ts/.tsx) since C7's D1 sweep asks for "nowhere in src/", not "nowhere
 *  in src/*.ts". Skips binary assets (src/assets/fonts/*.woff2) by extension
 *  allowlist rather than by directory, so it stays correct if fonts move.
 *  Skips *.test.ts/*.test.tsx files (the same carve-out guardrails/
 *  isolation.test.ts's own `applicationTsFiles` already applies): a test file
 *  legitimately needs to reference the needle text to assert its absence —
 *  this very file does — so scanning test files would make the assertions
 *  self-defeating.
 *
 *  LIFTED TO MODULE SCOPE by C8 Task 17. It was declared inside the D1
 *  sweep's own `describe` block, and design note 6 of that task adds a
 *  further eight repo-wide source scans that need exactly this walk. A
 *  second, independently written walker would be a second thing to keep
 *  correct (the fonts carve-out, the test-file carve-out, the recursion) with
 *  nothing to catch a divergence — the same "one mechanism, not two"
 *  reasoning `interactionGated.ts`'s own header already gives for its shared
 *  Set. Nothing about the D1 sweep's own behaviour changes; it calls the same
 *  function, from the same place. */
const TEST_FILE_RE = /\.test\.tsx?$/
function allSrcTextFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { out.push(...allSrcTextFiles(full)); continue }
    if (!entry.isFile() || !TEXT_FILE_RE.test(entry.name) || TEST_FILE_RE.test(entry.name)) continue
    out.push(full)
  }
  return out
}

/** `src/` itself, derived via node:path — NOT `new URL('./x', import.meta.url)`,
 *  which Vite statically rewrites into an asset URL that resolves to
 *  http://localhost:3000/... under jsdom and makes `fileURLToPath` throw. The
 *  same fix guardrails/manifest.ts and guardrails/isolation.test.ts already
 *  use, for the same reason. */
function srcRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
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

  it('the ui: bucket actually grew with the C7 auth/account entries (a sweep over an accidentally-unregistered tree is vacuously clean)', () => {
    // task-10-brief.md RED item 1: `guardrailFindings` passing above proves
    // nothing on its own if the new copy was never registered under `UI` in
    // the first place — this pins that it genuinely was, by name, before
    // trusting the clean scan above.
    const ats = SCREEN_COPY.ui.map(c => c.at)
    for (const at of [
      'ui:saveCase.trust',
      'ui:saveOtp.resendWaitOne',
      'ui:saveName.saveMidSave',
      'ui:saveName.saveStandalone',
      'ui:account.casefilesOne',
      'ui:saveDone.ledeTailPhone',
    ]) {
      expect(ats, at).toContain(at)
    }
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

  it('UI.saveCase.trust is registered as ONE whole paragraph carrying all four load-bearing clauses', () => {
    // task-10-brief.md RED item 2 / design note 2: this paragraph is "the
    // load-bearing promise of this entire chunk" — splitting it into
    // sentence fragments would let one clause be edited out of the
    // guardrail scan's sight without anything catching it, which is why it
    // is transcribed and registered as exactly one string, not several.
    expect(typeof UI.saveCase.trust).toBe('string')
    const clauses = ['exactly one thing', 'No marketing', 'Remove deletes a case for good', 'never required signing in']
    for (const clause of clauses) {
      expect(
        UI.saveCase.trust,
        `UI.saveCase.trust must stay ONE whole paragraph carrying "${clause}" — splitting it would let this clause drift out of the guardrail scan's sight`,
      ).toContain(clause)
    }
  })

  it('CAPTION_TEMPLATES includes the four new C7 template entries', () => {
    // task-10-brief.md RED item 3. The full consistency check (that
    // CAPTION_SUBSTITUTIONS covers exactly these keys) lives in the
    // coverage-holds-by-construction describe block below, alongside every
    // other CAPTION_TEMPLATES entry.
    for (const key of ['ui:saveOtp.lede', 'ui:saveOtp.resendWaitMany', 'ui:account.casefilesOne', 'ui:account.casefilesMany']) {
      expect(CAPTION_TEMPLATES.has(key), key).toBe(true)
    }
    // resendWaitOne carries no placeholder (its value is the fixed string
    // 'Send again in one second'), so it is NOT a template — same shape as
    // time.today/time.yesterday alongside time.daysAgo.
    expect(CAPTION_TEMPLATES.has('ui:saveOtp.resendWaitOne')).toBe(false)
  })

  it('all six UI.saveName branch strings are registered and distinct', () => {
    // task-10-brief.md RED item 4 / design note 6 — "the detail most likely
    // to be missed": renderSaveName branches on midSave in three places;
    // these six are the lede-clause pair and both button pairs, never
    // collapsed into one shared string per pair.
    const six = [
      UI.saveName.ledeClauseMidSave,
      UI.saveName.ledeClauseStandalone,
      UI.saveName.saveMidSave,
      UI.saveName.saveStandalone,
      UI.saveName.switchMidSave,
      UI.saveName.switchStandalone,
    ]
    for (const s of six) expect(typeof s).toBe('string')
    expect(new Set(six).size, six.join(' | ')).toBe(6)
  })

  // -----------------------------------------------------------------------
  // C8 (docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10): the
  // describe/interpret/facts copy bucket, registered before any component
  // that renders it exists (Tasks 11-15). See this file's own
  // "SCREEN_COPY is the single definition site" describe block below for
  // why the coverage sweep is expected to go red for these new subtrees
  // until then — nothing here weakens that sweep.

  it('the ui: bucket actually grew with the C8 describe-it entries (a sweep over an accidentally-unregistered tree is vacuously clean)', () => {
    // task-10-brief.md RED item 1 (THIS task's own brief, C8's — not the C7
    // one the check above and its own comment cite; same numbering,
    // unrelated plans).
    const ats = SCREEN_COPY.ui.map(c => c.at)
    for (const at of [
      'ui:describe.rowStrong',
      'ui:describe.examples.passport-q1.one',
      'ui:describe.examples.sir-q1.one',
      'ui:interp.headline',
      'ui:interp.spanPrefix',
      'ui:interp.qLabel.q1',
      'ui:unplaceable.lede',
      'ui:facts.pickedUpKey',
      'ui:facts.aadhaarRefused',
      'ui:prepare.hintFilledUnreviewed',
    ]) {
      expect(ats, at).toContain(at)
    }
  })

  it("D8: the interp framing paragraph transcribes the prototype's semicolon, not the spec's/PRD's em-dash paraphrase", () => {
    // task-10-brief.md RED item 8 (D8, assertion 1 of 3).
    expect(UI.interp.framingParagraph, 'D8 — transcribe the prototype, not the spec/PRD em-dash paraphrase').toContain('; the verified playbook does that')
    expect(UI.interp.framingParagraph, 'D8 — transcribe the prototype, not the spec/PRD em-dash paraphrase').not.toContain(' — the verified playbook')
  })

  it("D8: the Aadhaar refusal transcribes the prototype's longer sentence", () => {
    // task-10-brief.md RED item 8 (D8, assertion 2 of 3).
    expect(UI.facts.aadhaarRefused, 'D8 — transcribe the prototype, not the spec/PRD shorter paraphrase').toMatch(/, and nothing here ever needs one\.$/)
  })

  it("D8: the fill-list key transcribes the prototype's semicolon, not FR-AI-04's em-dash paraphrase", () => {
    // task-10-brief.md RED item 8 (D8, assertion 3 of 3).
    expect(UI.prepare.fillListKey, 'D8 — transcribe the prototype, not the PRD em-dash paraphrase').toContain('text; please check them')
  })

  it('the unplaceable lede is registered as exactly one entry carrying all three of its sentences (design note 7)', () => {
    expect(typeof UI.unplaceable.lede).toBe('string')
    for (const sentence of [
      "That's not a problem with what you wrote.",
      "NextMove only matches words against its verified categories, and it couldn't do that safely here.",
      'Rather than guess, pick the closest option yourself.',
    ]) {
      expect(
        UI.unplaceable.lede,
        'the lede must stay ONE whole paragraph — splitting it would let its load-bearing first sentence drift out of the guardrail scan\'s sight',
      ).toContain(sentence)
    }
  })

  it('the Aadhaar refusal is registered exactly once across the flattened ui bucket, rendered from two call sites (design note 8)', () => {
    const occurrences = SCREEN_COPY.ui.filter(c => c.text === UI.facts.aadhaarRefused).map(o => o.at)
    expect(occurrences, 'must be registered once, not duplicated across two entries').toEqual(['ui:facts.aadhaarRefused'])
  })

  it('CAPTION_TEMPLATES includes the C8 discard-note template and the four chip aria-label templates', () => {
    // task-10-brief.md RED item: CAPTION_TEMPLATES/CAPTION_SUBSTITUTIONS
    // coverage. The full key-equality check lives in the coverage-holds-
    // by-construction describe block below, alongside every other
    // CAPTION_TEMPLATES entry (same split the C7 equivalent test uses).
    for (const key of [
      'ui:interp.discardNote',
      'ui:facts.editValueAria',
      'ui:facts.removeValueAria',
      'ui:facts.editLabel',
      'ui:facts.saveLabel',
    ]) {
      expect(CAPTION_TEMPLATES.has(key), key).toBe(true)
    }
  })

  it('UI.describe.examples is a keyed object per entry screen, never an array (design note 4a)', () => {
    for (const [screenId, examples] of Object.entries(UI.describe.examples)) {
      expect(Array.isArray(examples), screenId).toBe(false)
    }
    const exampleAts = SCREEN_COPY.ui.filter(c => c.at.startsWith('ui:describe.examples.')).map(c => c.at)
    expect(exampleAts.length, 'eight example strings across six entry screens').toBe(8)
    for (const at of exampleAts) {
      expect(
        at,
        '`CopyTree` is `{ [key: string]: string | CopyTree }`; an array here is a compile error, and widening the '
        + 'type would add an index-addressed `at` convention to a scheme every other bucket addresses by name',
      ).not.toMatch(/\.\d+(\.|$)/)
    }
  })

  it.each([
    ['q1'], ['q2'], ['voterEntry'], ['voterQ1'], ['voterAppealedRaw'], ['sirQ1'],
  ] as const)("UI.interp.qLabel.%s is byte-identical to DESCRIBE_CTX's own label (prototype 1753-1772, design note 5)", (key) => {
    expect(UI.interp.qLabel[key]).toBe(describeCtxLabel(key))
  })

  it.each([
    ['q2', PASSPORT_COPY.q2.headline],
    ['voterQ1', VOTER_COPY.q1.headline],
    ['sirQ1', SIR_COPY.q1.headline],
  ] as const)('UI.interp.qLabel.%s must NOT be replaced by the similarly-worded screen headline', (key, headline) => {
    expect(
      UI.interp.qLabel[key],
      "these read almost the same and are not the same ('…follow up?' vs '…follow up on this?', 'What is' vs "
      + '"What\'s"); pointing a confirm card at a screen headline makes the card change when the headline is edited',
    ).not.toBe(headline)
  })

  it('design note 11: every new UI.describe/UI.interp/UI.unplaceable/UI.facts leaf appears verbatim in the prototype (C8 authors no new citizen-facing string)', () => {
    const newBucketPrefixes = ['ui:describe.', 'ui:interp.', 'ui:unplaceable.', 'ui:facts.']
    const entries = SCREEN_COPY.ui.filter(c => newBucketPrefixes.some(p => c.at.startsWith(p)))
    expect(entries.length).toBeGreaterThan(0)
    for (const c of entries) {
      if (NO_PROTOTYPE_SOURCE.has(c.at)) {
        // Task 12's own carve-out, extending this design-note-11 check for
        // exactly the reason its own header comment anticipates: a
        // genuinely NEW, screen-reader-only string with no prototype
        // equivalent to compare against at all — not merely assembled
        // differently (that is the CAPTION_TEMPLATES branch below), but
        // absent from the prototype altogether. See UI.interp.summary's own
        // doc comment (screenCopy.ts) for why this specific subtree is the
        // one deliberate exception to "C8 authors no new citizen-facing
        // string": it is non-visual a11y chrome, not prose a sighted
        // citizen reads, and its numbers are computed, never authored.
        continue
      }
      if (CAPTION_TEMPLATES.has(c.at)) {
        // The four chip aria-label templates + the discard note: the
        // prototype assembles these inline (e.g. `aria-label="Edit
        // ${f.label} ${f.value}"`, 3032), so the template string itself
        // never appears whole — assert its literal parts appear, in order.
        expect(templateLiteralPartsMatch(c.text, PROTOTYPE), c.at).toBe(true)
        continue
      }
      expect(PROTOTYPE, c.at).toContain(c.text)
    }
  })

  it("'Design prototype: any 6 digits work here.' appears nowhere in src/ (D1)", () => {
    // task-10-brief.md RED item 5 / design note 4: the prototype's
    // demo-hint is prototype-only scaffold copy, deliberately NOT
    // registered in SCREEN_COPY — this is the repo-wide half of that rule,
    // not scoped to any one component.
    const needle = 'Design prototype: any 6 digits work here.'
    const offenders = allSrcTextFiles(srcRoot()).filter(f => readFileSync(f, 'utf8').includes(needle))
    expect(offenders.map(f => f.split(sep).join('/')), offenders.join('\n')).toEqual([])
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
  'passport', UI.serviceLabel.passport, 'passport-nextmove', helplineDiagnosis, { q1: 'adverse', q2: 'informal' }, {}, [], null, null, CASE_NOW,
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
// Task 15: the account popover's own fixture, reusing openCase/
// closedSupersededCase above rather than minting a third set of case data —
// one still_open case and one superseded one, so the same mount that closes
// the ui:account.* coverage gap also stands as a live (not just AccountChip.
// test.tsx-only) proof that a superseded case is not counted.
const acctUnnamedUser = { method: 'phone' as const, id: '+919876543210', name: null }

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
  'voter', UI.serviceLabel.voterServices, 'voter-nextmove', voterDecisionDiagnosis, { voterQ1: 'no_word' }, {}, [], null, null, CASE_NOW,
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

// PrepareScreen's now-required controlled props (Task 13's ADDED
// REQUIREMENT — the local-state fallback is gone — extended by Task 15 with
// `caseFacts`/`fillsReviewed`/`onToggleFillsReviewed`). Both `UiChrome()`
// mounts below are purely presentational (no tick/draft interaction happens
// in this sweep), so trivial, static values are enough — no stateful
// wrapper needed here, unlike PrepareScreen.test.tsx's own behavioural
// tests. `caseFacts` defaults to `[]` at the call site that doesn't need
// one; the state-5a mount below overrides it with a real, matching fact so
// `ui:prepare.fillListKey`/`fillReviewLabel` reach the static coverage
// sweep too (`ui:prepare.hintFilledUnreviewed` stays interaction-gated —
// see interactionGated.ts's own comment on why a static PREP plan can't
// produce it).
const prepareControlledProps = {
  prepChecks: {}, prepDraft: null, onTogglePrepStep: noop, onSetPrepDraft: noop,
  caseFacts: [] as Fact[], fillsReviewed: false, onToggleFillsReviewed: noop,
}

/** The one PrepareScreen mount that genuinely edits the draft (the
 *  `CAPTION_SUBSTITUTIONS` test below, via repeated `fireEvent.change` +
 *  Copy clicks) needs REAL backing state for `prepDraft` — the same small
 *  stateful wrapper PrepareScreen.test.tsx's own `ControlledPrepareScreen`
 *  uses, standing in for the session reducer. `prepChecks`/its toggle are
 *  static here (this mount never ticks a step), and so is `caseFacts`/
 *  `fillsReviewed` (this mount is not about the fills mechanism). */
function DraftEditablePrepareScreen(props: { serviceLabel: string; engineKey: 'passport'; d: Diagnosis; prep: PrepPlan }) {
  const [prepDraft, setPrepDraft] = useState<string | null>(null)
  return (
    <PrepareScreen
      {...props} prepChecks={{}} onTogglePrepStep={noop} prepDraft={prepDraft} onSetPrepDraft={setPrepDraft}
      caseFacts={[]} fillsReviewed={false} onToggleFillsReviewed={noop}
    />
  )
}


// ---------------------------------------------------------------------------
// C8 (Task 17) — the interpretation fixtures the confirm/unplaceable mounts
// below are built from. Task 10 registered `ui:interp.*`/`ui:unplaceable.*`/
// `ui:facts.*` ahead of the components that render them, and screenCopy.ts's
// own doc comments say in as many words that those subtrees "are expected to
// show up red in the coverage sweep until then" — `then` is this task, which
// is where every one of them finally reaches real, production component
// output through the components App.tsx now routes to.
//
// The `__gated` brand is cast, exactly the way `interactionGated.test.tsx`
// and `session.test.ts` already cast it: the brand exists to stop PRODUCTION
// code manufacturing a gated value without passing the gate, and a test
// fixture is not production code. The VALUES below are not invented, though —
// every mapping value, span and fact is what the real simulator actually
// returns for the registered example story it belongs to (verified by running
// `runInterpretation` against each one), so these mounts render the same
// shapes a citizen would really see.
// Explicitly annotated, not left to inference: `__gated` is a `unique
// symbol`, and a `const` initialised by a cast infers the WIDER `symbol`
// type, which then fails to satisfy the field it exists for.
const GATED_BRAND: GatedInterpretation['__gated'] = 'test-only' as unknown as GatedInterpretation['__gated']

const FILE_NUMBER_FACT: Fact = {
  kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
  value: 'BN1068334517807', fills: '[File Number / ARN]',
}
const UNKNOWN_NUMBER_FACT: Fact = {
  kind: 'reference_number', refType: 'unknown', label: 'A number you mentioned',
  value: 'XY7788ZZ01', fills: null,
}
const EPIC_FACT: Fact = {
  kind: 'reference_number', refType: 'epic', label: 'EPIC number', value: 'ABC1234567', fills: null,
}

function interpFixture(over: Partial<ActiveInterpretation>): ActiveInterpretation {
  return {
    __gated: GATED_BRAND,
    mappings: [], discarded: [], facts: [], droppedSensitive: false, unplaceable: false,
    provenance: 'simulated (local matcher)',
    ctxScreen: 'passport-q1', engine: 'passport', service: UI.serviceLabel.passport,
    text: UI.describe.examples['passport-q1'].one,
    ...over,
  }
}

function interpState(interp: ActiveInterpretation, answers: Record<string, string> = {}): SessionState {
  return { ...initialSession, answers, interp }
}

/** Mount 1 — the passport story's real two-mapping read, with TWO facts, a
 *  refused Aadhaar-shaped number and a discarded mapping. One mount, and it
 *  is what covers `ui:interp.summary.matchedMany`/`factsMany` (both plural
 *  branches), `ui:interp.discardNote`, `ui:interp.change` (q1 is the screen
 *  the citizen typed on, so D12 collapses it to a label plus a Change
 *  control), `ui:facts.unknownNumberNote` and `ui:facts.aadhaarRefused`. */
const interpMappedTwo = interpFixture({
  mappings: [
    {
      questionId: 'q1', value: 'contacted_incomplete', span: 'Police came',
      optionValues: ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse'],
    },
    {
      questionId: 'q2', value: 'informal', span: 'called',
      optionValues: ['no_followup', 'informal', 'formal_grievance'],
    },
  ],
  discarded: [{ questionId: 'voterAppealedRaw', reason: 'unreachable' }],
  facts: [FILE_NUMBER_FACT, UNKNOWN_NUMBER_FACT],
  droppedSensitive: true,
})

/** Mount 2 — the voter story's real three-mapping read. Covers the three
 *  voter `ui:interp.qLabel.*` entries, which no passport mount can reach, and
 *  `ui:interp.summary.factsOne` (exactly one fact). */
const interpMappedVoter = interpFixture({
  ctxScreen: 'voter-entry', engine: 'voter', service: UI.serviceLabel.voterServices,
  text: UI.describe.examples['voter-entry'].one,
  mappings: [
    { questionId: 'voterEntry', value: 'applied', span: 'applied', optionValues: ['applied', 'sir'] },
    { questionId: 'voterQ1', value: 'decision', span: 'rejected', optionValues: ['no_word', 'blo_visited', 'decision'] },
    {
      questionId: 'voterAppealedRaw', value: 'none', span: "haven't appeal",
      optionValues: ['none', 'pending', 'decided'],
    },
  ],
  facts: [FILE_NUMBER_FACT],
})

/** Mount 3 — exactly one mapping, so `ui:interp.summary.matchedOne` (a fixed,
 *  digit-free literal, not a template) reaches the sweep. */
const interpMappedOne = interpFixture({
  ctxScreen: 'passport-q2',
  text: UI.describe.examples['passport-q2'].two,
  mappings: [{
    questionId: 'q2', value: 'informal', span: 'called',
    optionValues: ['no_followup', 'informal', 'formal_grievance'],
  }],
  facts: [FILE_NUMBER_FACT],
})

/** Mount 4 — the fail-closed panel (`ui:unplaceable.headline`/`lede`), on the
 *  SIR chain so `ui:interp.qLabel.sirQ1` is reached too: the panel offers the
 *  first UNANSWERED question in the chain, which for `sir-q1` is `sirQ1`
 *  itself. */
const interpUnplaceableSir = interpFixture({
  ctxScreen: 'sir-q1', engine: 'sir', service: UI.serviceLabel.sir,
  text: UI.describe.examples['sir-q1'].one,
  unplaceable: true, facts: [EPIC_FACT],
})

/** `ui:facts.editLabel`/`saveLabel` are edit-mode aria-labels, reachable only
 *  once a real `SET_FACT_EDIT` has landed — which is exactly why they are in
 *  `INTERACTION_GATED`. `CAPTION_SUBSTITUTIONS` below still owes each of them
 *  a real substituted-form RENDER assertion (the same obligation
 *  `ui:prepare.copiedOne`/`copiedMany` carry, which are also gated), so this
 *  wrapper drives the real reducer round trip to produce them, mirroring
 *  `interactionGated.test.tsx`'s own `ControlledFactChips` rather than
 *  short-circuiting the gate with a hand-set `factEditIdx` prop. */
function EditableFactChips({ facts }: { facts: Fact[] }) {
  const [state, dispatch] = useReducer(sessionReducer, interpState(interpFixture({ facts })))
  if (!state.interp) return null
  return (
    <FactChips
      facts={state.interp.facts}
      droppedSensitive={state.interp.droppedSensitive}
      factEditIdx={state.factEditIdx}
      factEditVal={state.factEditVal}
      dispatch={dispatch}
    />
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
        appliedText={null} caseFacts={[]}
      />
      {/* The recovery echoes (design note 10) — composed by the router, so
          they are exercised here via DiagnosisScreen's extraToldUs prop. */}
      <DiagnosisScreen
        serviceLabel="Passport" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        extraToldUs={`${PASSPORT_COPY.recovery.extraToldUsPasted} "example status text"`}
        appliedText={null} caseFacts={[]}
      />
      <DiagnosisScreen
        serviceLabel="Passport" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        extraToldUs={PASSPORT_COPY.recovery.extraToldUsSafest}
        appliedText={null} caseFacts={[]}
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
  return (
    <Topbar
      showBack={showBack} showRestart={showRestart} hasAnswers={false} restartConfirm={false}
      state={initialSession} dispatch={noop}
    />
  )
}

function UiChrome() {
  // Task 12's SaveOtpScreen fixture below needs a deadline just under
  // 1000ms from the REAL clock (its live countdown reads `Date.now()`
  // directly, design note 4 — CASE_NOW is a fixed fixture timestamp long
  // past by the time this suite runs, so it cannot stand in here). Computed
  // once, outside the JSX, so the one-off `Date.now()` read is not itself
  // flagged as an impure call "during render" (this is a plain function
  // call producing a fixture, not an actually re-rendering component).
  // oxlint-disable-next-line react/purity -- one-off test fixture value, not a live render read; see comment above
  const otpAlmostDueBy = Date.now() + 950
  // Task 11 fix round 1, Finding I-2: DescribeBlock was never mounted in
  // this sweep, though screenCopy.ts's own comment on `describe` (Task 10)
  // explicitly scoped mounting it to Task 11 ("not yet mounted anywhere...
  // until then"). Stubbed here, at the top of this function, so it is in
  // effect before render() ever invokes DescribeBlock's own function body
  // (React defers a component's own execution to reconciliation, which
  // happens inside render(), strictly after this function returns its JSX
  // tree) — same ordering reasoning as `otpAlmostDueBy` just above.
  // oxlint-disable-next-line react/purity -- one-off test setup, not a live render read; same as otpAlmostDueBy above
  vi.stubEnv('VITE_DESCRIBE_IT', 'on')
  return (
    <>
      <Topbar showBack showRestart hasAnswers={false} restartConfirm={false} state={initialSession} dispatch={noop} />
      <Topbar showBack showRestart hasAnswers restartConfirm state={initialSession} dispatch={noop} />
      {/* Task 15: closes the 'ui:account.*' coverage gap task-10-brief.md's
          own design note 9 opened and task-12-brief.md's CAPTION_TEMPLATES
          comment kept scoped down to exactly these entries. One mount,
          open with a NAMELESS user and the sign-out confirm armed, covers
          every non-templated ui:account.* string in a single pass:
          ariaLabel (the popover's own aria-label), casefilesSub (always
          rendered), addName/addNameSub (only without a name), and signOut/
          signOutConfirm.prompt/yes/cancel (signOutConfirm.yes reuses the
          same literal text as signOut, screenCopy.ts's own comment) —
          casefilesOne/Many are CAPTION_TEMPLATES (they interpolate {n}),
          so they are deliberately NOT asserted by this sweep; their
          substituted forms get their own dedicated render check in
          CAPTION_SUBSTITUTIONS' own `it` below, same as every other
          templated entry in this file. */}
      <AccountChip
        state={{
          ...initialSession, user: acctUnnamedUser, acctOpen: true, signOutConfirm: true,
          savedCases: [openCase, closedSupersededCase],
        }}
        dispatch={noop}
      />
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
          "Based on" caption both render.
          Task 16: the classified mount ALSO carries real appliedText +
          a real fact (reusing the same 'BN1068334517807'/File Number
          fixture the ui:facts.* CAPTION_SUBSTITUTIONS below already use,
          and the passport-q1 example story ui:describe.examples already
          registers) — reaches ui:trust.detailsKeptFrom (and confirms
          ui:interp.youWrote, already covered via InterpConfirmScreen once
          Task 17 mounts it, ALSO renders here) at first render, no
          interaction needed, the same "real data, not a toy fixture"
          convention this file's mounts already follow throughout. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        appliedText={UI.describe.examples['passport-q1'].one}
        caseFacts={[
          { kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: '[File Number / ARN]' },
        ]}
      />
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={unclassifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        appliedText={null} caseFacts={[]}
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
        appliedText={null} caseFacts={[]}
      />
      {/* Task 13: the SIR phase-drift banner (diagnosis.phaseDriftLead/
          phaseDriftBody) — its own dedicated mount, same convention as the
          ciJustUpdated banner just above. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="sir" d={noticeDiagnosis}
        answerLabels={{}} trustOpen={false} onToggleTrust={noop}
        phaseDrift
        appliedText={null} caseFacts={[]}
      />
      {/* C6: freshBanner (freshness.reverifiedLead/reverifiedBody) — its own
          dedicated mount, same convention as ciJustUpdated/phaseDrift just
          above. reverifiedBody is a CAPTION_TEMPLATES entry (interpolates
          {date}); reverifiedLead is plain and must appear verbatim. */}
      <DiagnosisScreen
        serviceLabel="X" engineKey="sir" d={noticeDiagnosis}
        answerLabels={{}} trustOpen={false} onToggleTrust={noop}
        freshDegraded freshChangedOn="5 Sep 2026"
        appliedText={null} caseFacts={[]}
      />
      {/* Prepare (C4): draft-bearing (real state-5a — channelPhone,
          hintMany, stepsCount, copy and channelOpen all reach real,
          substituted or verbatim text at FIRST RENDER, no interaction
          needed) and visit-bearing/draft-less (s-notice — visitTitle,
          visitCarry, visitExpect, visitThen, visitNote). Together the pair
          this file's coverage sweep and CAPTION_TEMPLATES carve-out rely
          on (design notes 4 and 5).
          Task 15: the state-5a mount ALSO carries a real ARN fact whose
          bracket (`[File Number / ARN]`) is genuinely present in state-5a's
          own draft (prep.ts) — filling it statically reaches
          `ui:prepare.fillListKey`/`fillReviewLabel` at first render, no
          interaction needed, the same "real data, not a toy fixture"
          reasoning this file's mounts already follow throughout. state-5a
          carries OTHER brackets too (`[date you applied]`, `[date]`,
          `[call / visit / portal message]`, `[Your name]`, `[Your contact
          number and email]`), so this fact alone can never zero out
          `liveBlanks` — `ui:prepare.hintFilledUnreviewed` genuinely stays
          unreachable by any static PREP plan, exactly as
          interactionGated.ts's own comment on that entry says, and stays
          covered instead by interactionGated.test.tsx's synthetic plan. */}
      <PrepareScreen
        serviceLabel="X" engineKey="passport" d={helplineDiagnosis} prep={PREP['state-5a']}
        topbar={topbar(true, true)} {...prepareControlledProps}
        caseFacts={[
          { kind: 'reference_number', refType: 'arn', label: 'ARN', value: '123456789012', fills: '[File Number / ARN]' },
        ]}
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
      {/* Task 14: SaveDoneScreen WITH a user (ledeTailPhone/ledeTailOther,
          the OQ1 restoration) — one mount per branch of the ternary, a
          phone user for ledeTailPhone and a Google user for ledeTailOther
          (email hits the same else-branch string, covered by
          SaveDoneScreen.test.tsx's own dedicated test, not duplicated
          here). */}
      <SaveDoneScreen pendingSave={null} user={{ method: 'phone', id: 'ui-sd-phone', name: null }} dispatch={noop} />
      <SaveDoneScreen pendingSave={null} user={{ method: 'google', id: 'ui-sd-google', name: null }} dispatch={noop} />
      {/* Task 12: SaveCaseScreen (Task 11) and SaveOtpScreen (Task 12),
          wired in per the deferral this file's own INTERACTION_GATED
          comment and CAPTION_SUBSTITUTIONS both left for "once SaveOtp/
          SaveCase exist". Three SaveCaseScreen mounts cover every branch a
          static render can reach: phone with no error (crumb/headline/
          lede/trust/google/divider/fieldLabelMobile/placeholderMobile/
          send/switchToEmail/authNote), email with its own error set
          (fieldLabelEmail/placeholderEmail/switchToMobile/errors.email),
          and phone with the OTHER error (errors.mobile) — both errors are
          reachable as plain controlled props (SaveCaseScreen.test.tsx's own
          Fix Round 1, Finding 3 precedent), no click needed. */}
      <SaveCaseScreen authMethod="phone" authId="" authErr={null} authBusy={false} now={CASE_NOW} dispatch={noop} />
      <SaveCaseScreen
        authMethod="email" authId="" authErr={UI.saveCase.errors.email} authBusy={false} now={CASE_NOW}
        dispatch={noop}
      />
      <SaveCaseScreen
        authMethod="phone" authId="" authErr={UI.saveCase.errors.mobile} authBusy={false} now={CASE_NOW}
        dispatch={noop}
      />
      {/* SaveOtpScreen: one mount with errors.code set (also covers
          crumbTail/headline/fieldLabel/placeholder/verify/resendPrompt, all
          reachable together since none of those depend on authErr), one
          with otpResent (resendSent — a controlled prop, no click needed,
          same reasoning as the errors above), and one whose
          otpCooldownUntil sits just under 1000ms from the REAL clock (not
          CASE_NOW, which is a fixed fixture timestamp long past by the time
          this suite runs against the real `Date.now()` this component
          reads for its live countdown — design note 4) so resendWaitOne
          renders without needing fake timers here. saveOtp.lede
          (CAPTION_TEMPLATES) and resendWaitMany (CAPTION_TEMPLATES) get
          their own dedicated, fake-timer-backed render checks in
          CAPTION_SUBSTITUTIONS below, not here. */}
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={UI.saveOtp.errors.code} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={CASE_NOW} dispatch={noop}
      />
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent otpCooldownUntil={null} now={CASE_NOW} dispatch={noop}
      />
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={otpAlmostDueBy} now={CASE_NOW} dispatch={noop}
      />
      {/* Task 13: SaveNameScreen — TWO mounts, one per branch (mid-save/
          standalone), since design note 1 branches the crumbs, the lede
          clause and both buttons on `midSave = !!pendingSave`. Both are
          fully controlled components (no interaction needed for any of the
          11 ui:saveName.* strings — headline/ledeStem/fieldLabel/
          placeholder are shared, the other 8 split evenly across these two
          mounts), same reasoning as the SaveCaseScreen/SaveOtpScreen mounts
          above. */}
      <SaveNameScreen
        pendingSave={{ engineKey: 'passport', serviceLabel: UI.serviceLabel.passport, returnScreen: 'passport-nextmove' }}
        pendingName="" now={CASE_NOW} dispatch={noop}
      />
      <SaveNameScreen pendingSave={null} pendingName="" now={CASE_NOW} dispatch={noop} />
      {/* Task 11 fix round 1, Finding I-2: one DescribeBlock mount per
          configured screen id (`UI.describe.examples`' own keys —
          screenCopy.ts's comment: "match domain/interpret.ts's own
          DescribeEntryScreenId union exactly"), each open (describeOpen:
          true) so the textarea/meta/example-chips subtree renders too, not
          just the collapsed row. rowLead/rowStrong/ariaLabel/placeholder/
          langNote/read are identical across all six mounts (any one would
          cover them), but each screen's own example stories are ONLY
          reachable off ITS OWN mount (DescribeBlock renders
          Object.values(UI.describe.examples[screenId]), design note 1 of
          DescribeBlock.tsx) — covering all 8 ui:describe.examples.*
          entries needs all six. `ui:describe.err`/`ui:describe.reading`
          stay correctly INTERACTION_GATED — nothing here submits, fails,
          or is in-flight; this is a purely static mount. */}
      {(Object.keys(UI.describe.examples) as DescribeEntryScreenId[]).map(screenId => (
        <DescribeBlock
          key={screenId}
          screenId={screenId}
          state={{ ...initialSession, describeOpen: true }}
          dispatch={noop}
        />
      ))}
      {/* Task 17: the interpretation confirm screen and the fail-closed
          panel, now that App.tsx's router actually mounts both (the
          `'interp-confirm'` case, which composes them as siblings whose
          guards are exact complements). Four mounts, each for a reason the
          others cannot cover:
            1. `interpMappedTwo` — two mappings, two facts, a refused
               Aadhaar-shaped number and a discarded mapping: the plural
               summary branches, the discard note, the Change control
               (D12 collapses the typed-on question to a label + Change),
               `ui:facts.unknownNumberNote` and `ui:facts.aadhaarRefused`.
            2. `interpMappedVoter` — the three voter `qLabel` entries no
               passport mount can reach, plus the SINGULAR facts branch.
            3. `interpMappedOne` — the singular MATCHED branch.
            4. `interpUnplaceableSir` — `ui:unplaceable.headline`/`lede`,
               and `ui:interp.qLabel.sirQ1` via the offered question.
          `now` is CASE_NOW, the same fixed fixture clock every other
          time-taking mount in this file uses — nothing here reads a live
          clock. */}
      <InterpConfirmScreen state={interpState(interpMappedTwo)} dispatch={noop} now={CASE_NOW} />
      <InterpConfirmScreen state={interpState(interpMappedVoter)} dispatch={noop} now={CASE_NOW} />
      <InterpConfirmScreen state={interpState(interpMappedOne)} dispatch={noop} now={CASE_NOW} />
      <UnplaceablePanel state={interpState(interpUnplaceableSir, { sirState: 'delhi' })} dispatch={noop} />
    </>
  )
}

/** Design note 11's OTHER carve-out (Task 12), distinct from
 *  CAPTION_TEMPLATES below: strings with literally NO prototype source to
 *  compare against at all, because they are genuinely new — the design-note-
 *  11 test's own two branches (a literal string appearing verbatim, or a
 *  template's literal parts appearing in order) both assume the string
 *  EXISTS somewhere in the prototype, assembled differently or not. This
 *  set is for the one case where that assumption itself is wrong. Currently
 *  exactly `UI.interp.summary`'s five entries (screenCopy.ts's own doc
 *  comment there has the full reasoning: the post-interpretation live-
 *  region announcement spec §7 requires, which the prototype has no
 *  equivalent of anywhere — not even assembled inline — because it does no
 *  screen-reader announcement at all on this screen). Adding to this set
 *  needs the same recorded reason CAPTION_TEMPLATES below already demands —
 *  "no prototype source" is a claim, not a default, and must be checked,
 *  not assumed, exactly like every other carve-out in this file. */
const NO_PROTOTYPE_SOURCE = new Set([
  'ui:interp.summary.matchedOne',
  'ui:interp.summary.matchedMany',
  'ui:interp.summary.factsOne',
  'ui:interp.summary.factsMany',
  'ui:interp.summary.discardedNote',
])

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
  // C7 (Task 10 — auth/account copy). saveOtp.lede interpolates the masked
  // destination (the citizen's own phone or email, not a government-process
  // claim) for {dest}. saveOtp.resendWaitMany interpolates
  // Math.ceil(msRemaining/1000) for {n} — always >= 1 while the resend
  // control is disabled (see UI.saveOtp's own header comment in
  // screenCopy.ts); its n===1 sibling, resendWaitOne, carries no
  // placeholder and is NOT in this set (ordinary literal-string sweep,
  // same shape as time.today/time.yesterday alongside time.daysAgo).
  // account.casefilesOne/Many interpolate the signed-in citizen's own open
  // casefile count, same category as home.casefilesOne/Many above.
  //
  // UPDATED (Task 12): SaveCaseScreen (Task 11) and SaveOtpScreen (Task 12)
  // now exist and are wired into UiChrome() / their own dedicated mounts
  // below — 'ui:saveOtp.lede' and 'ui:saveOtp.resendWaitMany' both now have
  // real substituted-form RENDER assertions (see CAPTION_SUBSTITUTIONS'
  // own `it` below), not just the key-equality check.
  // UPDATED (Task 15): 'ui:account.casefilesOne'/'casefilesMany' — the last
  // two of the original four — now ALSO have real substituted-form render
  // assertions (AccountChip now exists), closing the gap task-10-brief.md
  // design note 9 opened and task-12-brief.md's own comment here narrowed
  // down to exactly these two. Every CAPTION_TEMPLATES entry now has a real
  // render check; none remain gapped.
  'ui:saveOtp.lede',
  'ui:saveOtp.resendWaitMany',
  'ui:account.casefilesOne',
  'ui:account.casefilesMany',
  // C8 (docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10 design
  // notes 6 and 8) — registered here ahead of Tasks 12/13 building
  // InterpConfirmScreen/FactChips (same incremental pattern as C7's
  // saveOtp.lede/resendWaitMany and account.casefilesOne/Many above, which
  // sat here with a key-equality-only entry in CAPTION_SUBSTITUTIONS before
  // their own mounting screens existed). This REOPENS the "none remain
  // gapped" claim just above, for these five only — Tasks 12 and 13 close
  // it the same way Tasks 12/15 already did for the C7 entries.
  'ui:interp.discardNote', // interpolates the first discarded question's own label, lowercased, for {question}
  'ui:facts.editValueAria', // interpolates the fact's label/value for {label}/{value} — a chip's NORMAL state
  'ui:facts.removeValueAria', // interpolates the fact's label/value for {label}/{value} — a chip's NORMAL state
  'ui:facts.editLabel', // interpolates the fact's label for {label} — a chip's EDIT-MODE state (also INTERACTION_GATED)
  'ui:facts.saveLabel', // interpolates the fact's label for {label} — a chip's EDIT-MODE state (also INTERACTION_GATED)
  // Task 12's own addition — the two pluralized halves of the composed
  // live-region summary (screenCopy.ts's own UI.interp.summary doc comment
  // has the full reasoning for the whole subtree; NO_PROTOTYPE_SOURCE above
  // is the OTHER carve-out this same subtree needs, for design note 11's
  // check specifically — the two are independent gaps in two independent
  // tests, both closed). `matchedOne`/`factsOne` carry no placeholder (the
  // n===1 case is always spelled out, same convention as
  // `ui:saveOtp.resendWaitOne` alongside its own `resendWaitMany`), so
  // neither belongs in this set. Same "registered ahead of its own mounting
  // screen" incremental step the five entries above already took —
  // InterpConfirmScreen exists as of this task, but is not yet mounted in
  // THIS file's own coverage sweep (that is Task 17's job), so these two
  // stay key-equality-only in CAPTION_SUBSTITUTIONS below, no render check
  // yet, matching the five above exactly.
  'ui:interp.summary.matchedMany', // interpolates the live matched-mapping count for {matched}
  'ui:interp.summary.factsMany', // interpolates the live picked-up-fact count for {facts}
])

// `INTERACTION_GATED` itself (design note 4a: entries no STATIC mount can
// produce — a tick, a click, or a draft shape no shipped plan has) now
// lives in the shared `./interactionGated` module (imported above), NOT as
// a local literal here. A fix-round review finding: two independently
// hand-typed copies of the same five names (one here, one in
// interactionGated.test.tsx) could drift — a 6th entry added to one and not
// the other would silently delete coverage with nothing to catch it. A
// single shared source makes that structurally impossible. This file uses
// it only to skip these entries in the bucket sweep below; the coverage
// guarantee itself — that every entry actually renders under a real
// interaction — is mechanized in `interactionGated.test.tsx` via a
// `Record` of per-entry assertions whose keys are asserted to equal
// `[...INTERACTION_GATED]` by STRICT equality (fix round 1, Finding I-4 —
// no exclusion filter), the same pattern `CAPTION_SUBSTITUTIONS` below
// already uses for `CAPTION_TEMPLATES`. Three of those entries
// (`ui:facts.editLabel`/`saveLabel`, `ui:prepare.hintFilledUnreviewed`) are
// correctly still red there, owed to Tasks 13/15 — see that file's own
// header comment.
//
// UPDATED (Task 12 — resolves Task 10's own deferred question, task-10-
// brief.md design note 9's "likely candidates" list). Now that SaveCase/
// SaveOtp actually exist, each of the five was checked against the real
// rule this file's own header note states: gate ONLY what a static mount
// genuinely cannot produce, never merely what is "fiddly" to mount. Result
// — NONE of the five needed gating, because both screens are fully
// controlled components (SaveCaseScreen.tsx design note 3 / SaveOtpScreen.
// tsx's own header note): every field a "real interaction" would normally
// be needed to reach is instead a plain prop, settable directly, exactly
// the precedent SaveCaseScreen.test.tsx's own Fix Round 1, Finding 3
// already established for `ui:saveCase.errors.email` (a dedicated render
// test with `authErr` set directly, no click).
//   - `ui:saveOtp.errors.code`, `ui:saveCase.errors.mobile`/`.email`,
//     `ui:saveOtp.resendSent` — all reachable by setting `authErr`/
//     `otpResent` directly; covered by UiChrome()'s own SaveCaseScreen/
//     SaveOtpScreen mounts above, same as every other prop-driven branch
//     in this file (e.g. the `reminderCopied`/`phaseDrift` CasefileScreen
//     mounts).
//   - `ui:saveOtp.resendWaitOne` — reachable by setting `otpCooldownUntil`
//     to just under 1000ms from the REAL clock at mount time (SaveOtp
//     Screen's countdown reads `Date.now()` directly, design note 4) —
//     still zero interaction, just a controlled prop; covered by its own
//     UiChrome() mount.
//   - `ui:saveOtp.resendWaitMany` — already in CAPTION_TEMPLATES (it
//     interpolates {n}), so it was never a candidate for THIS set; its
//     substituted form gets its own dedicated, fake-timer-pinned render
//     check in CAPTION_SUBSTITUTIONS' own `it` below, for the same
//     no-interaction reason as the other four.
// UPDATED (Task 15): the `account.*` subtree is now built and mounted —
// `ui:account.casefilesOne`/`casefilesMany` are covered by their own
// CAPTION_SUBSTITUTIONS render check below (same as every other templated
// entry); the rest of `account.*` is a plain literal-string sweep, covered
// by the dedicated AccountChip mount in UiChrome() above. Neither needed
// INTERACTION_GATED — the account popover is a fully controlled component
// (`state.acctOpen`/`state.signOutConfirm` are plain props), same as
// SaveCase/SaveOtp before it.

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
    // C7 (Task 10 registered these; Task 12 closed SaveOtp's own gap below;
    // Task 15 closes the last one — account.casefilesOne/Many, off a real
    // AccountChip render, same as every other entry in this map).
    // 'ui:saveOtp.lede': CORRECTED from Task 10's own placeholder value
    // ('+91 98765 43210', a guess at a "naturally formatted" phone number
    // made before SaveOtpScreen existed to test it against). The real,
    // mandated derivation (SaveOtpScreen.tsx design note 1 / D12) is
    // `'+91 ' + authId.slice(3)` — a single contiguous 10-digit block, ONE
    // space total, reproducing the prototype's own rendered string exactly.
    // The placeholder's extra inner space was simply never exercised by a
    // render until now; task-12-brief.md's own RED item 1 pins the corrected
    // form directly on SaveOtpScreen.test.tsx too.
    'ui:saveOtp.lede': UI.saveOtp.lede.replace('{dest}', '+91 9876543210'),
    'ui:saveOtp.resendWaitMany': UI.saveOtp.resendWaitMany.replace('{n}', '5'),
    'ui:account.casefilesOne': UI.account.casefilesOne.replace('{n}', '1'),
    'ui:account.casefilesMany': UI.account.casefilesMany.replace('{n}', '2'),
    // C8 (Task 10 registered these five; Task 17 closes the render-check gap
    // — every one of them now has a real assertion below, off the same
    // InterpConfirmScreen/UnplaceablePanel/FactChips mounts App.tsx's router
    // actually reaches).
    //
    // CORRECTED (Task 17), the same class of correction Task 12 made to
    // 'ui:saveOtp.lede' above and for the same reason — a placeholder value
    // guessed before the rendering component existed to check it against.
    // The `{question}` substitution is the discarded question's own
    // `UI.interp.qLabel` entry, LOWERCASED (InterpConfirmScreen.tsx /
    // UnplaceablePanel.tsx both do exactly that), and those labels END IN A
    // QUESTION MARK — the hand-typed value here dropped it, which nothing
    // caught while this entry had no render assertion. Derived from the
    // registered label now, so it cannot drift again.
    'ui:interp.discardNote': UI.interp.discardNote.replace(
      '{question}', UI.interp.qLabel.voterAppealedRaw.toLowerCase(),
    ),
    'ui:facts.editValueAria': UI.facts.editValueAria.replace('{label}', 'File Number').replace('{value}', 'BN1068334517807'),
    'ui:facts.removeValueAria': UI.facts.removeValueAria.replace('{label}', 'File Number').replace('{value}', 'BN1068334517807'),
    'ui:facts.editLabel': UI.facts.editLabel.replace('{label}', 'File Number'),
    'ui:facts.saveLabel': UI.facts.saveLabel.replace('{label}', 'File Number'),
    // Task 12: InterpConfirmScreen's own composed live-region summary — see
    // CAPTION_TEMPLATES' own comment just above these two keys. Same
    // deferred-render-check shape as the five entries directly above.
    'ui:interp.summary.matchedMany': UI.interp.summary.matchedMany.replace('{matched}', '2'),
    'ui:interp.summary.factsMany': UI.interp.summary.factsMany.replace('{facts}', '2'),
  }

  it('CAPTION_SUBSTITUTIONS covers exactly CAPTION_TEMPLATES, and each substituted form actually renders', async () => {
    // NOTE (C7 Task 10/12/15): the key-equality check below covers all of
    // CAPTION_TEMPLATES — every entry, including 'ui:account.casefilesOne'/
    // 'casefilesMany', now ALSO has a real render assertion following it;
    // none of the C7 entries remain gapped.
    // NOTE (C8 Task 10): the five 'ui:interp.discardNote'/'ui:facts.*'
    // entries added above DO reopen the gap, deliberately — their mounting
    // components (InterpConfirmScreen, FactChips) don't exist until Tasks
    // 12/13. The key-equality pin below still holds (CAPTION_SUBSTITUTIONS
    // supplies a substituted STRING for all five), it is only the render
    // assertion that is deferred, same incremental step the C7 entries took
    // before their own screens existed.
    expect(Object.keys(CAPTION_SUBSTITUTIONS).sort()).toEqual([...CAPTION_TEMPLATES].sort())

    const { container: trustContainer } = render(
      <DiagnosisScreen
        serviceLabel="X" engineKey="passport" d={classifiedDiagnosis}
        answerLabels={{}} trustOpen onToggleTrust={noop}
        appliedText={null} caseFacts={[]}
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

    // C7 (Task 12) — SaveOtpScreen. `lede`'s `{dest}` substitution needs no
    // clock at all (design note 1 / D12), so it renders off a plain mount.
    // `resendWaitMany`'s `{n}` substitution is the ONE CAPTION_TEMPLATES
    // entry in this whole file that is genuinely wall-clock-LIVE rather
    // than driven by an injected `now`/date prop (SaveOtpScreen.tsx's own
    // design note 4) — a fake, pinned clock is what makes '5' the exactly
    // right, non-flaky answer here, not a coincidence of real elapsed time.
    const { container: otpLedeContainer } = render(
      <SaveOtpScreen
        authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
        otpResent={false} otpCooldownUntil={null} now={CASE_NOW} dispatch={noop}
      />,
    )
    expect(otpLedeContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:saveOtp.lede'])

    vi.useFakeTimers()
    vi.setSystemTime(CASE_NOW)
    try {
      const { container: otpWaitContainer } = render(
        <SaveOtpScreen
          authMethod="phone" authId="+919876543210" otp="" authErr={null} authBusy={false}
          otpResent={false} otpCooldownUntil={CASE_NOW + 5000} now={CASE_NOW} dispatch={noop}
        />,
      )
      expect(otpWaitContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:saveOtp.resendWaitMany'])
    } finally {
      vi.useRealTimers()
    }

    // C7 (Task 15) — the account popover. casefilesOne's substituted form
    // (openN===1) is reachable off the SAME uiContainer mount above — its
    // dedicated AccountChip fixture is seeded with exactly one still_open
    // case plus one superseded one (savedCases: [openCase,
    // closedSupersededCase]), so this also doubles as a live proof that a
    // superseded case is not counted. casefilesMany needs its own render,
    // with a SECOND still_open case added alongside the same superseded
    // one — proving the exclusion holds at n=2 too, not just n=1.
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:account.casefilesOne'])

    // C8 (Task 17) — the last five gapped entries, closed. All five come off
    // the SAME uiContainer mount above (the three InterpConfirmScreen mounts
    // and the UnplaceablePanel mount App.tsx's router now composes), except
    // the two edit-mode aria-labels, which are INTERACTION_GATED and are
    // therefore driven by a real Edit click below — never by short-circuiting
    // the gate with a hand-set `factEditIdx` prop.
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:interp.discardNote'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:interp.summary.matchedMany'])
    expect(uiContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:interp.summary.factsMany'])
    // The chip aria-labels are ATTRIBUTES, so `textContent` cannot see them —
    // read the same way the bucket sweep above reads them.
    const uiAriaLabels = Array.from(uiContainer.querySelectorAll('[aria-label]'))
      .map(el => el.getAttribute('aria-label') ?? '')
      .join(' ')
    expect(uiAriaLabels).toContain(CAPTION_SUBSTITUTIONS['ui:facts.editValueAria'])
    expect(uiAriaLabels).toContain(CAPTION_SUBSTITUTIONS['ui:facts.removeValueAria'])

    const { container: chipsContainer } = render(<EditableFactChips facts={[FILE_NUMBER_FACT]} />)
    await userEvent.click(
      within(chipsContainer).getByRole('button', { name: CAPTION_SUBSTITUTIONS['ui:facts.editValueAria'] }),
    )
    const chipsAriaLabels = Array.from(chipsContainer.querySelectorAll('[aria-label]'))
      .map(el => el.getAttribute('aria-label') ?? '')
      .join(' ')
    expect(chipsAriaLabels).toContain(CAPTION_SUBSTITUTIONS['ui:facts.editLabel'])
    expect(chipsAriaLabels).toContain(CAPTION_SUBSTITUTIONS['ui:facts.saveLabel'])

    const { container: acctManyContainer } = render(
      <AccountChip
        state={{
          ...initialSession, user: acctUnnamedUser, acctOpen: true,
          savedCases: [openCase, yesterdayCase, closedSupersededCase],
        }}
        dispatch={noop}
      />,
    )
    expect(acctManyContainer.textContent).toContain(CAPTION_SUBSTITUTIONS['ui:account.casefilesMany'])
  })

  // `INTERACTION_GATED` needs no membership pin here (fix-round review
  // finding): it is imported from the single shared `./interactionGated`
  // module, so there is nothing left for this file to drift out of sync
  // with. Its coverage guarantee — that every entry actually renders under
  // a real interaction — is mechanized in `interactionGated.test.tsx` via a
  // `Record` of per-entry assertions keyed identically, with a STRICT
  // equality assertion that those keys equal `[...INTERACTION_GATED]` (fix
  // round 1, Finding I-4). Three entries (`ui:facts.editLabel`/
  // `saveLabel`, `ui:prepare.hintFilledUnreviewed`) are correctly still red
  // there, owed to Tasks 13/15 — see that file's own header comment.
})

// ===========================================================================
// C8 Task 17, design note 6 — the repo-wide source-scan regression pins.
//
// They live in THIS file, and they all walk the source through the SAME
// `allSrcTextFiles` helper C7's D1 sweep above already uses (lifted to module
// scope by this task for exactly that reason). One walker, not two: a second
// implementation would be a second place to keep the fonts carve-out, the
// test-file carve-out and the recursion correct, with nothing to catch a
// divergence.
//
// What each of these actually buys, stated once here rather than repeated at
// every `it`: `interpretGates.ts`'s `__gated` brand makes it impossible for a
// PROVIDER to forge a gated result — it says nothing at all about whether
// somebody bypasses the gate on the way to building one. These call-site pins
// are the other half. Two mechanisms, and neither substitutes for the other.
// ===========================================================================

/** Every non-test `.ts`/`.tsx` file under `src/` — the application source, as
 *  `guardrails/isolation.test.ts`'s own `applicationTsFiles` means it. A
 *  narrowing of `allSrcTextFiles` (which is deliberately broader, since the
 *  D1 sweep asks about `.md`/`.css`/`.json` too), never a second walk. */
function appSourceFiles(): string[] {
  return allSrcTextFiles(srcRoot()).filter(f => /\.tsx?$/i.test(f))
}

/** A repo-relative, POSIX-separated path, so an assertion's expected value
 *  reads the same on every platform and in every failure message. */
function relPath(file: string): string {
  return file.split(sep).join('/').replace(/^.*\/src\//, 'src/')
}

/** Source with comments removed, so a call site is a CALL and not a mention.
 *  Several of the modules below discuss these very function names in prose
 *  (`simInterpreter.ts` explains why it does NOT call `gateInterpretation`;
 *  `session.ts` quotes `gateFacts(engine, text, raw.facts)` inside a comment),
 *  and a naive grep counts those as call sites — which would make every count
 *  below wrong in the direction that hides a real regression.
 *
 *  Block comments first, then line comments. The one known imprecision: a
 *  `//` inside a string literal (a URL) truncates the rest of that line. No
 *  file in `src/` puts a call after a URL on the same line, and a truncation
 *  can only ever REMOVE a call site — it can never invent one — so the counts
 *  below stay conservative in the safe direction. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Where `name` is CALLED, keyed by repo-relative path, with a count per
 *  file. `(?<!function\s)` excludes the declaration itself — `export function
 *  gateInterpretation(` is a definition, not a call site, and counting it
 *  would make "exactly one call site" mean "zero real callers". */
function callSitesOf(name: string): Record<string, number> {
  const re = new RegExp(String.raw`(?<!function\s)\b${name}\s*\(`, 'g')
  const out: Record<string, number> = {}
  for (const file of appSourceFiles()) {
    const hits = stripComments(readFileSync(file, 'utf8')).match(re)
    if (hits) out[relPath(file)] = hits.length
  }
  return out
}

/** The body of the function whose declaration starts with `header`, from that
 *  header to the first closing brace at column 0 after it — which is what a
 *  top-level `function` declaration's own closing brace is in every file
 *  scanned here. Used to prove a call sits INSIDE a particular function, not
 *  merely somewhere in the same file. */
function functionBody(source: string, header: string): string {
  const start = source.indexOf(header)
  if (start === -1) throw new Error(`functionBody: no declaration matching "${header}"`)
  const end = source.indexOf('\n}', start)
  if (end === -1) throw new Error(`functionBody: no column-0 closing brace after "${header}"`)
  return source.slice(start, end)
}

describe('C8 Task 17: the repo-wide scope-exclusion pins (design note 6)', () => {
  it('no `fetch` anywhere in non-test src/ — there is no live Gemini call before Task 18, and the simulator is the only provider registered', () => {
    const offenders = appSourceFiles()
      .filter(f => /\bfetch\s*\(/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(relPath)
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('`gateInterpretation` is called from exactly TWO places, both named — the `__gated` brand stops a provider forging a gated result; THIS pin is what stops anyone skipping the gate. Two mechanisms, and neither substitutes for the other', () => {
    // CORRECTION to task-17-brief.md, which asks for "exactly ONE non-test
    // call site". Verified against the real source: there are TWO, and the
    // second is not a bypass — it is Task 6 fix round 1's deliberate decision
    // that `INTERPRETATION_FAILED` must synthesise its fail-closed
    // unplaceable value through "the SAME sole legitimate constructor every
    // real interpretation uses ... never the raw `__gated` brand escape
    // hatch" (session.ts's own comment on that arm). A pin that demanded ONE
    // would force that arm to reach for the escape hatch, which is the exact
    // harm this pin exists to prevent. So the pin is an exhaustive
    // ENUMERATION rather than a count: adding a third call site fails here
    // and has to be justified in this comment, which is strictly stronger
    // than a bare number.
    expect(callSitesOf('gateInterpretation')).toEqual({
      'src/session/interpretation.ts': 1, // the orchestrator — every provider, one place
      'src/session/session.ts': 1, // INTERPRETATION_FAILED's fail-closed synthesis
    })
  })

  it('`gateFacts` has exactly ONE call site, and it is inside `gateInterpretation` — an app-side fact rule that a provider path can route around is not a rule; in the prototype these rules lived in the simulator and would never have run against Gemini', () => {
    expect(callSitesOf('gateFacts')).toEqual({ 'src/domain/interpretGates.ts': 1 })
    const gatesSrc = stripComments(readFileSync(join(srcRoot(), 'domain', 'interpretGates.ts'), 'utf8'))
    expect(functionBody(gatesSrc, 'export function gateInterpretation(')).toMatch(/\bgateFacts\s*\(/)
  })

  it('`runInterpretation` has exactly ONE call site, and it is `DescribeBlock` (I5) — one entry point, not two: an earlier draft of this plan said the interpreter was called from both the block and an App.tsx effect, and two call sites is two places for the stale-resolve guard to be forgotten', () => {
    expect(callSitesOf('runInterpretation')).toEqual({ 'src/templates/DescribeBlock.tsx': 1 })
  })

  it('`describeItEnabled` has exactly THREE call sites (Task 1 design note 3) — the entry row, the orchestrator, and the router guard', () => {
    expect(callSitesOf('describeItEnabled')).toEqual({
      'src/templates/DescribeBlock.tsx': 1, // the entry row never renders with the flag off
      'src/session/interpretation.ts': 1, // the orchestrator refuses with the flag off
      'src/App.tsx': 1, // Task 17's router guard — the third and last read site
    })
  })

  it('`provenanceLabel` has exactly ONE call site, and it is inside `runInterpretation` (D17/C3) — provenance derived anywhere later is provenance derived from whatever `VITE_INTERPRETER` happens to say at that later moment', () => {
    expect(callSitesOf('provenanceLabel')).toEqual({ 'src/session/interpretation.ts': 1 })
    const orchestratorSrc = stripComments(readFileSync(join(srcRoot(), 'session', 'interpretation.ts'), 'utf8'))
    expect(functionBody(orchestratorSrc, 'export async function runInterpretation(')).toMatch(/\bprovenanceLabel\s*\(/)
  })

  it('`caseSnapshot` reads no `import.meta.env` and makes no interpreter-selection call (D17) — it copies the provenance it is HANDED, and never re-derives one at save time', () => {
    const casefileSrc = stripComments(readFileSync(join(srcRoot(), 'domain', 'casefile.ts'), 'utf8'))
    const body = functionBody(casefileSrc, 'export function caseSnapshot(')
    expect(body).not.toMatch(/import\.meta\.env/)
    expect(body).not.toMatch(/\binterpreterId\s*\(/)
    expect(body).not.toMatch(/\bprovenanceLabel\s*\(/)
    expect(body).not.toMatch(/\bdescribeItEnabled\s*\(/)
  })

  it('`session.ts` reads no `import.meta.env` at all — the reducer is pure, and C3\'s fix removed the one design that would have needed it', () => {
    const sessionSrc = stripComments(readFileSync(join(srcRoot(), 'session', 'session.ts'), 'utf8'))
    expect(sessionSrc).not.toMatch(/import\.meta\.env/)
    // The whole repo, for good measure: exactly two modules may read it, and
    // both read it LAZILY inside a function (featureFlags.ts's own header
    // note explains why a module-scope read freezes the value before any test
    // can set it).
    const readers = appSourceFiles()
      .filter(f => /import\.meta\.env/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(relPath)
      .sort()
    expect(readers).toEqual(['src/session/featureFlags.ts', 'src/session/supabase.ts'])
  })

  it("no `console.*` call in non-test src/ carries `text`, `span` or `value` (exclusion 9) — the citizen's own words, the model's justifying span and an extracted fact value must never reach a log", () => {
    const offenders: string[] = []
    for (const file of appSourceFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'))
      for (const call of src.match(/\bconsole\s*\.\s*\w+\s*\([^)]*\)/g) ?? []) {
        if (/\b(text|span|value)\b/.test(call)) offenders.push(`${relPath(file)}: ${call}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
