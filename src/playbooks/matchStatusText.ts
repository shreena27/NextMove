// Conservative keyword heuristic for the Recovery flow's "paste your status"
// option. Returns a Q1 stage value only on a confident match; undefined
// otherwise so the caller falls through to UNCLASSIFIED rather than guessing.
export function matchStatusText(text: string): string | undefined {
  const t = text.toLowerCase().trim()
  if (!t) return undefined

  if (/adverse|negative|reject/.test(t)) return 'adverse'
  if (/not\s+(yet\s+)?(initiated|started|begun)|no\s+contact/.test(t)) return 'no_contact'
  if (/in\s+progress|initiated|ongoing/.test(t)) return 'contacted_incomplete'
  if (/report\s+submitted|verification\s+(complete|completed|done)/.test(t))
    return 'verified_no_progress'

  return undefined
}
