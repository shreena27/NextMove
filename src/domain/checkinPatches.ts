// Check-in PATCH PAYLOADS only — the rule-keyed data half of the prototype's
// CHECKIN table (design/nextmove-v1-prototype.html lines 2508-2596, tag
// v1-design-lock-2). TRANSCRIBED, not authored.
//
// Every option's `label`, its `k` kind ('event' | 'action' | 'resolved-rung' |
// 'valence' | 'closureq' | 'deadend'), the `prepAware` flag, and the
// universal options the loop appends ("Nothing yet", the deliverable,
// "Something else happened") are now supplied by `domain/checkinOptions.ts`
// (built in this chunk, Task 3) — NOT still pending, as an earlier version of
// this comment said. This file remains the rule-keyed PATCH PAYLOAD half only
// (fix wave, 2026-09-06 whole-branch final review, Important finding 3: this
// comment was named explicitly in an earlier task's housekeeping checklist
// but was never actually updated). What ships here is what C1's applyEvent()
// can already apply and diagnose() can already be asserted against.
//
// Keys are the prototype's own keys, and they are a MIX on purpose: passport
// and voter entries are keyed by rule id, SIR entries by user-facing `state`
// id ('S-1', 'S-3', ...). The prototype resolves
// `CHECKIN[d.state] ?? CHECKIN[d.id]` (line 2599); C5 must keep that order.
//
// Option ORDER within each array is the prototype's order and is preserved.
export interface CheckinPatchOption {
  /** Applied immediately when the option is chosen. `null` deletes a key. */
  patch?: Record<string, string | null>
  /** Applied when the rung resolved but the deliverable has not arrived —
   *  "retire, don't reset": the rung is CONSUMED, never erased. */
  pendingPatch?: Record<string, string | null>
  /** A 'valence' option's branch when the decision went against the citizen. */
  rejectPatch?: Record<string, string | null>
  /** A 'valence' option's branch when it went their way but nothing arrived. */
  acceptPendingPatch?: Record<string, string | null>
  /** A 'valence' option whose reject branch is the top of the verified ladder:
   *  there is no further patch, only C5's dead-end closure. */
  rejectDeadend?: true
}

export const CHECKIN_PATCHES: Record<string, CheckinPatchOption[]> = {
  'state-1': [
    { patch: { q1: 'contacted_incomplete' } },
    { patch: { q1: 'verified_no_progress' } },
    { patch: { q1: 'adverse' } },
  ],
  'state-2': [
    { patch: { q1: 'verified_no_progress' } },
    { patch: { q1: 'adverse' } },
    { patch: { q2: 'informal', fOutcome: 'pending' } },
  ],
  'state-3': [
    { patch: { q2: 'informal', fOutcome: 'pending' } },
    { patch: { q1: 'adverse' } },
  ],
  'state-4': [
    { patch: { q2: 'informal', fOutcome: 'pending' } },
  ],
  'state-5a-p': [
    { pendingPatch: { fOutcome: 'resolved' } },
    { patch: { fOutcome: 'unhelpful' } },
    { patch: { fOutcome: 'no_response' } },
  ],
  'state-5a-r': [
    { patch: { fOutcome: null } },
  ],
  'state-5b-r': [
    { patch: { gOutcome: null } },
  ],
  'state-dpg-r': [
    {},
  ],
  'state-5a': [
    { patch: { q2: 'formal_grievance', gOutcome: 'pending' } },
  ],
  'state-5b-p': [
    { pendingPatch: { gOutcome: 'resolved' } },
    { patch: { gOutcome: 'unhelpful' } },
    { patch: { gOutcome: 'no_response' } },
  ],
  'state-5b': [
    { patch: { dpgFiled: 'yes' } },
  ],
  'state-dpg-p': [
    { pendingPatch: { dpgOutcome: 'resolved' } },
    {},
  ],
  'v-1': [
    { patch: { voterQ1: 'blo_visited' } },
    {
      rejectPatch: { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' },
      acceptPendingPatch: { voterQ1: 'decision', voterOutcome: 'accepted_pending' },
    },
  ],
  'v-2': [
    {
      rejectPatch: { voterQ1: 'decision', voterAppealedRaw: 'none', voterAppealed: 'none' },
      acceptPendingPatch: { voterQ1: 'decision', voterOutcome: 'accepted_pending' },
    },
  ],
  'v-3': [
    { patch: { voterAppealedRaw: 'pending', voterAppealed: 'pending' } },
    { pendingPatch: { voterOutcome: 'accepted_pending' } },
  ],
  'v-4': [
    {
      rejectPatch: { voterAppealedRaw: 'decided', voterAppealed: 'decided' },
      acceptPendingPatch: { voterOutcome: 'accepted_pending' },
    },
  ],
  'v-5': [
    { patch: { ceoAppeal: 'filed' } },
  ],
  'v-5-p': [
    { rejectDeadend: true, acceptPendingPatch: { voterOutcome: 'accepted_pending' } },
  ],
  'v-acc': [
    { patch: { voterOutcome: null } },
  ],
  'S-1': [
    { patch: { sirQ1: 'notice' } },
  ],
  'S-2': [
    { patch: { sirQ1: 'roll_present' } },
    { patch: { sirQ1: 'roll_absent' } },
  ],
  'S-3': [
    { patch: { form6Filed: 'yes' } },
  ],
  'S-4': [
    { patch: { sirDocsFiled: 'yes' } },
  ],
  // 'S-6' is absent: its check-in moved to sirDormantRules_enumeration when
  // the enumeration phase closed (17.08.2026), and that content is not ported.
  'S-9': [
    { patch: { sirQ1: 'final_present' } },
    { patch: { sirQ1: 'final_absent' } },
  ],
}
