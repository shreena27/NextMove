import { describe, it, expect } from 'vitest'
import { loadManifest, loadSourceText, squash, canonicalDate, canonicalInterval } from './manifest'
// A plain JSON import — the SAME mechanism the real client bundle uses
// (domain/freshness.ts), not a second file-reading code path to keep in
// sync. Reads the actual committed bytes at test-run time either way.
import freshnessData from '../../../sources/freshness.json'
import type { FreshnessFile } from '../../domain/freshness'

const manifest = loadManifest()
// Same reason domain/freshness.ts casts this: the JSON import's inferred
// type is a LITERAL snapshot of today's committed content (status narrowed
// to whatever's actually in the file right now), so `doc.status ===
// 'changed'` below would be a TypeScript error the moment the committed
// data only ever says "ok".
const freshness = freshnessData as FreshnessFile

describe('manifest structure', () => {
  it('every rules entry names a document that exists', () => {
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      expect(manifest.documents[entry.file], `rules.${ruleId}.file`).toBeDefined()
    }
  })

  it('every rules entry declares a known status', () => {
    const known = ['verified', 'verified_discrepancy', 'honest_generic', 'dormant']
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      expect(known, `rules.${ruleId}.status`).toContain(entry.status)
    }
  })

  it('every non-null quote appears verbatim in its committed source file', () => {
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      if (!entry.quote) continue
      const text = squash(loadSourceText(entry.file))
      expect(text.includes(squash(entry.quote)), `rules.${ruleId} quote not found in ${entry.file}`).toBe(true)
    }
  })

  it('a honest_generic entry never claims a quote', () => {
    for (const [ruleId, entry] of Object.entries(manifest.rules)) {
      if (entry.status === 'honest_generic') expect(entry.quote, `rules.${ruleId}`).toBeNull()
    }
  })

  it('carries an entry for every check-in pending rule C1 left unmatched', () => {
    for (const id of ['state-5a-p', 'state-5b-p', 'state-dpg-p', 'v-5-p', 's-3-p', 's-4-p']) {
      expect(manifest.rules[id], `rules.${id}`).toBeDefined()
    }
  })

  it('marks the superseded dormant-S-5 entry dormant, not live', () => {
    // s-5-dormant-final-roll was promoted into sirPlaybook as s-final-absent /
    // s-final-unchecked (identical file, locator and quote). Left at
    // "verified" it is a LIVE entry no shipped rule claims, so Task 7's
    // cross-playbook orphan sweep fails.
    expect(manifest.rules['s-5-dormant-final-roll'].status).toBe('dormant')
  })
})

describe('sources/freshness.json (C6)', () => {
  it('every document key is a real manifest.json document — no stale/typo\'d key silently ignored by the client', () => {
    for (const docId of Object.keys(freshness.documents)) {
      expect(manifest.documents[docId], `freshness.documents["${docId}"]`).toBeDefined()
    }
  })

  it('only auto/local-check documents ever appear — a manual/none document should never be machine-checked', () => {
    for (const docId of Object.keys(freshness.documents)) {
      const mode = manifest.documents[docId].check
      expect(['auto', 'local'], `manifest.documents["${docId}"].check`).toContain(mode)
    }
  })

  it('a changed document carries a changedOn date and a live hash — never a bare status with nothing to show', () => {
    for (const [docId, doc] of Object.entries(freshness.documents)) {
      if (doc.status !== 'changed') continue
      expect(doc.changedOn, `freshness.documents["${docId}"].changedOn`).toBeTruthy()
      expect(doc.liveSha256, `freshness.documents["${docId}"].liveSha256`).toBeTruthy()
    }
  })
})

describe('loadSourceText', () => {
  it('refuses a document with no committed text layer instead of reading PDF bytes as text', () => {
    // SIR_revised_Schedule_2026-07-15.pdf is an image-only scan whose
    // extracted_text is explicitly null. `doc.extracted_text ?? file` treats
    // null as PRESENT (only undefined triggers the fallback), so the loader
    // would silently hand back ~320KB of binary decoded as UTF-8 and every
    // quote check against it would fail for entirely the wrong reason.
    expect(() => loadSourceText('SIR_revised_Schedule_2026-07-15.pdf'))
      .toThrow(/no committed, checkable text/i)
  })

  it('throws on a document the manifest does not declare', () => {
    expect(() => loadSourceText('nope.pdf')).toThrow(/unknown manifest document/i)
  })
})

describe('sourced_dates allowlist', () => {
  it('is non-empty and every entry resolves to a document', () => {
    expect(Object.keys(manifest.sourced_dates).length).toBeGreaterThan(0)
    for (const [key, entry] of Object.entries(manifest.sourced_dates)) {
      expect(manifest.documents[entry.file], `sourced_dates["${key}"].file`).toBeDefined()
    }
  })

  it("every entry's source_form appears verbatim in its committed source file", () => {
    for (const [key, entry] of Object.entries(manifest.sourced_dates)) {
      const text = squash(loadSourceText(entry.file))
      expect(text.includes(squash(entry.source_form)), `sourced_dates["${key}"] not found in ${entry.file}`).toBe(true)
    }
  })

  it('is keyed in canonical "d Mon" form', () => {
    for (const key of Object.keys(manifest.sourced_dates)) {
      expect(canonicalDate(key), `sourced_dates key "${key}"`).toBe(key)
    }
  })

  it('covers the six dates the Delhi SIR calendar actually states', () => {
    expect(Object.keys(manifest.sourced_dates).sort())
      .toEqual(['17 Aug', '29 Oct', '30 Jun', '30 Sep', '31 Aug', '4 Nov'])
  })
})

describe('sourced_intervals allowlist', () => {
  it("every entry's source_form appears verbatim in its committed source file", () => {
    for (const [key, entry] of Object.entries(manifest.sourced_intervals)) {
      const text = squash(loadSourceText(entry.file))
      expect(text.includes(squash(entry.source_form)), `sourced_intervals["${key}"] not found in ${entry.file}`).toBe(true)
    }
  })

  it('is keyed in canonical singular form', () => {
    for (const key of Object.keys(manifest.sourced_intervals)) {
      expect(canonicalInterval(key), `sourced_intervals key "${key}"`).toBe(key)
    }
  })

  it("holds the playbook's one sourced numeric interval", () => {
    expect(Object.keys(manifest.sourced_intervals)).toEqual(['15 day'])
  })
})

describe('normalizers', () => {
  it('squash survives the PDF extractor splitting a word ("recei pt")', () => {
    expect(squash('upon receipt of')).toBe(squash('upon recei pt of'))
  })

  it('squash folds curly quotes and dashes to ASCII', () => {
    expect(squash('order’s — note')).toBe(squash("order's - note"))
  })

  it('canonicalDate normalizes long month names and years away', () => {
    expect(canonicalDate('4 November 2026')).toBe('4 Nov')
    expect(canonicalDate('04 Nov')).toBe('4 Nov')
  })

  it('canonicalInterval folds hyphen and plural forms together', () => {
    expect(canonicalInterval('15-day')).toBe('15 day')
    expect(canonicalInterval('15 days')).toBe('15 day')
  })
})
