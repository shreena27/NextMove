import { describe, it, expect } from 'vitest'
import type { Fact } from './interpret'
import { extractFacts, gateFacts, interpretFactsCopyExtras } from './interpretFacts'

describe('extractFacts — reference-number shapes (REF_SHAPES, prototype 1833-1846)', () => {
  it('passport file number (letter-bearing, no cue needed) fills the bracket directly', () => {
    const result = extractFacts('passport', 'My file number is BN1068334517807, noted on the case.')
    expect(result.facts).toEqual([
      { kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: '[File Number / ARN]' },
    ])
    expect(result.droppedSensitive).toBe(false)
  })

  it.each([
    ['ARN 123456789012'],
    ['File no 123456789012'],
    ['reference number: 123456789012'],
    ['ack no 123456789012'],
  ])('a labelled cue (%s) licenses the ARN fill (four REF_CUE alternatives)', (text) => {
    const result = extractFacts('passport', text)
    expect(result.facts).toEqual([
      { kind: 'reference_number', refType: 'arn', label: 'ARN', value: '123456789012', fills: '[File Number / ARN]' },
    ])
    expect(result.droppedSensitive).toBe(false)
  })

  it('a purely numeric shape never fills a bracket on shape alone — Aadhaar and a passport ARN are both 12 digits, inseparable in principle (FR-AI-02)', () => {
    const result = extractFacts('passport', 'my number is 123456789012')
    expect(result.facts).toEqual([])
    expect(result.droppedSensitive).toBe(true)
  })

  it.each([
    ['my aadhaar is 123456789012'],
    ['Aadhar: 123456789012'],
    ['UID 123456789012'],
  ])('an explicit Aadhaar cue (%s) refuses the number outright — never chipped, never persisted (three AADHAAR_CUE alternatives)', (text) => {
    const result = extractFacts('passport', text)
    expect(result.facts).toEqual([])
    expect(result.droppedSensitive).toBe(true)
  })

  it('the refusal never echoes the number anywhere in the returned object, including inside a serialised dump', () => {
    expect.assertions(1)
    const result = extractFacts('passport', 'my aadhaar is 123456789012')
    expect(JSON.stringify(result)).not.toContain('123456789012')
  })

  it("the cue window's edge: a cue outside the 32-char lookback does not license a fill, even though it is present earlier in the sentence — this is what stops someone \"improving\" the window into a whole-sentence search", () => {
    // "ARN" sits 40 characters before the number — well outside the 32-char
    // window (1850-1851) — so cueBefore must return false here. If the
    // window were widened into a whole-sentence search, this bare 12-digit
    // number would incorrectly be filled into the ARN/File-Number bracket
    // instead of being refused as Aadhaar-shaped. The gap is plain spaces
    // (not letters) so a real word-boundary exists right before the digit
    // run — a letter directly touching the digits would itself block the
    // \b\d{12}\b shape match for an unrelated reason and prove nothing.
    const text = `ARN${' '.repeat(40)}123456789012`
    expect(text.indexOf('123456789012') - (text.indexOf('ARN') + 'ARN'.length)).toBe(40)
    const result = extractFacts('passport', text)
    expect(result.facts).toEqual([]) // refused, not filled — the window correctly did not see "ARN"
    expect(result.droppedSensitive).toBe(true)
  })

  it('a 10-digit unlabelled number (voter \\d{9,13}, not 12 digits) becomes an honest unknown chip, not a refusal — the non-Aadhaar unlabelled path', () => {
    const result = extractFacts('voter', 'I think the number might be 1234567890 but I am not fully sure.')
    expect(result.facts).toEqual([
      { kind: 'reference_number', refType: 'unknown', label: 'A number you mentioned', value: '1234567890', fills: null },
    ])
    expect(result.droppedSensitive).toBe(false)
  })

  it.each(['voter', 'sir'] as const)('EPIC ABC1234567 fills nothing — an EPIC identifies the citizen and fills no draft bracket, deliberately (%s)', (engine) => {
    const result = extractFacts(engine, 'My EPIC number is ABC1234567.')
    expect(result.facts).toEqual([
      { kind: 'reference_number', refType: 'epic', label: 'EPIC number', value: 'ABC1234567', fills: null },
    ])
  })

  it('CPGRAMS grievance number fills its own bracket', () => {
    const result = extractFacts('passport', 'My grievance number is PGRAMS/2026/0012345.')
    expect(result.facts).toEqual([
      { kind: 'reference_number', refType: 'grievance_no', label: 'Grievance number', value: 'PGRAMS/2026/0012345', fills: '[CPGRAMS grievance number]' },
    ])
  })
})

