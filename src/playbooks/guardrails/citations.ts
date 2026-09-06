// TEST-ONLY. The manifest-resolution guardrail
// (NextMove_Implementation_Plan_FINAL.md §7 — first of the mechanical tests).
import type { Playbook } from '../../domain/types'
import { loadManifest } from './manifest'
import { SAFETY_NET_TITLE } from '../safetyNet'

// Re-exported so test code imports the constant from one place.
export { SAFETY_NET_TITLE }

/** Every way this playbook's citations fail to resolve. Empty = clean.
 *  Returns findings instead of throwing so one run reports all of them. */
export function citationFindings(playbook: Playbook): string[] {
  const manifest = loadManifest()
  const findings: string[] = []

  for (const rule of playbook.rules) {
    const at = `${playbook.serviceId}:${rule.id}`
    if (rule.source.docId === null) {
      findings.push(`${at}: docId null is reserved for the UNCLASSIFIED fallback — only the fallback may be uncited.`)
      continue
    }
    if (!manifest.documents[rule.source.docId]) {
      findings.push(`${at}: cites unknown document "${rule.source.docId}".`)
    }
    const entry = manifest.rules[rule.id]
    if (!entry) {
      findings.push(`${at}: no sources/manifest.json entry for this rule id.`)
      continue
    }
    if (entry.status === 'dormant') {
      findings.push(`${at}: its manifest entry is dormant — a retired citation cannot back a reachable rule.`)
    }
    if (entry.file !== rule.source.docId) {
      findings.push(`${at}: docId "${rule.source.docId}" disagrees with its manifest entry's file "${entry.file}".`)
    }
  }

  const fb = playbook.fallback.source
  if (fb.docId !== null) {
    findings.push(
      `${playbook.serviceId}:fallback: docId must be null (the ERD's null source_id for the safety net), got "${fb.docId}".`,
    )
  }
  if (fb.title !== SAFETY_NET_TITLE) {
    findings.push(`${playbook.serviceId}:fallback: must carry the safety-net title verbatim, got "${fb.title}".`)
  }
  return findings
}

/** The reverse direction: a live manifest entry no shipped rule claims.
 *  Dormant entries are exempt — that status exists precisely to record
 *  content retired from the reachable set. */
export function orphanFindings(playbooks: Playbook[]): string[] {
  const manifest = loadManifest()
  const shipped = new Set(playbooks.flatMap(p => p.rules.map(r => r.id)))
  return Object.entries(manifest.rules)
    .filter(([id, entry]) => entry.status !== 'dormant' && !shipped.has(id))
    .map(([id]) => `sources/manifest.json rules."${id}": live entry with no shipped rule (orphan).`)
}
