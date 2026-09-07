import { describe, it, expect } from 'vitest'
import { degradedFor, changedOnFor, verifiedDateFor, type FreshnessFile } from './freshness'
import type { PlaybookRule } from './types'

// Toy fixtures, same convention as engine.test.ts — domain/ tests never
// exercise real playbook/manifest data, only the generic mechanism.
const rule = (id: string, docId: string | null): PlaybookRule => ({
  id,
  condition: () => true,
  rec: 'WAIT',
  state: `st-${id}`,
  label: `Toy label ${id}`,
  dependency: 'Toy dependency',
  explanation: 'Toy explanation.',
  whatShort: 'Toy short.',
  whatToDo: 'Toy what to do.',
  where: { label: 'Toy channel' },
  need: 'Toy need.',
  source: { docId, title: 'Toy source' },
})

const okData: FreshnessFile = {
  checkedAt: '2026-09-07T00:00:00Z',
  documents: {
    'doc-a.pdf': { status: 'ok', lastChecked: '2026-09-05T10:00:00Z', checkedFrom: 'ci' },
    'doc-b.pdf': { status: 'unreachable', checkedFrom: 'ci' },
  },
}

const changedData: FreshnessFile = {
  checkedAt: '2026-09-07T00:00:00Z',
  documents: {
    'doc-a.pdf': { status: 'ok', lastChecked: '2026-09-05T10:00:00Z', checkedFrom: 'ci' },
    'doc-b.pdf': { status: 'changed', changedOn: '2026-09-06', liveSha256: 'deadbeef', checkedFrom: 'ci' },
    'doc-c.pdf': { status: 'changed', changedOn: '2026-09-01', liveSha256: 'cafef00d', checkedFrom: 'local' },
  },
}

describe('degradedFor', () => {
  it('is false when nothing cited by these rules is changed', () => {
    const rules = [rule('r1', 'doc-a.pdf'), rule('r2', 'doc-b.pdf')]
    expect(degradedFor(rules, okData)).toBe(false)
  })

  it('is true when at least one cited document is changed', () => {
    const rules = [rule('r1', 'doc-a.pdf'), rule('r2', 'doc-b.pdf')]
    expect(degradedFor(rules, changedData)).toBe(true)
  })

  it('a rule with no source (docId null, the UNCLASSIFIED safety net) never degrades anything on its own', () => {
    const rules = [rule('safety-net', null)]
    expect(degradedFor(rules, changedData)).toBe(false)
  })

  it('an UNREACHABLE document never degrades anything — only a confirmed CHANGED does', () => {
    const rules = [rule('r1', 'doc-b.pdf')]
    expect(degradedFor(rules, okData)).toBe(false) // doc-b.pdf is 'unreachable' in okData
  })

  it('a document this engine does not cite at all has no effect, even if changed', () => {
    const rules = [rule('r1', 'doc-a.pdf')] // never cites doc-b.pdf or doc-c.pdf
    expect(degradedFor(rules, changedData)).toBe(false)
  })

  it('a document with no freshness.json entry at all (manual/none check mode) never degrades', () => {
    const rules = [rule('r1', 'doc-never-checked.txt')]
    expect(degradedFor(rules, changedData)).toBe(false)
  })
})

describe('changedOnFor', () => {
  it('returns null when nothing is degraded', () => {
    const rules = [rule('r1', 'doc-a.pdf')]
    expect(changedOnFor(rules, okData)).toBeNull()
  })

  it('returns the single changed document\'s date, formatted "d Mon yyyy" — NOT the raw ISO string check_freshness.py writes', () => {
    const rules = [rule('r1', 'doc-a.pdf'), rule('r2', 'doc-b.pdf')]
    expect(changedOnFor(rules, changedData)).toBe('6 Sep 2026')
  })

  it('returns the EARLIEST date when multiple cited documents are changed — never a fabricated aggregate — sorted on the ISO form, THEN formatted', () => {
    const rules = [rule('r1', 'doc-b.pdf'), rule('r2', 'doc-c.pdf')]
    expect(changedOnFor(rules, changedData)).toBe('1 Sep 2026')
  })

  it('sorts correctly across a month boundary — a raw-ISO lexical sort done AFTER formatting would get this wrong', () => {
    const crossMonth: FreshnessFile = {
      checkedAt: '2026-09-07T00:00:00Z',
      documents: {
        'doc-late.pdf': { status: 'changed', changedOn: '2026-10-01', checkedFrom: 'ci' },
        'doc-early.pdf': { status: 'changed', changedOn: '2026-09-30', checkedFrom: 'ci' },
      },
    }
    const rules = [rule('r1', 'doc-late.pdf'), rule('r2', 'doc-early.pdf')]
    expect(changedOnFor(rules, crossMonth)).toBe('30 Sep 2026')
  })
})

describe('verifiedDateFor', () => {
  it('formats a covered document\'s lastChecked as "d Mon yyyy"', () => {
    expect(verifiedDateFor('doc-a.pdf', okData)).toBe('5 Sep 2026')
  })

  it('returns null for a docId with no freshness.json entry (manual/none check mode) — caller falls back to SOURCES_VERIFIED', () => {
    expect(verifiedDateFor('doc-never-checked.txt', okData)).toBeNull()
  })

  it('returns null for a null docId (the UNCLASSIFIED safety net)', () => {
    expect(verifiedDateFor(null, okData)).toBeNull()
  })

  it('returns null for a document with no lastChecked at all (e.g. unreachable on its very first run, never yet verified)', () => {
    expect(verifiedDateFor('doc-b.pdf', okData)).toBeNull() // doc-b.pdf is 'unreachable', no lastChecked
  })
})
