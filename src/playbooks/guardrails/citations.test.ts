import { describe, it, expect } from 'vitest'
import { citationFindings, orphanFindings, SAFETY_NET_TITLE } from './citations'
import type { Playbook, PlaybookRule } from '../../domain/types'

const rule = (id: string, source: PlaybookRule['source']): PlaybookRule => ({
  id,
  condition: () => false,
  rec: 'WAIT',
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source,
})

const fallback = (source: PlaybookRule['source']): Playbook['fallback'] => ({
  rec: 'UNCLASSIFIED',
  state: 'st-fallback',
  label: 'Toy unclear',
  dependency: 'Unknown',
  explanation: 'Toy fallback.',
  whatShort: 'Toy check directly.',
  whatToDo: 'Toy check status.',
  where: { label: 'Toy portal' },
  need: 'Toy need.',
  source,
})

// 'state-1' is a real manifest entry (Citizens_Charter.pdf). The harness is
// exercised against the REAL manifest — the only thing that proves it would
// catch a real miscitation.
const clean: Playbook = {
  serviceId: 'toy',
  rules: [rule('state-1', { docId: 'Citizens_Charter.pdf', title: "Citizen's Charter (MEA)" })],
  fallback: fallback({ docId: null, title: SAFETY_NET_TITLE }),
}

const withRule = (r: PlaybookRule): Playbook => ({ ...clean, rules: [r] })

describe('citationFindings', () => {
  it('reports nothing for a rule whose docId matches its manifest entry', () => {
    expect(citationFindings(clean)).toEqual([])
  })

  it('flags a rule with no manifest entry at all', () => {
    const f = citationFindings(withRule(rule('toy-unknown', { docId: 'Citizens_Charter.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/toy-unknown.*no sources\/manifest\.json entry/i)
  })

  it('flags a rule whose docId disagrees with its manifest entry', () => {
    const f = citationFindings(withRule(rule('state-1', { docId: 'FAQ_SIR2026.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/state-1.*disagrees.*Citizens_Charter\.pdf/i)
  })

  it('flags a rule whose docId is not a known document', () => {
    const f = citationFindings(withRule(rule('state-1', { docId: 'nope.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/state-1.*unknown document/i)
  })

  it('flags a live rule citing a dormant manifest entry', () => {
    const f = citationFindings(withRule(rule('s-duplicate', { docId: 'FAQ_SIR2026.pdf', title: 'x' })))
    expect(f.join('\n')).toMatch(/s-duplicate.*dormant/i)
  })

  it('flags a rule that carries the safety-net docId (null) instead of a citation', () => {
    const f = citationFindings(withRule(rule('state-1', { docId: null, title: 'x' })))
    expect(f.join('\n')).toMatch(/state-1.*only the fallback/i)
  })

  it('flags a fallback whose docId is not null', () => {
    const f = citationFindings({
      ...clean,
      fallback: fallback({ docId: 'Citizens_Charter.pdf', title: SAFETY_NET_TITLE }),
    })
    expect(f.join('\n')).toMatch(/fallback.*docId must be null/i)
  })

  it('flags a fallback whose title is not the safety-net line (both conditions, not either)', () => {
    const f = citationFindings({ ...clean, fallback: fallback({ docId: null, title: 'Something else' }) })
    expect(f.join('\n')).toMatch(/fallback.*safety-net title/i)
  })

  it('identifies the fallback by discriminator, not by string-matching a document title', () => {
    // The safety-net title is deliberately NOT a manifest document title.
    expect(SAFETY_NET_TITLE).toMatch(/safety net/i)
    expect(citationFindings(clean)).toEqual([])
  })
})

describe('orphanFindings', () => {
  it('flags a live manifest entry that no shipped rule claims', () => {
    expect(orphanFindings([clean]).join('\n')).toMatch(/v-1.*orphan/i)
  })

  it('never flags a dormant entry as an orphan', () => {
    // BOTH of the manifest's dormant entries. s-5-dormant-final-roll only
    // passes this because Task 1 Step 7(b3) corrected its status from
    // 'verified' to 'dormant'; left as shipped it is a live orphan and this
    // assertion is what catches it.
    const f = orphanFindings([clean]).join('\n')
    expect(f).not.toMatch(/s-duplicate/)
    expect(f).not.toMatch(/s-5-dormant-final-roll/)
  })
})
