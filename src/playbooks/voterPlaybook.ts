// Voter Services playbook — 7 rules + the UNCLASSIFIED fallback.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html lines 1179-1271
// (git tag v1-design-lock-2).
//
// The appeal structure is genuinely two-tier (Final-ER-FAQ Q34): a first
// appeal to the District Election Officer / District Magistrate, then, only
// once that has been decided, a further appeal to the state CEO. v-4 and v-5
// are those two real situations; an earlier single "have you appealed?" branch
// told an already-appealed citizen to appeal again.
import type { DependentKeys } from '../domain/answers'
import type { Playbook } from '../domain/types'
import { SAFETY_NET_TITLE } from './safetyNet'

const ECI_FAQ = 'Final-ER-FAQ.pdf'
const CEO_LOOKUP = { label: 'State CEO website (roll / decision lookup)', url: 'https://voters.eci.gov.in' }
const CEO = { label: 'State Chief Electoral Officer (CEO)', url: 'https://voters.eci.gov.in' }
const TRACK = { label: "Track status of application (Voters' Service Portal)", url: 'https://voters.eci.gov.in' }

export const voterPlaybook: Playbook = {
  serviceId: 'voter',
  rules: [
    // Favourable-decision-pending: reporting "the decision went my way, but
    // nothing has arrived" used to change NOTHING — the case kept reading
    // "awaiting decision" against the citizen's own report.
    {
      id: 'v-acc',
      condition: a => a.voterOutcome === 'accepted_pending',
      rec: 'WAIT',
      state: 'V·A',
      label: 'Decision in your favour, delivery pending',
      dependency: 'Roll update / card delivery',
      explanation: "You've reported the decision went in your favour and the result hasn't shown up yet. Decisions are communicated by post and SMS, and updated rolls are published on your state CEO's website, so both are worth watching. No official delivery interval is published.",
      whatShort: 'Nothing to do; watch for it to arrive',
      whatToDo: "Nothing is required from you. Check the roll listing on your state CEO's website now and then, and watch the post and SMS.",
      where: CEO_LOOKUP,
      need: 'Your application reference number, for the roll lookup.',
      howLong: 'No official interval for roll updates or card delivery is published, so there is no countdown to show.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q25' },
      mustNot: 'Any delivery timeframe, or a promise the entry has actually been made.',
    },
    // Check-in pending state. ceoAppeal is only written by the citizen
    // attesting they filed the second appeal.
    {
      id: 'v-5-p',
      condition: a => a.ceoAppeal === 'filed',
      rec: 'WAIT',
      state: 'V-5·W',
      label: 'Second appeal filed with the state CEO',
      dependency: 'State Chief Electoral Officer',
      explanation: "Your second appeal is with the state CEO, the final tier in the official appeal structure. Nothing further is needed from you while it's considered.",
      whatShort: 'Your final appeal is in. Nothing to do now.',
      whatToDo: 'Nothing right now. Add an update to your casefile when the decision arrives.',
      where: CEO,
      need: 'Nothing. Keep your filing acknowledgment safe.',
      howLong: 'No timeframe for second-appeal decisions is stated in official sources, so there is no countdown to show.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q34' },
      mustNot: 'Any predicted outcome or timing.',
    },
    {
      id: 'v-5',
      condition: a => a.voterQ1 === 'decision' && a.voterAppealed === 'decided',
      rec: 'ESCALATE',
      state: 'V-5',
      label: 'First appeal decided, still unresolved',
      dependency: 'State Chief Electoral Officer (second-tier appeal)',
      explanation: "You've already had a first appeal decided and it didn't resolve things. The official structure allows one further appeal, to your state's Chief Electoral Officer.",
      whatShort: 'File a second appeal with your state CEO',
      whatToDo: "File a second appeal with your state's Chief Electoral Officer, referencing the outcome of your first appeal.",
      where: CEO,
      need: 'The decision/order from your first appeal, and your original application reference number.',
      howLong: "No timeframe for the second appeal's decision is stated in official sources, and NextMove won't invent one.",
      source: {
        docId: ECI_FAQ,
        title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q34',
        quote: 'Two-tier appeal structure, verbatim.',
      },
      mustNot: "Any specific timeframe for the second appeal's decision, or its likely outcome.",
    },
    {
      id: 'v-4',
      condition: a => a.voterQ1 === 'decision' && a.voterAppealed === 'pending',
      rec: 'WAIT',
      state: 'V-4',
      label: 'Appeal already filed, decision pending',
      dependency: 'District Election Officer / District Magistrate (your first-tier appeal)',
      explanation: "You've already filed an appeal and it's still with the appellate authority. There's nothing further to do until they decide.",
      whatShort: 'Nothing to do yet. Your appeal is pending.',
      whatToDo: "Nothing is required from you right now. If it's been a long time, you can follow up directly with the office where you filed.",
      where: { label: 'District Election Officer / District Magistrate (per your district)' },
      need: 'Nothing yet. This is a waiting step.',
      howLong: 'No numeric timeline is stated for appeal decisions. Officially there is no "overdue" line to cross, so there\'s no countdown to show.',
      expectNext: "The appellate authority's decision will come from the office where you filed. Keep your filing acknowledgment safe; it's what a second-tier appeal would be built on if you ever need one.",
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q34' },
      mustNot: 'That the appeal "should" be decided by a given point — no numeric timeline is stated.',
    },
    {
      id: 'v-3',
      condition: a => a.voterQ1 === 'decision',
      rec: 'FOLLOW_UP',
      state: 'V-3',
      label: 'Decision received, unclear or disagreed with',
      dependency: 'You: the ball is in your court',
      explanation: "A decision has been issued on your application, communicated by post and SMS. NextMove can't tell you why it went the way it did (no official source describes rejection reasons), but it can point you to where to confirm it and what to do if you disagree.",
      whatShort: 'Check the decision, then appeal if needed',
      whatToDo: "Check the decision on your state CEO's website / roll listing to confirm exactly what it says. If you disagree, this is your entry point to a formal appeal.",
      where: CEO_LOOKUP,
      need: 'Your application reference number.',
      howLong: 'You set the pace on this step. No deadline for a first appeal is stated in the official sources NextMove has verified.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q25' },
      mustNot: 'Any reason for the decision — no official source categorizes rejection reasons.',
    },
    {
      id: 'v-2',
      condition: a => a.voterQ1 === 'blo_visited',
      rec: 'WAIT',
      state: 'V-2',
      label: 'Field verification underway, no decision yet',
      dependency: 'ERO decision',
      explanation: "A BLO has visited or contacted you. That's the standard next step for every application, and it means things are moving. The decision itself now sits with the Electoral Registration Officer.",
      whatShort: 'Nothing to do. This is expected.',
      whatToDo: 'Nothing further is required from you yet. Track your status with your reference number if you want a checkpoint.',
      where: TRACK,
      need: 'Your application reference number.',
      howLong: 'No official timeline exists for this verification, and there is no published "should be done by" to measure against, so there\'s no countdown to show.',
      expectNext: "The ERO's decision is what comes next. It's communicated by post and SMS (ECI FAQ Q25), so watch both. No further visit is normally needed from your side once the BLO step is done.",
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q23' },
      mustNot: 'That BLO contact means approval is likely, or that a decision is close.',
    },
    {
      id: 'v-1',
      condition: a => a.voterQ1 === 'no_word',
      rec: 'WAIT',
      state: 'V-1',
      label: 'Application submitted, awaiting decision',
      dependency: 'BLO verification → ERO decision',
      explanation: 'Your application has been received, and BLO field verification is the standard next step for every registration or correction. Not hearing anything yet is expected at this point, not a sign of a problem.',
      whatShort: 'Nothing to do. This is expected.',
      whatToDo: 'Nothing is required from you right now. You can track progress with your reference number any time.',
      where: TRACK,
      need: 'Your application reference number.',
      howLong: 'No official timeline exists for BLO verification. Not hearing anything yet has no official "late," so there\'s no countdown to show.',
      expectNext: 'What comes next is typically a visit or call from your BLO (Booth Level Officer) to verify your details. Keep your reference number and the documents from your application handy. The decision itself is communicated by post and SMS (ECI FAQ Q25), so keep an eye on both.',
      source: { docId: ECI_FAQ, title: 'ECI Electoral Roll FAQ — Final-ER-FAQ.pdf, Q21 & Q23' },
      mustNot: 'How long verification "should" take — no numeric timeline exists in official sources.',
    },
  ],
  fallback: {
    rec: 'UNCLASSIFIED',
    state: 'V-6',
    label: 'Status unclear',
    dependency: 'Unknown',
    explanation: "NextMove doesn't have enough evidence to safely place your case. Check your status directly rather than guess.",
    whatShort: 'Check your status directly',
    whatToDo: 'Check your application status via the reference-ID tracker, or call the toll-free Voter Helpline.',
    where: { label: "Voters' Service Portal", url: 'https://voters.eci.gov.in', phone: '1950' },
    need: 'Your application reference number, if you have it.',
    source: { docId: null, title: SAFETY_NET_TITLE },
    mustNot: 'Any WAIT / FOLLOW UP / ESCALATE claim.',
  },
}

/** A changed Q1 clears the Q1-dependent appeal answer — the same principle as
 *  Passport's Q1→Q2 reset, and a genuine difference from it: the appeal
 *  follow-up is stage-DEPENDENT by construction. Both keys are cleared: the
 *  playbook-read `voterAppealed` and the raw `voterAppealedRaw` the question
 *  screen stores for the trust disclosure (the raw→normalized transform is
 *  C3's). Outcome keys are deliberately not dependents. */
export const VOTER_DEPS: DependentKeys = { voterQ1: ['voterAppealed', 'voterAppealedRaw'] }

/** Answer keys whose value 'unclassified' means the citizen chose "I'm not
 *  sure" at that point. BOTH are listed: the prototype's Diagnosis screen
 *  checked both while currentDiagnosis() checked only voterQ1, so the same
 *  case could read UNCLASSIFIED on one screen and a confident FOLLOW_UP on the
 *  next. C1's ServiceEngine adopts the safer branch everywhere; this is its
 *  data (C1 plan, Task 6 recorded deviation). */
export const VOTER_UNCLASSIFIED_KEYS = ['voterQ1', 'voterAppealed']
