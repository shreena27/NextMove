import { describe, it, expect } from 'vitest'
import {
  BANNED_PATTERNS, SAFETY_EXEMPTIONS, CAUSE_STATES, COPY_FIELDS,
  NUMERIC_EXEMPTIONS, staleNumericExemptionFindings,
  copyStrings, extraCopy, bannedFindings, staleExemptionFindings,
  numericFindings, retiredActionFindings, causeStateFindings,
} from './contentSafety'
import type { Playbook, PlaybookRule } from '../../domain/types'
import { SAFETY_NET_TITLE } from './citations'
import { passportPlaybook, PASSPORT_STAGE_SHORT } from '../passportPlaybook'
import { voterPlaybook } from '../voterPlaybook'
import { sirPlaybook, sirCopyExtras } from '../sirPlaybook'
// UI is screens/-owned application data, not guardrail harness — importing
// it here is the same direction contentSafety.test.ts already imports
// passportPlaybook/voterPlaybook/sirPlaybook from playbooks/ in (a TEST
// file reading real, shipped copy to prove the mechanism against it, not
// the harness reaching INTO application code). guardrails/isolation.test.ts
// only restricts the reverse direction (application code importing
// guardrails/), and only for non-test files — see that file's own header.
import { UI } from '../../screens/screenCopy'

const rule = (id: string, over: Partial<PlaybookRule> = {}): PlaybookRule => ({
  id,
  condition: () => false,
  rec: 'WAIT',
  state: `st-${id}`,
  label: 'Toy label',
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source: { docId: 'Citizens_Charter.pdf', title: 'Toy source' },
  mustNot: 'Toy must-not.',
  ...over,
})

const book = (rules: PlaybookRule[]): Playbook => ({
  serviceId: 'toy',
  rules,
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'st-fallback',
    label: 'Toy unclear',
    dependency: 'Unknown',
    explanation: 'Toy fallback.',
    whatShort: 'Toy check directly.',
    whatToDo: 'Toy check status.',
    where: { label: 'Toy portal' },
    need: 'Toy need.',
    source: { docId: null, title: SAFETY_NET_TITLE },
  },
})

describe('the lifted BANNED_PATTERNS table', () => {
  it('carries the seven hand-authored rows plus the documented hyphen and plural-deadline extensions', () => {
    expect(BANNED_PATTERNS).toHaveLength(9)
    for (const row of BANNED_PATTERNS) expect(row.reason.length).toBeGreaterThan(0)
  })

  it('catches the hyphenated interval the original row misses', () => {
    const original = BANNED_PATTERNS[0].pattern
    expect(original.test('15-day')).toBe(false)
    expect(BANNED_PATTERNS.some(r => r.pattern.test('15-day'))).toBe(true)
  })

  it('catches plural "deadlines" the original deadline row misses (word boundary requires it right after "deadline")', () => {
    const original = BANNED_PATTERNS.find(r => r.id === 'deadline')!.pattern
    expect(original.test('sourced numeric deadlines')).toBe(false)
    expect(BANNED_PATTERNS.some(r => r.pattern.test('sourced numeric deadlines'))).toBe(true)
  })
})

describe('copyStrings', () => {
  it('collects the citizen-facing fields, where.label and needList items', () => {
    const ats = copyStrings(book([
      rule('toy-1', {
        needList: ['Item one', 'Item two'],
        howLong: 'Toy how long.',
        expectNext: 'Toy expect next.',
        rungLabel: 'Toy rung.',
      }),
    ])).map(s => s.at)
    for (const f of COPY_FIELDS) expect(ats).toContain(`toy:toy-1.${f}`)
    expect(ats).toContain('toy:toy-1.where.label')
    expect(ats).toContain('toy:toy-1.needList[0]')
    expect(ats).toContain('toy:toy-1.needList[1]')
    expect(ats).toContain('toy:fallback.explanation')
  })

  it('never scans mustNot, state or source.quote', () => {
    const ats = copyStrings(book([rule('toy-1')])).map(s => s.at)
    expect(ats.some(a => a.endsWith('.mustNot'))).toBe(false)
    expect(ats.some(a => a.endsWith('.state'))).toBe(false)
    expect(ats.some(a => a.includes('source'))).toBe(false)
  })

  it('scans rungLabel when a rule declares one (stage·rung decoration is citizen-facing text)', () => {
    const ats = copyStrings(book([rule('toy-1', { rungLabel: 'Stage 2 of 3' })])).map(s => s.at)
    expect(ats).toContain('toy:toy-1.rungLabel')
  })

  it('produces no rungLabel entry when a rule does not declare one', () => {
    const ats = copyStrings(book([rule('toy-1')])).map(s => s.at)
    expect(ats.some(a => a.endsWith('.rungLabel'))).toBe(false)
  })
})