describe('extractFacts — the taken array (M5, design note 2): two DIFFERENT containment checks', () => {
  it("(a) the shape loop's ONE-DIRECTIONAL check: a 12-digit cued ARN in a passport story produces one fact, not one per matching shape", () => {
    const result = extractFacts('passport', "I filed with ARN 123456789012 and I'm waiting on a response.")
    expect(result.facts).toHaveLength(1)
    expect(result.facts[0].refType).toBe('arn')
  })

  it('(b-i) the unknown sweep\'s BIDIRECTIONAL check, first half exercised: a candidate that CONTAINS an already-taken number is skipped — dropping "u.includes(t)" resurrects a refused/taken number as an "unknown" chip under an innocent label', () => {
    // "123456789012" is taken by the cued ARN match. "AB123456789012CD" is a
    // SEPARATE unknown-sweep candidate elsewhere in the text whose STRING
    // value contains the taken number. t.includes(u) is false here (t is
    // shorter than u) — only u.includes(t) catches this. If the sweep kept
    // only taken.some(t => t.includes(u)), this candidate would slip through
    // as a second "unknown" chip.
    const text = 'ARN 123456789012 and elsewhere I wrote AB123456789012CD by mistake.'
    const result = extractFacts('passport', text)
    expect(result.facts).toHaveLength(1)
    expect(result.facts[0]).toEqual({ kind: 'reference_number', refType: 'arn', label: 'ARN', value: '123456789012', fills: '[File Number / ARN]' })
  })

  it('(b-ii) the unknown sweep\'s BIDIRECTIONAL check, second half exercised: a candidate CONTAINED BY an already-taken (longer) string is skipped', () => {
    // "BN1068334517807" is taken by the file-number shape match. "10683345"
    // is a SEPARATE unknown-sweep candidate elsewhere in the text that is a
    // proper substring of the taken value. u.includes(t) is false here (u is
    // shorter than t) — only t.includes(u) catches this.
    const text = 'File no BN1068334517807. Also saw 10683345 written down somewhere unrelated.'
    const result = extractFacts('passport', text)
    expect(result.facts).toHaveLength(1)
    expect(result.facts[0]).toEqual({ kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: '[File Number / ARN]' })
  })

  it('the unknown sweep takes AT MOST ONE: a story with three unrecognised alphanumerics produces exactly one unknown chip', () => {
    const text = 'I saw XYZAB123 and also QRSTU456 and also LMNOP789 written on different papers.'
    const result = extractFacts('passport', text)
    const unknowns = result.facts.filter(f => f.refType === 'unknown')
    expect(unknowns).toHaveLength(1)
  })
})

