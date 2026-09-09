import { VOTER_COPY } from './screenCopy'

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

// Transcribed verbatim from design/nextmove-v1-prototype.html, lines 3408-
// 3412. Same convention as PASSPORT_Q1_LABELS: no 'notsure' entry here — the
// question screen appends it separately (raw pick 'notsure' normalizes to
// 'unclassified' for voterQ1, so the diagnosis-label spread adds an
// 'unclassified' key at the point of use, not a 'notsure' one).
export const VOTER_Q1_LABELS: Record<string, string> = {
  no_word: "I haven't heard anything yet",
  blo_visited: "A BLO visited or contacted me, but I still don't have a result",
  decision: "I got a decision but don't understand it, or it wasn't what I expected",
}

// Transcribed verbatim from design/nextmove-v1-prototype.html, lines 3446-
// 3451. Deliberately DIFFERENT convention from VOTER_Q1_LABELS/
// PASSPORT_Q1_LABELS: 'notsure' is baked in here, not appended at the point
// of use. This map is keyed by voterAppealedRaw (the RAW pick, literal
// 'notsure'), never by the normalized voterAppealed value, so its own
// 'notsure' entry is already the right key — no append step is needed or
// correct here. See voterPlaybook.ts's VOTER_DEPS note and the raw/
// normalized answer split (C3's own addition).
export const VOTER_APPEAL_LABELS: Record<string, string> = {
  none: 'No, not yet',
  pending: "Yes, and I'm still waiting to hear back",
  decided: 'Yes, and I received a decision on that appeal too',
  notsure: "I'm not sure",
}

/** D15 (C8): the voterEntry describe chain's backing map — needed so the
 *  enum gate has something to check a describe-derived voterEntry mapping
 *  against. Built from REFERENCES to the already-registered VOTER_COPY.entry
 *  strings, not new literals, so screenCopy.ts stays the single
 *  copy-definition site.
 *
 *  Keyed by the option VALUE ('notsure'), not the copy object's key
 *  (notSure): VOTER_COPY.entry has no map shaped like this one to begin
 *  with — its own key is 'notSure' (camelCase, matching the object-property
 *  convention every other VOTER_COPY.entry field uses), while the answer
 *  value every screen and chain actually reads and writes is the lowercase
 *  'notsure'. That mismatch is exactly why VOTER_COPY.entry itself could
 *  never have served as this map.
 *
 *  Data only: VoterScreens.tsx is NOT rewired to read from this map — its
 *  three AnswerRow labels stay literal reads of VOTER_COPY.entry.applied /
 *  .sir / .notSure, exactly as shipped. Rewiring a live component to save
 *  itself from a data table would be a restructure of already-shipped UI,
 *  not this task's job. `interpretChains.test.ts`'s render-parity pin is
 *  what keeps the two honest against each other instead. */
export const VOTER_ENTRY_LABELS: Record<string, string> = {
  applied: VOTER_COPY.entry.applied,
  sir: VOTER_COPY.entry.sir,
  notsure: VOTER_COPY.entry.notSure,
}
