import { describe, it, expect } from 'vitest'
import {
  BANNED_PATTERNS, SAFETY_EXEMPTIONS, CAUSE_STATES, COPY_FIELDS,
  copyStrings, extraCopy, bannedFindings, staleExemptionFindings,
  numericFindings, retiredActionFindings, causeStateFindings,
} from './contentSafety'
import type { Playbook, PlaybookRule } from '../../domain/types'
import { SAFETY_NET_TITLE } from './citations'

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
  it('carries the seven hand-authored rows plus the documented hyphen extension', () => {
    expect(BANNED_PATTERNS).toHaveLength(8)
    for (const row of BANNED_PATTERNS) expect(row.reason.length).toBeGreaterThan(0)
  })

  it('catches the hyphenated interval the original row misses', () => {
    const original = BANNED_PATTERNS[0].pattern
    expect(original.test('15-day')).toBe(false)
    expect(BANNED_PATTERNS.some(r => r.pattern.test('15-day'))).toBe(true)
  })
})

describe('copyStrings', () => {
  it('collects the citizen-facing fields, where.label and needList items', () => {
    const ats = copyStrings(book([
      rule('toy-1', { needList: ['Item one', 'Item two'], howLong: 'Toy how long.', expectNext: 'Toy expect next.' }),
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
