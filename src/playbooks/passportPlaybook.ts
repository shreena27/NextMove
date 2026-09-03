import type { Answer, Diagnosis, Playbook, PlaybookRule, SourceReference } from '../domain/types'

// Passport Slice 1 rules. Every rule's explanation, dependency, action and
// source is taken directly from NEXTMOVE_PRD.md §10 (Passport Diagnosis
// States), itself validated against official passportindia.gov.in sources —
// see "The Passport Blueprint" v2 for the full citation trail.
//
// Do not add numeric day/date thresholds here. The Citizen's Charter
// explicitly excludes the police-verification period from every timeline
// commitment — see FAQ_STUCK_CASE and CITIZENS_CHARTER below.

const passportOffice = { label: 'Passport Office (PO) concerned' }
const grievanceChannel = {
  label: 'CPGRAMS / Passport Seva Grievance',
  url: 'https://www.passportindia.gov.in/psp/Grievance',
  phone: '1800-258-1800',
}
const dpgChannel = {
  label: 'Directorate of Public Grievances (DPG), Cabinet Secretariat',
  url: 'https://dpg.gov.in/Default.aspx',
}
const statusCheckChannel = { label: 'National Call Centre', phone: '1800-258-1800' }

const FAQ_STUCK_CASE: SourceReference = {
  title: 'Passport Seva — Police Verification FAQ',
  url: 'https://www.passportindia.gov.in/psp/FaqPoliceVerification',
  quote: 'If you have not received your Passport, please visit the Passport Office (PO) concerned.',
}
const FAQ_ADVERSE: SourceReference = {
  title: 'Passport Seva — Police Verification FAQ',
  url: 'https://www.passportindia.gov.in/psp/FaqPoliceVerification',
  quote:
    'Please contact Passport Office (PO) to understand the reason of adverse report. Post clarification, if required a re-verification can be requested. PO needs to get a clear police report from the re-verification, for issue of a Passport. On receipt of a clear report from the police, your file will be processed further for issue of a Passport.',
}
const CITIZENS_CHARTER: SourceReference = {
  title: "Citizen's Charter — Ministry of External Affairs (July 2026)",
  url: 'https://www.passportindia.gov.in/AppOnlineProject/pdf/Citizen_Charter.pdf',
  quote: 'Up to 30 working days (Police Verification (PV) period excluded)',
}
const GRIEVANCE_PAGE: SourceReference = {
  title: 'Passport Seva — Feedback / Grievance',
  url: 'https://www.passportindia.gov.in/psp/Grievance',
  quote:
    'If your passport-related grievance has not been satisfactory redressed by the MEA/Passport issuing Authority within a reasonable period of time, you may lodge a grievance with the Directorate of Public Grievances (DPG), Cabinet Secretariat, Government of India at https://dpg.gov.in/Default.aspx',
}

function answerFor(answers: Answer[], questionId: string): string | undefined {
  return answers.find((a) => a.questionId === questionId)?.value
}

function q1Is(...values: string[]) {
  return (answers: Answer[]) => {
    const q1 = answerFor(answers, 'q1')
    return q1 !== undefined && values.includes(q1)
  }
}

function q1AndQ2(q1Values: string[], q2Value: string) {
  return (answers: Answer[]) =>
    q1Is(...q1Values)(answers) && answerFor(answers, 'q2') === q2Value
}

const STAGE_VALUES = ['no_contact', 'contacted_incomplete', 'verified_no_progress', 'adverse']