describe('extractFacts — dates (1880-1887)', () => {
  it('an applied date fills its bracket', () => {
    const result = extractFacts('passport', 'I applied 12 March 2026 for renewal.')
    expect(result.facts).toEqual([
      { kind: 'date', refType: 'date_applied', label: 'Applied', value: '12 March 2026', fills: '[date you applied]' },
    ])
  })

  it('any other month-date fills nothing — its role is ambiguous', () => {
    const result = extractFacts('passport', 'The police came in June 2026.')
    expect(result.facts).toEqual([
      { kind: 'date', refType: 'date_other', label: 'Date you mentioned', value: 'June 2026', fills: null },
    ])
  })

  it('an applied date AND a genuinely different other date both appear as two separate date facts, only one with a fills', () => {
    const result = extractFacts('passport', 'Police came in June 2026 and I applied 12 March 2026 for the passport.')
    const dates = result.facts.filter(f => f.kind === 'date')
    expect(dates).toEqual([
      { kind: 'date', refType: 'date_applied', label: 'Applied', value: '12 March 2026', fills: '[date you applied]' },
      { kind: 'date', refType: 'date_other', label: 'Date you mentioned', value: 'June 2026', fills: null },
    ])
  })

  it('a story whose only date IS the applied date produces ONE date fact, not two (the 1885 suppression)', () => {
    const result = extractFacts('passport', 'I applied 12 March 2026 for renewal.')
    const dates = result.facts.filter(f => f.kind === 'date')
    expect(dates).toHaveLength(1)
  })

  it.each([
    ['last month'],
    ['3/4/25'],
    ['a few weeks ago'],
  ])('relative/ambiguous dates ("%s") produce zero date facts — there is no relative-date pattern, deliberately; adding one would create exactly the ambiguity this rule refuses', (phrase) => {
    const result = extractFacts('passport', `My status changed ${phrase}.`)
    expect(result.facts.filter(f => f.kind === 'date')).toEqual([])
  })
})

describe('extractFacts — "what you already tried" is never a fill source (spec §2)', () => {
  it('a follow-up-heavy story with no actual reference numbers produces no fills-bearing fact', () => {
    const result = extractFacts(
      'passport',
      'I already tried calling the helpline, then I visited the office in person, then I sent a message on the portal, and I also emailed twice, but nothing has moved.',
    )
    expect(result.facts.filter(f => f.fills !== null)).toEqual([])
  })
})

describe('extractFacts — purity', () => {
  it('same input twice gives deep-equal output, and mutates no argument', () => {
    const engine = 'passport' as const
    const text = 'ARN 123456789012, applied 12 March 2026.'
    const first = extractFacts(engine, text)
    const second = extractFacts(engine, text)
    expect(first).toEqual(second)
    expect(text).toBe('ARN 123456789012, applied 12 March 2026.') // strings are immutable, but pin it anyway
    // A third, unrelated call must not be polluted by any shared/global regex state.
    const unrelated = extractFacts('voter', 'My EPIC number is ABC1234567.')
    expect(unrelated.facts).toEqual([
      { kind: 'reference_number', refType: 'epic', label: 'EPIC number', value: 'ABC1234567', fills: null },
    ])
  })
})