describe('bannedFindings', () => {
  it('reports nothing for clean copy', () => {
    expect(bannedFindings(copyStrings(book([rule('toy-1')])))).toEqual([])
  })

  it.each([
    ['whatToDo', 'Wait 30 days and then follow up.', /day\/week\/month/i],
    ['whatToDo', 'The deadline is fixed.', /deadline/i],
    ['explanation', 'Approval is guaranteed.', /guarantee/i],
    ['explanation', 'We submitted your form for you.', /submitted/i],
    ['explanation', 'We filed the grievance.', /filed/i],
    ['explanation', 'NextMove is an official government service.', /affiliation/i],
    ['explanation', 'It was rejected because your address was wrong.', /causal/i],
    ['howLong', 'A 15-day window applies.', /day\/week\/month/i],
  ])('flags %s copy: %s', (field, text, reason) => {
    const findings = bannedFindings(copyStrings(book([rule('toy-1', { [field]: text })])))
    expect(findings.join('\n')).toMatch(reason)
  })

  it('honours an exemption row', () => {
    const exempt = SAFETY_EXEMPTIONS[0]
    const strings = [{ at: exempt.at, text: 'The official page publishes no numeric deadline.' }]
    expect(bannedFindings(strings)).toEqual([])
  })

  it('an exemption is scoped to one field, not to the whole rule', () => {
    const exempt = SAFETY_EXEMPTIONS[0]
    const otherField = `${exempt.at.split('.')[0]}.explanation`
    const findings = bannedFindings([{ at: otherField, text: 'The deadline is fixed.' }])
    expect(findings.join('\n')).toMatch(/deadline/i)
  })

  it('an exemption is scoped to ONE pattern, not to every pattern at that location', () => {
    // The hole this closes: a row exempted only for the causal false-positive
    // used to silence affiliation claims, "guaranteed", and invented day-counts
    // at the very same string.
    const exempt = SAFETY_EXEMPTIONS[0] // the 'deadline' row at state-5b.howLong
    const f = bannedFindings([
      { at: exempt.at, text: 'No numeric deadline is published, and approval is guaranteed.' },
    ]).join('\n')
    expect(f).toMatch(/guarantee/i)             // the unexempted pattern still fires
    expect(f).not.toMatch(/invented deadline/i) // the exempted one stays suppressed
  })

  it('composes with the manifest interval allowlist instead of re-flagging sourced copy', () => {
    // The real SIR copy states a sourced "15 days" / "15-day". numericFindings
    // already clears it via sourced_intervals.allowed_in; bannedFindings must
    // defer to that verdict rather than force the same copy onto a second,
    // hand-maintained allowlist.
    expect(bannedFindings([{ at: 'sir:s-final-absent.whatShort', text: 'File an appeal within 15 days' }])).toEqual([])
    expect(bannedFindings([{ at: 'sir:SIR_PHASES.final_roll.note', text: 'a 15-day appeal window applies' }])).toEqual([])
  })

  it('still flags a sourced interval at a location it is NOT allow-listed for', () => {
    const f = bannedFindings([{ at: 'passport:state-1.whatToDo', text: 'File an appeal within 15 days' }])
    expect(f.join('\n')).toMatch(/day\/week\/month/i)
  })

  it('still flags a day-count with no sourced_intervals entry at all', () => {
    const f = bannedFindings([{ at: 'sir:s-final-absent.whatShort', text: 'Wait 45 days.' }])
    expect(f.join('\n')).toMatch(/day\/week\/month/i)
  })
})

describe('staleExemptionFindings', () => {
  it('flags an exemption that no longer matches anything', () => {
    const findings = staleExemptionFindings([{ at: 'toy-1.whatToDo', text: 'Clean copy.' }])
    expect(findings.length).toBe(SAFETY_EXEMPTIONS.length)
    expect(findings.join('\n')).toMatch(/no longer matches/i)
  })

  it("the sir:s-final-absent.howLong deadline-plural exemption still matches the real shipped copy (not stale)", () => {
    const sirStrings = copyStrings(sirPlaybook)
    const real = sirStrings.find(s => s.at === 'sir:s-final-absent.howLong')!
    expect(real).toBeDefined()
    expect(real.text).toMatch(/\bdeadlines\b/i)

    const stale = staleExemptionFindings(sirStrings).filter(f => f.includes('"sir:s-final-absent.howLong"'))
    expect(stale).toEqual([])

    // And with that one string's text swapped for something that doesn't say
    // "deadlines" at all, the exemption WOULD be flagged — proving the check
    // actually bites, not just that it's vacuously satisfied.
    const withoutDeadlines = sirStrings.map(s => (s.at === real.at ? { ...s, text: 'Clean copy with no banned words.' } : s))
    const nowStale = staleExemptionFindings(withoutDeadlines).filter(f => f.includes('"sir:s-final-absent.howLong"'))
    expect(nowStale.join('\n')).toMatch(/deadline-plural.*no longer matches/i)
  })
})