const rules: PlaybookRule[] = [
  {
    id: 'state-1',
    condition: q1AndQ2(['no_contact'], 'no_followup'),
    diagnosisState: '1',
    dependency: 'Police verification process',
    recommendation: 'WAIT',
    explanation:
      'This is the expected current stage. Nothing is overdue — no official timeline exists for this step.',
    action: passportOffice,
    sources: [CITIZENS_CHARTER, FAQ_STUCK_CASE],
    whatToDo: "No action is required right now — you can wait, or check in if you'd feel better doing so.",
    whatYoullNeed: "Nothing required — a file number helps but isn't necessary.",
  },
  {
    id: 'state-2',
    condition: q1AndQ2(['contacted_incomplete'], 'no_followup'),
    diagnosisState: '2',
    dependency: 'Police verification process',
    recommendation: 'FOLLOW_UP',
    explanation:
      'Police have contacted you, but verification does not appear complete yet.',
    action: passportOffice,
    sources: [FAQ_STUCK_CASE],
    guardrails: ['never claim the applicant owes an outstanding task'],
    whatToDo: 'Check whether anything further is needed from you.',
    whatYoullNeed: "Nothing required — a file number helps but isn't necessary.",
  },
  {
    id: 'state-3',
    condition: q1AndQ2(['verified_no_progress'], 'no_followup'),
    diagnosisState: '3',
    dependency: 'Passport Office — report received but not yet processed',
    recommendation: 'FOLLOW_UP',
    explanation:
      "Verification appears complete on your side, but the application hasn't progressed since. A status follow-up with the Passport Office is a reasonable next step.",
    action: passportOffice,
    sources: [FAQ_STUCK_CASE],
    whatToDo: 'Send a status follow-up to the Passport Office.',
    whatYoullNeed: 'Your application/file number, if you have it.',
  },
  {
    id: 'state-4',
    condition: q1AndQ2(['adverse'], 'no_followup'),
    diagnosisState: '4',
    dependency: 'You and the Passport Office — cause not yet understood',
    recommendation: 'FOLLOW_UP',
    explanation:
      'Contact the Passport Office to understand the specific reason for the adverse or unclear report. Clarify if required, then a re-verification can be requested.',
    action: passportOffice,
    sources: [FAQ_ADVERSE],
    guardrails: ['never state or imply the cause of the adverse finding'],
    whatToDo: 'Contact the Passport Office to understand the reason, and request re-verification if needed.',
    whatYoullNeed: 'Your application/file number, and any notice you received.',
  },
  {
    id: 'state-5a',
    condition: q1AndQ2(STAGE_VALUES, 'informal'),
    diagnosisState: '5a',
    dependency: 'Passport Office — informal contact did not resolve it',
    recommendation: 'FOLLOW_UP',
    explanation:
      "You've already reached out informally. Moving to the formal Grievance channel is the appropriate next step.",
    action: grievanceChannel,
    sources: [CITIZENS_CHARTER, GRIEVANCE_PAGE],
    whatToDo: 'File a formal Grievance through CPGRAMS or the Passport Seva Grievance page.',
    whatYoullNeed: 'Your application/file number and a short summary of your earlier follow-up.',
  },
  {
    id: 'state-5b',
    condition: q1AndQ2(STAGE_VALUES, 'formal_grievance'),
    diagnosisState: '5b',
    dependency: 'Passport-issuing Authority / MEA — formal grievance already open',
    recommendation: 'ESCALATE',
    explanation:
      'Your formal grievance remains unresolved. Escalating to the Directorate of Public Grievances is the next verified route.',
    action: dpgChannel,
    sources: [GRIEVANCE_PAGE],
    guardrails: ['never state a specific number of days for "reasonable period"'],
    whatToDo: 'Escalate to the Directorate of Public Grievances (DPG), Cabinet Secretariat.',
    whatYoullNeed: 'Your grievance registration number and a short case history.',
  },
]

const fallback: Diagnosis = {
  state: '6',
  dependency: 'Unknown — not enough was supplied to identify a stage',
  recommendation: 'UNCLASSIFIED',
  explanation:
    "NextMove doesn't have enough information to safely determine your case state.",
  matchedAnswers: [],
  matchedRuleId: null,
  action: statusCheckChannel,
  sources: [],
  whatToDo: 'Check your status directly rather than guess.',
  whatYoullNeed: 'Your application/file number, if you have it.',
}

export const passportPlaybook: Playbook = {
  serviceId: 'passport',
  rules,
  fallback,
}
