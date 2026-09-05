// SIR playbook — 9 rules + the UNCLASSIFIED fallback, plus Delhi's verified
// phase configuration.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html lines 1306-1516
// (git tag v1-design-lock-2).
//
// STATE -> VERIFIED CURRENT PHASE -> USER SITUATION -> APPLICABLE RULE -> DIAGNOSIS
//
// The active rules reflect only what is actionable in a state's current phase.
// Final-phase rules are unreachable under the claims/notice phase because no
// Q1 option produces their answer values — structural gating, not a runtime
// check. Flipping delhi.phase is the whole change needed to advance.
import type { Playbook } from '../domain/types'
import type { SirPhase, SirStateConfig } from '../domain/sirConfig'
import { SAFETY_NET_TITLE } from './safetyNet'

/** Structurally identical to the guardrail harness's CopyString, declared
 *  locally on purpose: shipped playbook data must never import the harness
 *  (which reaches node:fs). TypeScript's structural typing makes the arrays
 *  interchangeable without the dependency. */
export interface CopyLocation {
  at: string
  text: string
}

const SIR_FAQ = 'FAQ_SIR2026.pdf'
const VOTERS_PORTAL = 'https://voters.eci.gov.in'
const FINAL_ROLL_MILESTONE = { label: 'Final Roll publication — 4 Nov 2026 (Delhi)' }