describe('numericFindings (manifest-backed allowlists)', () => {
  it('allows an interval at an allow-listed location', () => {
    expect(numericFindings([{ at: 'sir:s-final-absent.whatShort', text: 'File an appeal within 15 days' }])).toEqual([])
  })

  it('flags the same interval at a location that is not allow-listed', () => {
    const f = numericFindings([{ at: 'passport:state-1.whatToDo', text: 'File an appeal within 15 days' }])
    expect(f.join('\n')).toMatch(/15 day.*not allowed in passport:state-1\.whatToDo/i)
  })

  it('flags an interval that is not in sourced_intervals at all', () => {
    const f = numericFindings([{ at: 'sir:s-final-absent.whatShort', text: 'Wait 45 days.' }])
    expect(f.join('\n')).toMatch(/45 day.*no sourced_intervals entry/i)
  })

  it('allows an allow-listed date at its allow-listed location', () => {
    expect(numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'closes 30 Sep 2026 in Delhi.' }])).toEqual([])
  })

  it("flags the ERO's 29 Oct disposal date used in a citizen filing instruction (the recorded P0 regression)", () => {
    const f = numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'File Form 6 through 29 Oct 2026.' }])
    expect(f.join('\n')).toMatch(/29 Oct.*not allowed in sir:s-roll-absent\.howLong/i)
  })

  it('flags a date with the wrong year even at an allow-listed location', () => {
    const f = numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'closes 30 Sep 2027 in Delhi.' }])
    expect(f.join('\n')).toMatch(/30 Sep.*year 2027.*2026/i)
  })

  it('flags a date with no sourced_dates entry', () => {
    const f = numericFindings([{ at: 'sir:s-roll-absent.howLong', text: 'Filing opens 12 Feb 2027.' }])
    expect(f.join('\n')).toMatch(/12 Feb.*no sourced_dates entry/i)
  })

  // Fail-closed catch-all (2026-09-06 hardening): forms outside the two
  // canonical shapes used to slip past this scanner (and bannedFindings)
  // entirely, undetected — §7 says "any date or day-count outside the
  // allowlist fails the build", which was only true for the one canonical
  // spelling of each before this pass.
  it.each([
    ['30/09/2026'],
    ['30.09.2026'],
    ['30th September'],
    ['two weeks'],
    ['a fortnight'],
    ['48 hours'],
  ])('flags the non-canonical form "%s" as an unrecognised numeric/date claim', (form) => {
    const f = numericFindings([{ at: 'toy:toy-1.howLong', text: `Wait until ${form}.` }])
    expect(f.join('\n')).toMatch(/unrecognised numeric\/date claim/i)
    expect(f.join('\n')).toContain(form)
  })

  it('the full real corpus (all three playbooks + their extras) still produces zero findings', () => {
    const stageShortExtras = Object.entries(PASSPORT_STAGE_SHORT).map(
      ([key, text]) => extraCopy(`passport:PASSPORT_STAGE_SHORT.${key}`, text),
    )
    const all = [
      ...copyStrings(passportPlaybook), ...stageShortExtras,
      ...copyStrings(voterPlaybook),
      ...copyStrings(sirPlaybook), ...sirCopyExtras(),
    ]
    expect(numericFindings(all)).toEqual([])
  })
})

// D5 (C8, docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10) —
// the one exemption this project has ever granted from the numeric scan.
describe('NUMERIC_EXEMPTIONS (D5)', () => {
  it('carries exactly one entry, with a reason that says what is actually true', () => {
    expect(NUMERIC_EXEMPTIONS).toHaveLength(1)
    const [entry] = NUMERIC_EXEMPTIONS
    expect(entry.at).toBe('ui:describe.examples.passport-q1.one')
    expect(entry.match).toBe('12 March 2026')
    for (const clause of [
      'CITIZEN-authored input',
      'Not a NextMove claim',
      'Fabricating a sources/manifest.json entry',
    ]) {
      expect(entry.reason, clause).toContain(clause)
    }
  })

  it('a date identical to the real example trips the scan when it is NOT covered by any exemption (RED verification — what an empty NUMERIC_EXEMPTIONS would look like for this text)', () => {
    // Same matched text as the real exemption, but at a location
    // NUMERIC_EXEMPTIONS does not name — proving the scan's DEFAULT
    // behaviour (absent an exemption) is to fire, exactly as it does for
    // every other unsourced date.
    const f = numericFindings([{ at: 'toy:toy-1.text', text: 'applied 12 March 2026' }])
    expect(f.join('\n')).toMatch(/12 March 2026.*no sourced_dates entry/i)
  })

  it('is silent at the real exempted location, on the real registered example text (the entry present)', () => {
    const real = UI.describe.examples['passport-q1'].one
    expect(real).toContain('12 March 2026') // sanity: still the string the exemption targets
    expect(numericFindings([{ at: 'ui:describe.examples.passport-q1.one', text: real }])).toEqual([])
  })

  it('does not silence a DIFFERENT date at the SAME exempted location', () => {
    const f = numericFindings([{ at: 'ui:describe.examples.passport-q1.one', text: 'applied 4 April 2026' }])
    expect(f.join('\n')).toMatch(/4 April 2026.*no sourced_dates entry/i)
  })

  it('does not silence the SAME date at a DIFFERENT location', () => {
    const f = numericFindings([{ at: 'ui:describe.examples.passport-q1.two', text: 'applied 12 March 2026' }])
    expect(f.join('\n')).toMatch(/12 March 2026.*no sourced_dates entry/i)
  })
})

