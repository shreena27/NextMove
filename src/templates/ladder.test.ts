import { describe, it, expect } from 'vitest'
import { ladderFor, LADDER_DEFS, LADDER_TAG, type LadderEngineKey } from './ladder'
import type { AnswerRecord, Diagnosis } from '../domain/types'

const base = (over: Partial<Diagnosis>): Diagnosis => ({
  rec: 'FOLLOW_UP',
  ruleId: 'toy-1',
  matchedAnswers: {},
  state: 'st-1',
  label: 'Original label',
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source: { docId: null, title: 'Toy source' },
  ...over,
})

describe('AC-L-1: the "next" rung equals the diagnosis\'s recommended rung', () => {
  it.each([
    // answers, engine, expected rung statuses
    [{ q1: 'adverse', q2: 'no_followup' }, 'passport', ['next', 'up', 'up']],
    [{ q1: 'adverse', q2: 'informal', fOutcome: 'pending' }, 'passport', ['now', 'up', 'up']],
    [{ q1: 'adverse', q2: 'informal' }, 'passport', ['done', 'next', 'up']],
    [{ q1: 'adverse', q2: 'formal_grievance', gOutcome: 'pending' }, 'passport', ['done', 'now', 'up']],
    [{ q1: 'adverse', q2: 'formal_grievance' }, 'passport', ['done', 'done', 'next']],
    [{ q1: 'adverse', q2: 'formal_grievance', dpgFiled: 'yes' }, 'passport', ['done', 'done', 'now']],
    [{ voterQ1: 'decision', voterAppealed: 'none' }, 'voter', ['next', 'up']],
    [{ voterQ1: 'decision', voterAppealed: 'pending' }, 'voter', ['now', 'up']],
    [{ voterQ1: 'decision', voterAppealed: 'decided' }, 'voter', ['done', 'next']],
  ] as [AnswerRecord, LadderEngineKey, string[]][])('%o', (answers, key, expected) => {
    // state '2' satisfies passport's "contact the office" fallback branch
    // (row 1); every other row resolves before d.state is ever consulted.
    const d = base({ state: '2' })
    const l = ladderFor(key, answers, d)
    expect(l).not.toBeNull()
    expect(l?.s).toEqual(expected)
  })
})

describe('the ladder stays absent where it is not in play', () => {
  it('ladderFor returns null for UNCLASSIFIED, for SIR, for passport state-1, and for an accepted-pending voter case', () => {
    expect(
      ladderFor('passport', { q1: 'adverse', q2: 'informal' }, base({ rec: 'UNCLASSIFIED', state: '6' })),
    ).toBeNull()
    expect(ladderFor('sir', {}, base({ state: 'S-1' }))).toBeNull()
    expect(ladderFor('passport', { q1: 'no_contact' }, base({ state: '1' }))).toBeNull()
    expect(
      ladderFor('voter', { voterQ1: 'decision', voterOutcome: 'accepted_pending' }, base({ state: 'V-1' })),
    ).toBeNull()
  })

  it('the ladder climbs and never descends: a resolved rung reads done, not reset', () => {
    const l = ladderFor(
      'passport',
      { q1: 'adverse', q2: 'formal_grievance', dpgFiled: 'yes', dpgOutcome: 'resolved' },
      base({ state: '5b' }),
    )
    expect(l?.s).toEqual(['done', 'done', 'done'])
  })
})

describe('the captions and rung labels are exactly the locked strings', () => {
  it('matches prototype 2746-2757 byte for byte', () => {
    expect(LADDER_DEFS.passport.title).toBe('Escalation ladder')
    expect(LADDER_DEFS.passport.rungs)
      .toEqual(['Informal follow-up', 'Formal grievance (CPGRAMS)', 'DPG escalation'])
    expect(LADDER_DEFS.voter.title).toBe('Appeal ladder')
    expect(LADDER_DEFS.voter.rungs)
      .toEqual(['First appeal — DEO / DM', 'Second appeal — state CEO'])
    expect(LADDER_TAG)
      .toEqual({ done: 'Done', now: 'In progress', next: 'Recommended now', up: '' })
  })
})