export const sirPlaybook: Playbook = {
  serviceId: 'sir',
  rules: [
    // Check-in pending states.
    {
      id: 's-4-p',
      condition: a => a.sirDocsFiled === 'yes',
      rec: 'WAIT',
      state: 'S-4·W',
      label: 'Documents submitted, with the ERO',
      dependency: 'ERO decision',
      explanation: "You've submitted your document as the notice asked. The decision on your record now rests with the ERO, and nothing further is needed from you.",
      whatShort: 'Documents in. Nothing to do now.',
      whatToDo: 'Nothing right now. Add an update when you hear back, or when the Final Roll publishes.',
      where: { label: 'ERO (per your notice)' },
      need: 'Nothing. Keep your submission acknowledgment safe.',
      howLong: 'The next fixed milestone is Final Roll publication — 4 Nov 2026 in Delhi.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: "Any prediction of the ERO's decision.",
    },
    {
      id: 's-3-p',
      condition: a => a.form6Filed === 'yes',
      rec: 'WAIT',
      state: 'S-3·W',
      label: 'Form 6 filed, decision ahead of the Final Roll',
      dependency: 'ERO / Final Roll publication',
      explanation: 'Your Form 6 claim is in during the Claims & Objections window. The decision lands ahead of the Final Roll, and nothing further is needed from you.',
      whatShort: 'Claim filed. Nothing to do now.',
      whatToDo: 'Nothing right now. Add an update when you hear back, or when the Final Roll publishes.',
      where: FINAL_ROLL_MILESTONE,
      need: 'Nothing. Keep your Form 6 acknowledgment safe: it is your proof of filing.',
      howLong: 'The next fixed milestone is Final Roll publication — 4 Nov 2026 in Delhi.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: 'Any claim that filing guarantees inclusion.',
    },
    {
      id: 's-notice',
      condition: a => a.sirQ1 === 'notice',
      rec: 'FOLLOW_UP',
      state: 'S-4',
      label: 'Notice requesting documents',
      dependency: 'You, then ERO',
      explanation: "You've received an official notice asking for documents. NextMove can't tell you why the notice was issued specifically, only that it means your last-SIR record couldn't be confirmed from the form alone.",
      whatShort: 'Submit the requested documents',
      whatToDo: 'Submit one of the ECI-prescribed documents as your notice directs.',
      where: { label: "Submit to your BLO / ERO per the notice's instructions" },
      // The prototype ships this list as raw <ul> markup inside `need`. C2
      // splits it: plain-text lead-in here, items in needList, so no renderer
      // ever has to inject markup from a data field (C1 types.ts note).
      need: 'Any ONE of these:',
      needList: [
        'A government/PSU ID or pension order',
        'A pre-1987 government/bank/LIC/PSU-issued ID',
        'Birth certificate',
        'Passport',
        'Matriculation/educational certificate',
        'Permanent residence certificate',
        'Forest right certificate',
        'Caste certificate',
        'NRC (where it exists)',
        'Family register',
        'Land/house allotment certificate',
        'Aadhaar (per the specific 2025 ECI direction)',
      ],
      howLong: "Your notice's own instructions control the deadline; no separate elector-facing deadline is published. Delhi's notice/disposal phase itself runs through 29 Oct 2026.",
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q23, Q11' },
      mustNot: 'Why the notice was issued, or which specific document will be accepted for your case.',
    },
    {
      id: 's-roll-absent',
      condition: a => a.sirQ1 === 'roll_absent',
      rec: 'FOLLOW_UP',
      state: 'S-3',
      label: 'Not on the Draft Roll',
      dependency: 'You: active follow-up needed',
      explanation: "You've checked the Draft Roll and your name isn't there. That can happen for a few different reasons. Maybe the Enumeration Form wasn't deposited in time, or you'd moved and it couldn't reach you. NextMove can't tell which applies to you. But the fix is the same either way, and it's live right now: Delhi is currently in the Claims & Objections window.",
      whatShort: 'File Form 6 during Claims & Objections',
      whatToDo: 'File Form 6 with a Declaration Form and supporting documents during the Claims & Objections window.',
      where: { label: 'Form 6 — Claims & Objections window (online or at the Voter Centre)', url: VOTERS_PORTAL },
      need: 'One of the ECI-accepted document types (see your next-move details) and the Declaration Form.',
      howLong: 'The claims filing window is live now and closes 30 Sep 2026 in Delhi. File by then.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q20, Q21, Q28, Q30' },
      mustNot: 'The specific reason your name is missing.',
    },
    {
      id: 's-roll-unchecked',
      condition: a => a.sirQ1 === 'roll_unchecked',
      rec: 'FOLLOW_UP',
      state: 'S-2',
      label: "Haven't checked the Draft Roll yet",
      dependency: 'You: one check needed',
      explanation: "The Draft Roll for Delhi has already been published, so the fastest way to know where you stand is to check it directly. Waiting won't surface new information on its own the way it would have during enumeration.",
      whatShort: 'Check the Draft Roll now',
      whatToDo: "Check the Draft Electoral Roll now via the Voters' Service Portal, ECINET app, or the Delhi CEO website. What you find determines the next step: if you're listed, there's nothing further to do; if not, file Form 6 during the current Claims & Objections window.",
      where: { label: 'Draft Roll — voters.eci.gov.in, ECINET app, or the Delhi CEO website', url: VOTERS_PORTAL },
      need: 'Nothing. Just your name and constituency to search.',
      howLong: "Delhi's claims filing window closes 30 Sep 2026, so checking now leaves time to file if you're not listed.",
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q15, Q25, Q26, Q27' },
      mustNot: "A guess at whether you'll be listed — NextMove doesn't know until you check.",
    },
    // Final-phase rules: reachable only once a state's phase is final_roll,
    // because only that phase's Q1 offers these answer values.
    {
      id: 's-final-absent',
      condition: a => a.sirQ1 === 'final_absent',
      rec: 'ESCALATE',
      state: 'S-5',
      label: 'Name still missing after the Final Roll',
      dependency: 'Appellate authority',
      explanation: "You did everything asked and your name still isn't on the Final Roll. There's a real, time-bound official appeal for exactly this, and it needs to move quickly.",
      whatShort: 'File an appeal within 15 days',
      whatToDo: "File an appeal before the District Election Officer / District Magistrate of your district, within 15 days of the Final Roll's publication.",
      where: { label: 'District Election Officer / District Magistrate' },
      need: 'Proof of your earlier submission (Enumeration Form acknowledgment or Form 6 filing) and any documents you already submitted.',
      howLong: 'The appeal window is 15 days from Final Roll publication (CEO Delhi FAQ Q32), one of the few sourced numeric deadlines in this playbook.',
      source: {
        docId: SIR_FAQ,
        title: 'CEO Delhi — Official SIR 2026 FAQ, Q32',
        quote: '15-day appeal window — one of the few sourced numeric deadlines in this playbook.',
      },
      mustNot: "Anything about the appeal's likely outcome.",
    },
    {
      id: 's-final-present',
      condition: a => a.sirQ1 === 'final_present',
      rec: 'WAIT',
      state: 'S-8',
      label: 'On the Final Roll. Complete.',
      dependency: 'Nothing. This is the outcome.',
      explanation: "Your name is on the Final Roll. That's the outcome this whole process was about; nothing further is pending.",
      whatShort: 'Nothing to do. This is done.',
      whatToDo: "Nothing. If you're tracking this case, record the good news and close it.",
      where: { label: "Final Roll — your state CEO's website", url: VOTERS_PORTAL },
      need: 'Nothing.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: 'Nothing further to flag.',
    },
    {
      id: 's-final-unchecked',
      condition: a => a.sirQ1 === 'final_unchecked',
      rec: 'FOLLOW_UP',
      state: 'S-9',
      label: "Haven't checked the Final Roll yet",
      dependency: 'You — one check needed',
      explanation: 'The Final Roll is published, and the 15-day appeal window (if you need it) runs from publication, so checking promptly matters.',
      whatShort: 'Check the Final Roll now',
      whatToDo: "Check the Final Electoral Roll now via the Voters' Service Portal or your state CEO's website. If you're listed, you're done; if not, the 15-day appeal is the next step.",
      where: { label: 'Final Roll — voters.eci.gov.in or the state CEO website', url: VOTERS_PORTAL },
      need: 'Nothing. Just your name and constituency to search.',
      howLong: 'The appeal window, if needed, is 15 days from Final Roll publication (CEO Delhi FAQ Q32), so checking early preserves your options.',
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ, Q32' },
      mustNot: "A guess at whether you'll be listed.",
    },
    {
      id: 's-roll-present',
      condition: a => a.sirQ1 === 'roll_present',
      rec: 'WAIT',
      state: 'S-1',
      label: 'On the Draft Roll, nothing pending',
      dependency: 'Final Roll publication',
      explanation: "You've checked the Draft Roll and your name is there. Nothing further is required from you unless a notice arrives. The next official milestone is the Final Roll itself.",
      whatShort: 'Nothing to do right now',
      whatToDo: 'Nothing is required from you right now. If a notice requesting documents arrives before the Final Roll is published, that changes things. Otherwise, just wait.',
      where: FINAL_ROLL_MILESTONE,
      need: 'Nothing. This is a waiting step.',
      howLong: "The next official milestone has a real date: Final Roll publication on 4 Nov 2026, per Delhi's verified SIR calendar.",
      source: { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR 2026 FAQ; Delhi SIR calendar' },
      mustNot: 'Any claim that inclusion on the Draft Roll guarantees Final Roll inclusion.',
    },
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'S-7',
    label: 'SIR status unclear',
    dependency: 'Unknown',
    explanation: "NextMove doesn't have enough evidence from your answers to safely place your case, even within Delhi's verified current phase. Rather than guess, it's safest to check directly.",
    whatShort: 'Check your status directly',
    whatToDo: 'Check directly rather than guess.',
    where: { label: 'voters.eci.gov.in', url: VOTERS_PORTAL, phone: '1950' },
    need: 'Nothing. Just check directly.',
    source: { docId: null, title: SAFETY_NET_TITLE },
    mustNot: 'Any WAIT / FOLLOW UP / ESCALATE claim, or an assumed SIR phase for your state.',
  },
}

