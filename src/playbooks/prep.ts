// "Prepare this for me" — per-rule prep plans and shared visit tips.
// TRANSCRIBED, not authored: design/nextmove-v1-prototype.html lines
// 1536-1730 (git tag v1-design-lock-2, commit 91ff7a1).
//
// This is playbook DATA, not screen chrome: the PREP map is keyed by
// playbook rule id, its strings name official channels and verified
// requirements, and it must pass the same §7 content-safety scan as rule
// copy. sirPlaybook.ts's CopyLocation/sirCopyExtras() pattern is the
// precedent this file mirrors line for line.
import type { Diagnosis, Playbook } from '../domain/types'

/** Local {at,text}. MUST NOT import CopyString from ../guardrails/ — this is
 *  application/playbook-data code and guardrails/isolation.test.ts walks it
 *  (its regex does not exempt `import type`). Same pattern as
 *  sirPlaybook.ts's own CopyLocation and screenCopy.ts's. */
export interface CopyLocation { at: string; text: string }

/** A step is either a bare instruction or an instruction with an official
 *  URL to open in a new tab. The prototype stores the bare form as a plain
 *  string (`typeof s === 'string' ? {text:s} : s`, line 3791); this port
 *  keeps that union rather than normalising, so the data file stays a
 *  byte-faithful transcription and a reviewer can diff it against the lock. */
export type PrepStep = string | { text: string; url: string }

export interface PrepVisit {
  /** Rule-SPECIFIC, verified carry items. Never merged with VISIT_EXPECT. */
  carry: string[]
  /** Optional "Then what?" line. */
  after?: string
}

export interface PrepPlan {
  /** Absent on the three SIR entries (`s-notice`, `s-roll-absent`,
   *  `s-roll-unchecked`) — the screen falls back to
   *  UI.prepare.headlineFallback, exactly as the prototype does (3766). */
  title?: string
  /** Absent on the same three SIR entries (`s-notice`, `s-roll-absent`,
   *  `s-roll-unchecked`): those plans are checklists with nothing to
   *  draft, and the lede changes to match (3767). Measured: the
   *  title-less set and the draft-less set are the same three. */
  draft?: string
  steps: PrepStep[]
  doneNote?: string
  visit?: PrepVisit
}

// General practical guidance for ANY government-office visit. Shown
// under an explicit "general tips, not official rules" label so it can
// never be mistaken for verified process content.
export const VISIT_EXPECT: string[] = [
  'An ID check or a visitor register at the entrance is common.',
  'There may be a queue or a token system, so build in time.',
  'Before you leave, ask for an acknowledgment or receipt with a date, and note the name and designation of whoever takes your papers.',
  "If something is refused or unclear, don't argue it out on the spot. Note what was said and use the online channel or helpline instead.",
]

