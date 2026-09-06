/** Every answerLabels map handed to TrustDisclosure MUST be built here, so
 *  its keys are the composite "questionId:value" form matchedAnswers is
 *  looked up by. (Fixed 2026-09-04: the per-service label objects were
 *  keyed by value alone, so "You told us" silently showed nothing for
 *  every real Passport/Voter/SIR answer.)
 *
 *  This is the ONLY producer of label maps — a flat-keyed map must never
 *  reach the trust renderer again (Task 6's TrustDisclosure depends on
 *  this). Ports design/nextmove-v1-prototype.html line 2357. */
export function labelMap(questionId: string, labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).map(([v, l]) => [`${questionId}:${v}`, l]))
}

// Transcribed verbatim from the locked prototype (design/nextmove-v1-
// prototype.html, lines 3229-3235). C2 deliberately shipped no Passport
// label maps — only SIR's, where phase-gating made them structural.
export const PASSPORT_Q1_LABELS: Record<string, string> = {
  no_contact: "I haven't heard anything about police verification yet",
  contacted_incomplete: "Someone from the police contacted me, but it isn't finished",
  verified_no_progress: "I think verification is done, but nothing's changed since",
  adverse: 'I saw something on the portal that looks negative or confusing',
}

export const PASSPORT_Q2_LABELS: Record<string, string> = {
  no_followup: 'No, not yet',
  informal: 'Yes, informally',
  formal_grievance: 'Yes, I filed a formal grievance',
}