/** Phases live apart from states so advancing a state's phase is a one-line
 *  config change touching no engine code. */
export const SIR_PHASES: Record<string, SirPhase> = {
  claims_notice: {
    id: 'claims_notice',
    label: 'Claims & Objections / Notice window',
    note: "Delhi's enumeration ran 30 Jun–17 Aug 2026 and the Draft Roll published on 31 Aug. Claims and objections can be filed through 30 Sep 2026; the notice/disposal phase runs through 29 Oct, ahead of the Final Roll on 4 Nov 2026.",
  },
  final_roll: {
    id: 'final_roll',
    label: 'Final Roll published',
    note: "Delhi's Final Roll published on 4 Nov 2026. If your name is on it, the process is complete. If it isn't, a 15-day appeal window applies from publication (CEO Delhi FAQ Q32).",
  },
}

/** V1 SIR coverage is locked to Delhi. A state with `supported: false` never
 *  reaches this playbook — it routes to the coverage screen. Adding a verified
 *  state later is one config entry with its own phase; no UX changes.
 *  Each record carries its own map key as `id` (C1 handoff item). */
export const SIR_STATES: Record<string, SirStateConfig> = {
  delhi: { id: 'delhi', name: 'Delhi', supported: true, phase: SIR_PHASES.claims_notice },
  bihar: { id: 'bihar', name: 'Bihar', supported: false },
  maharashtra: { id: 'maharashtra', name: 'Maharashtra', supported: false },
  up: { id: 'up', name: 'Uttar Pradesh', supported: false },
  other: { id: 'other', name: 'Another state / not sure', supported: false },
}