export const PREP: Record<string, PrepPlan> = {
  'state-5a': {
    title: 'Your formal grievance, drafted.',
    draft:
`Subject: Grievance — pending passport application [File Number / ARN]

I am the applicant for passport application [File Number / ARN], submitted on [date you applied].

My case has not progressed, and I have already followed up informally on [date] via [call / visit / portal message] without resolution.

I request a review of my application's status and confirmation of the next required action.

[Your name]
[Your contact number and email]`,
    steps: [
      { text: 'Open the Grievance / CPGRAMS channel (or call 1800-258-1800).', url: 'https://www.passportindia.gov.in/psp/Grievance' },
      'Sign in with your File Number or ARN.',
      'Copy the draft above and paste it into the grievance form. Fill every [bracket] first.',
      'Submit it yourself and note the grievance number you receive.',
      'Keep that number safe. It becomes your reference if this ever needs to escalate.',
    ],
    doneNote: 'All steps done. That grievance number is your case\'s anchor now. Keep it where you can find it.',
  },
  'state-5b': {
    title: 'Your escalation to the DPG, drafted.',
    draft:
`Subject: Escalation of unresolved grievance [CPGRAMS grievance number]

I filed grievance [CPGRAMS grievance number] on [date filed] regarding my pending passport application [File Number / ARN].

The grievance remains unresolved. I request the Directorate of Public Grievances to review the matter.

[Your name]
[Your contact number and email]`,
    steps: [
      { text: 'Open the Directorate of Public Grievances portal.', url: 'https://dpg.gov.in' },
      'Register or sign in, and have your existing CPGRAMS grievance number ready.',
      'Copy the draft above, fill every [bracket], and paste it into the escalation form.',
      'Submit it yourself and note the new reference number you receive.',
    ],
    doneNote: 'All steps done. Your case is now with the highest grievance body. Keep the new reference number safe.',
  },
  'state-4': {
    title: 'Your message to the Passport Office, drafted.',
    draft:
`Subject: Request for clarification — application [File Number / ARN]

My application status shows: "[paste the exact status text you saw]".

I do not understand what this means for my case. Please tell me:
1. The reason for this status.
2. Whether anything is required from me.
3. Whether re-verification applies to my case, and how to request it.

[Your name]
[Your contact number and email]`,
    steps: [
      { text: 'Contact your Passport Office online or via the helpline 1800-258-1800.', url: 'https://www.passportindia.gov.in' },
      'Have your File Number / ARN ready before you start.',
      'Use the draft above as your message or call script. Fill every [bracket] first.',
      'Note down who you spoke to (or the ticket number) and the date.',
    ],
    visit: {
      carry: ['Your ARN / File Number (printout or the SMS)', 'A screenshot or printout of the portal status you saw', 'A government photo ID (original + photocopy)'],
      after: "Afterwards: the office's clarification decides the next stage: if re-verification applies, that runs before processing resumes.",
    },
  },
  'state-3': {
    title: 'Your follow-up on processing, drafted.',
    draft:
`Subject: Status check — application [File Number / ARN]

I believe police verification for my application was completed around [rough date]. Nothing has changed on my case since.

Please confirm:
1. That the verification report is logged against my application.
2. The current processing status of my case.

[Your name]
[Your contact number and email]`,
    steps: [
      { text: 'Contact your Passport Office online or via the helpline 1800-258-1800.', url: 'https://www.passportindia.gov.in' },
      'Have your File Number / ARN ready.',
      'Use the draft above, filling every [bracket] first.',
      'Note the response and date; if this goes unresolved, a formal grievance is the next verified step.',
    ],
  },
  'state-2': {
    title: 'Your check-in with the Passport Office, drafted.',
    draft:
`Subject: Verification status — application [File Number / ARN]

Police contacted me on [date] regarding verification for my application, but it does not appear to be complete.

Please tell me whether anything further is required from me to complete verification.

[Your name]
[Your contact number and email]`,
    steps: [
      { text: 'Contact your Passport Office online or via the helpline 1800-258-1800, or ask your local police station directly.', url: 'https://www.passportindia.gov.in' },
      'Have your File Number / ARN ready.',
      'Use the draft above, filling every [bracket] first.',
      'Note what they say is pending, if anything, and the date you asked.',
    ],
    visit: {
      carry: ['Your ARN / File Number (printout or the SMS)', 'A government photo ID (original + photocopy)', 'Any documents the police mentioned when they contacted you'],
      after: 'Afterwards: completed verification goes back to the Passport Office for processing. That is the next stage on your case trail.',
    },
  },
  'v-3': {
    title: 'Your first appeal, drafted for if you disagree.',
    draft:
`To: The District Election Officer / District Magistrate, [your district]

Subject: Appeal against decision on application [reference number]

I applied for [registration / correction / replacement card] under reference [reference number]. A decision was communicated to me on [date], which I wish to appeal because [why you disagree — what you believe is incorrect].

I request a review of this decision.

[Your name, as on the application]
[Your address and contact details]`,
    steps: [
      { text: "First, confirm the exact decision on your state CEO's website / roll listing. It decides whether an appeal is even needed.", url: 'https://voters.eci.gov.in' },
      'If you disagree with it: copy the draft above and fill every [bracket].',
      'File the appeal before the District Election Officer / District Magistrate of your district.',
      'Keep a copy of what you filed and the date. A second-tier appeal to the state CEO needs both.',
    ],
    visit: {
      carry: ['Your printed appeal letter (two copies, one for their stamp)', 'The decision you received (SMS screenshot, letter, or roll printout)', 'Your application reference number', 'A government photo ID (original + photocopy)'],
      after: 'After you file: the first appeal is decided by the DEO/DM. If that still doesn\'t resolve it, one further appeal to the state CEO exists (ECI FAQ Q34).',
    },
  },
  'v-5': {
    title: 'Your second appeal to the state CEO, drafted.',
    draft:
`To: The Chief Electoral Officer, [your state]

Subject: Second appeal — application [reference number]

My first appeal regarding application [reference number] was decided on [date] by the District Election Officer / District Magistrate. The outcome was: [what the first appeal decided].

I remain aggrieved because [why the decision doesn't resolve your case], and I request a review under the second-tier appeal provided for in the electoral roll framework.

Enclosed: the decision/order from my first appeal.

[Your name, address, and contact details]`,
    steps: [
      { text: "Locate your state CEO's office / appeal channel via your state CEO website (reachable from the national portal).", url: 'https://voters.eci.gov.in' },
      'Copy the draft above and fill every [bracket].',
      'Attach the decision/order from your first appeal. The second tier is built on it.',
      'File it yourself and keep the acknowledgment.',
    ],
    visit: {
      carry: ['Your printed second-appeal letter (two copies)', 'The decision/order from your first appeal (original + photocopy)', 'Your original application reference number', 'A government photo ID (original + photocopy)'],
      after: 'After you file: this is the final appeal tier in the official structure (ECI FAQ Q34).',
    },
  },
  's-notice': {
    steps: [
      'Pick ONE document from the list on the previous screen. Any one is enough.',
      "Re-read the notice for where and how to submit; the notice's own instructions control.",
      'Submit the document to your BLO / ERO as the notice directs.',
      "Act promptly: your notice's own instructions control the timing (Delhi's notice/disposal phase itself runs through 29 Oct 2026).",
      'Keep an acknowledgment or photo of what you submitted, with the date.',
      { text: "If the notice's instructions are unclear, call the toll-free Voter Helpline 1950 before submitting.", url: 'https://voters.eci.gov.in' },
    ],
    visit: {
      carry: ['The notice itself', 'ONE document from the ECI-accepted list (original + photocopy)', 'A government photo ID (original + photocopy)'],
      after: 'After you submit: the decision on your record rests with the ERO.',
    },
  },
  // 's-duplicate' prep moved to sirDormantRules_enumeration (phase-retired).
  's-roll-absent': {
    steps: [
      'Gather one ECI-accepted document and the Declaration Form.',
      { text: 'Open the Voters\' Service Portal (or go to your Voter Centre in person).', url: 'https://voters.eci.gov.in' },
      'File Form 6 with both attached. The filing window is open now and closes 30 Sep 2026 in Delhi.',
      'Save the acknowledgment. It is your proof of filing if the Final Roll goes wrong.',
    ],
    visit: {
      carry: ['Form 6, filled', 'The Declaration Form', 'One ECI-accepted document (original + photocopy)', 'A government photo ID (original + photocopy)'],
      after: 'After you file: the next official milestone is the Final Roll — 4 Nov 2026 in Delhi.',
    },
  },
  's-roll-unchecked': {
    steps: [
      { text: 'Open the Voters\' Service Portal, the ECINET app, or the Delhi CEO website.', url: 'https://voters.eci.gov.in' },
      'Search the Draft Roll by your name and constituency.',
      "If you're listed: nothing further to do. The Final Roll (4 Nov 2026) is the next milestone.",
      "If you're not listed: come back and take the \"name isn't there\" path. Form 6 is the fix, and the filing window closes 30 Sep 2026.",
    ],
    doneNote: 'All steps done. What you found on the roll decides the next step, and NextMove can re-diagnose any time.',
  },
}

