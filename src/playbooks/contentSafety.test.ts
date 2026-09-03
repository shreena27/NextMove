import { describe, it, expect } from 'vitest'
import { passportPlaybook } from './passportPlaybook'

// Static scan across every rule's user-facing copy for the invented-fact
// patterns the PRD/Implementation Plan explicitly forbid (§8 Guardrails).
// This is a build-breaking safety net, not a style check.

const BANNED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b\d+\s*(day|days|week|weeks|month|months)\b/i, reason: 'invented day/week/month threshold' },
  { pattern: /\bdeadline\b/i, reason: 'invented deadline' },
  { pattern: /\bguarantee(d|s)?\b/i, reason: 'promised/guaranteed resolution' },
  { pattern: /\bwe (have )?submitted\b/i, reason: 'claims NextMove submitted something on the user\'s behalf' },
  { pattern: /\bwe filed\b/i, reason: 'claims NextMove filed something on the user\'s behalf' },
  { pattern: /\b(government of india|official government (app|service|portal)|we are (the|an?) (official|government))\b/i, reason: 'claims government affiliation' },
  {
    pattern: /\b(because|due to|caused by|the reason is|since your|as your)\b/i,
    reason: 'uses causal language that risks stating/implying a cause for the adverse finding',
  },
]

function allCopyStrings(): { source: string; text: string }[] {
  const strings: { source: string; text: string }[] = []
  for (const rule of passportPlaybook.rules) {
    strings.push({ source: `${rule.id}.explanation`, text: rule.explanation })
    strings.push({ source: `${rule.id}.whatToDo`, text: rule.whatToDo })
    strings.push({ source: `${rule.id}.whatYoullNeed`, text: rule.whatYoullNeed })
  }
  strings.push({ source: 'fallback.explanation', text: passportPlaybook.fallback.explanation })
  strings.push({ source: 'fallback.whatToDo', text: passportPlaybook.fallback.whatToDo ?? '' })
  return strings
}

describe('content safety — Passport playbook copy', () => {
  it.each(allCopyStrings())('$source contains no banned pattern', ({ text }) => {
    for (const { pattern, reason } of BANNED_PATTERNS) {
      expect(text, `matched banned pattern (${reason}): "${text}"`).not.toMatch(pattern)
    }
  })
})