/** SIR Q1's option set is phase-gated, not fixed. Only situations actually
 *  live in a state's current phase are offered, so a citizen is never asked to
 *  distinguish something the phase makes impossible. "I'm not sure" is
 *  appended by the question screen OUTSIDE this set (C3) and is deliberately
 *  not phase-gated.
 *
 *  'duplicate' is absent on purpose: its only verified remedy (file the
 *  Enumeration Form where you now live, FAQ Q22) belongs to a phase that
 *  closed on 17.08.2026. The source is verbatim; the calendar retired the
 *  action. Duplicate-suspicion falls through to "I'm not sure" ->
 *  UNCLASSIFIED, which is the honest answer. */
export const SIR_Q1_OPTIONS_FOR: Record<string, Record<string, string>> = {
  claims_notice: {
    roll_present: 'I checked the Draft Roll and my name is there',
    roll_absent: "I checked the Draft Roll and my name isn't there",
    roll_unchecked: "I haven't checked the Draft Roll yet",
    notice: 'I got a notice asking for documents',
  },
  final_roll: {
    final_present: 'I checked the Final Roll and my name is there',
    final_absent: "I checked the Final Roll and my name isn't there",
    final_unchecked: "I haven't checked the Final Roll yet",
  },
}

/** SIR's citizen-facing copy that does not live on a rule: the phase notes
 *  (rendered on the Diagnosis screen) and the Q1 option labels. Fed to the
 *  content-safety scan so SIR's dates are allow-listed there too.
 *  Locations carry the same mandatory 'sir:' service prefix every other
 *  CopyString does, so they match the manifest allowlists' allowed_in
 *  entries and can never collide with another playbook's copy. */
export function sirCopyExtras(): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const phase of Object.values(SIR_PHASES)) {
    out.push({ at: `sir:SIR_PHASES.${phase.id}.label`, text: phase.label })
    out.push({ at: `sir:SIR_PHASES.${phase.id}.note`, text: phase.note })
  }
  for (const [phaseId, options] of Object.entries(SIR_Q1_OPTIONS_FOR)) {
    for (const [value, label] of Object.entries(options)) {
      out.push({ at: `sir:SIR_Q1_OPTIONS_FOR.${phaseId}.${value}`, text: label })
    }
  }
  return out
}
