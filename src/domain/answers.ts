import type { AnswerRecord } from './types'

/** Per-service map: answer key -> keys invalidated when that answer CHANGES.
 *  Real maps ship with the playbooks (C2); the engine only walks the map. */
export type DependentKeys = Record<string, string[]>

/** Correction path: the citizen changed their mind about a question.
 *  Same value = strict no-op on ANSWERS (same object back; no dependents
 *  cleared). Changed value = set it and clear dependent keys, transitively,
 *  cycle-safe, never the key just written.
 *  `changed` means "the stored value differed (and any declared dependents
 *  were cleared)" — not "dependents were invalidated": with no deps map, or
 *  a key with no declared dependents, `changed` is still true even though
 *  nothing was cleared. The session layer (C5) resets prepare/derived state
 *  on EVERY correction-path write regardless, and must not gate that reset
 *  on this flag. */
export function applyCorrection(
  answers: AnswerRecord,
  key: string,
  value: string,
  deps: DependentKeys = {},
): { answers: AnswerRecord; changed: boolean } {
  if (answers[key] === value) return { answers, changed: false }
  const next: AnswerRecord = { ...answers, [key]: value }
  // Seeded with the write key: a cyclic deps map must never delete the
  // answer this correction just wrote.
  const visited = new Set<string>([key])
  const queue = [...(deps[key] ?? [])]
  while (queue.length > 0) {
    const k = queue.shift()!
    if (visited.has(k)) continue
    visited.add(k)
    delete next[k]
    queue.push(...(deps[k] ?? []))
  }
  return { answers: next, changed: true }
}

/** Event path (a check-in reported the world moved): pure merge. null deletes
 *  a key (an outcome consumed); keys outside the patch are never touched. */
export function applyEvent(
  answers: AnswerRecord,
  patch: Record<string, string | null>,
): AnswerRecord {
  const next: AnswerRecord = { ...answers }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else next[k] = v
  }
  return next
}
