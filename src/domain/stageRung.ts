import type { Diagnosis } from './types'

/** Stage·rung composite labels (passport ladder): when the matched rule
 *  carries a rungLabel AND the stage map labels the citizen's stage answer,
 *  compose "{stage} · {rung}". Otherwise return the diagnosis unchanged
 *  (same object — callers may rely on identity for "no decoration"). */
export function decorateStageRung(
  d: Diagnosis,
  stageShort: Record<string, string>,
  stageKey: string,
): Diagnosis {
  const stageValue = d.matchedAnswers[stageKey]
  const stage =
    stageValue !== undefined && Object.hasOwn(stageShort, stageValue)
      ? stageShort[stageValue]
      : undefined
  if (d.rungLabel && stage) {
    return { ...d, label: `${stage} · ${d.rungLabel}` }
  }
  return d
}