describe('gateFacts — the C1 fix: runs the SAME rules against ANY provider output (D18)', () => {
  it("gateFacts with rawFacts: [] returns exactly extractFacts's output — the baseline every provider gets (D18; the simulator's own facts: [])", () => {
    const engine = 'passport' as const
    const text = 'ARN 123456789012, applied 12 March 2026.'
    expect(gateFacts(engine, text, [])).toEqual(extractFacts(engine, text))
  })

  it('C2\'s field-reconstruction pin: a provider fact with a spoofed label/fills/refType/kind and an invented extra key survives ONLY as the app\'s own reconstructed fields — a .filter would pass all of it through by reference', () => {
    expect.assertions(2)
    const text = 'My file number is BN1068334517807, and my Aadhaar is not in this message.'
    const rawFacts = [
      { value: 'BN1068334517807', label: 'Aadhaar', fills: '[date you applied]', refType: 'evil', kind: 'note', extra: '<script>' } as unknown as { value: string },
    ]
    const result = gateFacts('passport', text, rawFacts)
    const expected: Fact = {
      kind: 'reference_number',
      refType: 'passport_file_no',
      label: 'File Number',
      value: 'BN1068334517807',
      fills: '[File Number / ARN]',
    }
    expect(result.facts).toEqual([expected])
    expect(Object.keys(result.facts[0]).sort()).toEqual(Object.keys(expected).sort())
  })

  it("C1's provider-Aadhaar pin: an Aadhaar-shaped 12-digit value the provider LABELLED 'ARN' with fills: '[File Number / ARN]' is still refused, never chipped, never persisted — this rule must run for every provider, not just the simulator", () => {
    expect.assertions(3)
    const text = 'my aadhaar is 123456789012'
    const rawFacts = [{ value: '123456789012', label: 'ARN', fills: '[File Number / ARN]', refType: 'arn' } as unknown as { value: string }]
    const result = gateFacts('passport', text, rawFacts)
    expect(result.facts).toEqual([])
    expect(result.droppedSensitive).toBe(true)
    expect(JSON.stringify(result)).not.toContain('123456789012')
  })

  it("C1's provider-unknown-number pin: a provider fact CLAIMING fills: '[date you applied]' on an unrecognised, uncued number is rebuilt as an honest unknown chip that fills nothing — the claimed fills is discarded, not honoured", () => {
    const text = 'the number was 9988776655 as far as I remember'
    const rawFacts = [{ value: '9988776655', fills: '[date you applied]', refType: 'date_applied', label: 'Applied' } as unknown as { value: string }]
    const result = gateFacts('passport', text, rawFacts)
    expect(result.facts).toEqual([
      { kind: 'reference_number', refType: 'unknown', label: 'A number you mentioned', value: '9988776655', fills: null },
    ])
  })

  it("C1's ambiguous-date pin, provider-side: a provider fact whose value is a relative date the app cannot classify (no shape, no date pattern, no UNKNOWN_REF match) is dropped, not chipped", () => {
    const text = 'my status changed last month and nothing since'
    const result = gateFacts('passport', text, [{ value: 'last month' }])
    expect(result.facts).toEqual([])
    expect(result.droppedSensitive).toBe(false)
  })

  it.each([
    ['a paraphrase, not a verbatim substring', 'my status changed recently', 'changed a while back'],
    ['null', 'my status changed recently', null],
    ['empty string', 'my status changed recently', ''],
    ['whitespace-only', 'my status changed recently', '   '],
  ])('a provider fact whose value is %s is dropped', (_label, text, value) => {
    const result = gateFacts('passport', text, [{ value } as unknown as { value: string }])
    expect(result.facts).toEqual([])
  })

  it('a provider fact duplicating a value extractFacts already produced yields ONE chip, not two', () => {
    const text = 'My file number is BN1068334517807, filed last week.'
    const result = gateFacts('passport', text, [{ value: 'BN1068334517807' }])
    expect(result.facts).toHaveLength(1)
  })

  it('gateFacts mutates neither rawFacts nor its entries', () => {
    const text = 'ARN 123456789012, applied 12 March 2026.'
    const rawFacts = [{ value: '123456789012' }, { value: 'unrelated text not in the story' }]
    const before = structuredClone(rawFacts)
    gateFacts('passport', text, rawFacts)
    expect(rawFacts).toEqual(before)
    expect(rawFacts[0]).toEqual(before[0])
    expect(rawFacts[1]).toEqual(before[1])
  })
})

describe('interpretFactsCopyExtras — sweeps REF_SHAPES\' label strings for the content-safety scan (design note 1)', () => {
  it('returns a non-empty CopyLocation[] covering every REF_SHAPES label plus the unknown/date labels', () => {
    const extras = interpretFactsCopyExtras()
    expect(extras.length).toBeGreaterThan(0)
    for (const { at, text } of extras) {
      expect(typeof at).toBe('string')
      expect(typeof text).toBe('string')
      expect(text.length).toBeGreaterThan(0)
    }
    const texts = extras.map(e => e.text)
    expect(texts).toEqual(expect.arrayContaining(['File Number', 'ARN', 'Grievance number', 'EPIC number', 'Reference number', 'A number you mentioned']))
  })
})