export function prepPlanFor(d: Pick<Diagnosis, 'ruleId'>): PrepPlan | undefined {
  return d.ruleId ? PREP[d.ruleId] : undefined
}

/** Every citizen-facing prep string this playbook ships, addressed
 *  serviceId-first — the shape guardrailFindings({ extra }) consumes.
 *  Driven off playbook.rules, NOT off Object.keys(PREP), so a plan for a
 *  rule the playbook does not ship can never be swept under that
 *  playbook's serviceId (and is caught by the orphan test instead). */
export function prepCopyExtras(playbook: Playbook): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const rule of playbook.rules) {
    const plan = PREP[rule.id]
    if (!plan) continue
    const at = `${playbook.serviceId}:PREP.${rule.id}`
    if (plan.title) out.push({ at: `${at}.title`, text: plan.title })
    if (plan.draft) out.push({ at: `${at}.draft`, text: plan.draft })
    plan.steps.forEach((s, i) => {
      const text = typeof s === 'string' ? s : s.text
      out.push({ at: `${at}.steps[${i}]`, text })
    })
    if (plan.doneNote) out.push({ at: `${at}.doneNote`, text: plan.doneNote })
    if (plan.visit) {
      plan.visit.carry.forEach((c, i) => out.push({ at: `${at}.visit.carry[${i}]`, text: c }))
      if (plan.visit.after) out.push({ at: `${at}.visit.after`, text: plan.visit.after })
    }
  }
  return out
}

/** VISIT_EXPECT is shared by every service, so it is swept under whichever
 *  bucket the caller is scanning — the same convention screenCopy.test.tsx's
 *  ladderTagCopy(bucket) already uses for LADDER_TAG. */
export function visitExpectCopy(bucket: string): CopyLocation[] {
  return VISIT_EXPECT.map((text, i) => ({ at: `${bucket}:VISIT_EXPECT[${i}]`, text }))
}