describe('staleNumericExemptionFindings', () => {
  it('flags an exemption that no longer matches anything (fixture-driven — a guardrail that has never been shown to fail is not a guardrail)', () => {
    const findings = staleNumericExemptionFindings([{ at: 'toy:toy-1.text', text: 'Clean copy, no date here.' }])
    expect(findings.length).toBe(NUMERIC_EXEMPTIONS.length)
    expect(findings.join('\n')).toMatch(/no longer matches/i)
  })

  it('the real ui:describe.examples.passport-q1.one exemption still matches the real shipped copy (not stale)', () => {
    const real = UI.describe.examples['passport-q1'].one
    const strings = [{ at: 'ui:describe.examples.passport-q1.one', text: real }]
    expect(staleNumericExemptionFindings(strings)).toEqual([])

    // And with that string's text swapped for something that doesn't say
    // "12 March 2026" at all, the exemption WOULD be flagged — proving the
    // check actually bites, not just that it is vacuously satisfied.
    const nowStale = staleNumericExemptionFindings([{ at: 'ui:describe.examples.passport-q1.one', text: 'Clean copy with no date at all.' }])
    expect(nowStale.join('\n')).toMatch(/no longer matches/i)
  })
})

describe('retiredActionFindings', () => {
  it('flags a retired-phase action in an action field', () => {
    const f = retiredActionFindings(book([rule('toy-1', { whatToDo: 'Submit the Enumeration Form now.' })]), 'claims_notice')
    expect(f.join('\n')).toMatch(/toy-1\.whatToDo.*enumeration/i)
  })

  it('does not flag the same noun in an explanation (honest history, not an instruction)', () => {
    const f = retiredActionFindings(
      book([rule('toy-1', { explanation: "Maybe the Enumeration Form wasn't deposited in time." })]),
      'claims_notice',
    )
    expect(f).toEqual([])
  })

  it('does not flag an action from a phase that has not ended', () => {
    const f = retiredActionFindings(book([rule('toy-1', { whatToDo: 'Submit the Enumeration Form now.' })]), 'enumeration')
    expect(f).toEqual([])
  })
})

describe('causeStateFindings', () => {
  it('is configured for the five §7 states', () => {
    expect(CAUSE_STATES.map(s => s.ruleId).sort())
      .toEqual(['s-notice', 's-roll-absent', 'state-4', 'v-3', 'v-4'])
  })

  it('flags a cause state with no mustNot declared', () => {
    const f = causeStateFindings(book([rule('state-4', { mustNot: undefined, explanation: "NextMove can't tell you why." })]))
    expect(f.join('\n')).toMatch(/state-4.*mustNot/i)
  })

  it('flags a cause state missing its "NextMove can\'t tell" disclaimer', () => {
    const f = causeStateFindings(book([rule('state-4', { explanation: 'It reads as negative.' })]))
    expect(f.join('\n')).toMatch(/state-4.*disclaimer/i)
  })

  it('does not require a disclaimer from v-4 (recorded deviation: no adverse outcome to explain)', () => {
    const f = causeStateFindings(book([rule('v-4', { explanation: 'Your appeal is still with the appellate authority.' })]))
    expect(f).toEqual([])
  })

  it('ignores rules that are not cause states', () => {
    expect(causeStateFindings(book([rule('state-1')]))).toEqual([])
  })
})

describe('extraCopy', () => {
  it('wraps a non-rule string (a SIR phase note) for the same scanners', () => {
    expect(extraCopy('sir:SIR_PHASES.final_roll.note', 'A 15-day appeal window applies.')).toEqual({
      at: 'sir:SIR_PHASES.final_roll.note',
      text: 'A 15-day appeal window applies.',
    })
    expect(numericFindings([extraCopy('sir:SIR_PHASES.final_roll.note', 'A 15-day appeal window applies.')])).toEqual([])
  })
})
