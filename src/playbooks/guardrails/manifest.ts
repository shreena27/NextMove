// TEST-ONLY. Reads the committed citation manifest and source texts off disk,
// so a guardrail test fails when the COMMITTED bytes change. Never import this
// from application code.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// NOTE: deliberately not `fileURLToPath(new URL('../../../', import.meta.url))`.
// Vite statically rewrites a literal `new URL(<string>, import.meta.url)` call
// into an asset-import URL (its documented `new URL(url, import.meta.url)`
// feature) — under vitest's jsdom environment that resolves to
// `http://localhost:3000/@fs/...`, not a `file:` URL, so fileURLToPath throws
// "The URL must be of scheme file". Deriving the same directory via node:path
// from this module's own file path avoids the rewrite entirely.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..') + '/'

export type ManifestStatus = 'verified' | 'verified_discrepancy' | 'honest_generic' | 'dormant'

export interface ManifestDocument {
  title: string
  url?: string
  captured?: string
  extracted_text?: string | null
  note?: string
  sha256?: string
  check?: string
}

export interface ManifestRule {
  file: string
  locator: string
  quote: string | null
  status: ManifestStatus
  note?: string
}

export interface AllowedValue {
  file: string
  locator: string
  source_form: string
  year?: number
  meaning: string
  allowed_in: string[]
}

export interface Manifest {
  documents: Record<string, ManifestDocument>
  rules: Record<string, ManifestRule>
  sourced_dates: Record<string, AllowedValue>
  sourced_intervals: Record<string, AllowedValue>
}

export function loadManifest(): Manifest {
  return JSON.parse(readFileSync(`${repoRoot}sources/manifest.json`, 'utf8')) as Manifest
}

/** The committed, checkable text for a manifest document: the `.extracted.txt`
 *  companion for PDFs, the file itself for the `web/` captures. */
export function loadSourceText(file: string): string {
  const doc = loadManifest().documents[file]
  if (!doc) throw new Error(`unknown manifest document: ${file}`)
  // An EXPLICIT null means "image-only scan, no text layer" (the superseded
  // SIR_revised_Schedule PDF). `?? file` would treat null as present and read
  // ~320KB of PDF bytes as UTF-8, which does not throw — it silently returns
  // mojibake and every quote check against it fails for the wrong reason.
  if (doc.extracted_text === null) {
    throw new Error(
      `manifest document "${file}" declares "extracted_text": null — it has no committed, checkable text layer (image-only scan). Nothing may cite it. Give it an .extracted.txt companion or stop citing it.`,
    )
  }
  const path = doc.extracted_text ?? file
  return readFileSync(`${repoRoot}sources/${path}`, 'utf8')
}

/** Collapse a string to a whitespace-free, ASCII-punctuation, lowercase form.
 *  Whitespace is REMOVED, not collapsed, on purpose: the PDF extractor splits
 *  words mid-token ("recei pt", "Magistrate/ District"), which is an extraction
 *  artifact, not a citation error. Squashing both sides makes a verbatim quote
 *  check survive it without loosening what "verbatim" means. */
export function squash(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "04 November 2026" / "4 Nov" -> "4 Nov". Year is dropped from the key and
 *  checked separately against the allowlist entry's `year`. */
export function canonicalDate(raw: string): string {
  const m = /^\s*0*(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?(?:\s+\d{4})?\s*$/.exec(raw)
  if (!m) return raw
  const month = MONTHS.find(x => x.toLowerCase() === m[2].toLowerCase())
  return month ? `${Number(m[1])} ${month}` : raw
}

/** "15-day" / "15 days" -> "15 day". */
export function canonicalInterval(raw: string): string {
  const m = /^\s*(\d+)[-\s]*([A-Za-z]+?)s?\s*$/.exec(raw)
  return m ? `${Number(m[1])} ${m[2].toLowerCase()}` : raw
}
