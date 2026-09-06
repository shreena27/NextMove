/** The SINGLE DEFINITION SITE for every authored, citizen-facing string C3's
 *  screens and shared templates render — Home, OtherServices, the Passport/
 *  Voter/SIR question screens, and the shared DiagnosisScreen/NextMoveScreen/
 *  TrustDisclosure/CaseTrail/Topbar copy. Rule-sourced text (anything reached
 *  through a `Diagnosis`) is NOT here — it is already scanned via
 *  `copyStrings(playbook)`. Answer-option labels that were already a single
 *  source of truth before C3 (`src/screens/labels.ts`'s PASSPORT_Q1_LABELS
 *  etc., `src/playbooks/sirPlaybook.ts`'s SIR_Q1_OPTIONS_FOR) stay there,
 *  unmoved and unduplicated — screenCopy.test.ts flattens them into the
 *  guardrail scan's `extra` array exactly the way it already flattens
 *  PASSPORT_STAGE_SHORT (C2's own precedent for a Record that is scanned
 *  without being relocated).
 *
 *  MUST NOT import anything under src/playbooks/guardrails/, not even a
 *  type. `guardrails/isolation.test.ts` walks every non-test .ts file under
 *  src/ (this one included) and fails the build on such an import — its
 *  regex does not exempt `import type`. So, exactly like
 *  `src/playbooks/sirPlaybook.ts`'s own `CopyLocation`, this file declares
 *  its own local, structurally-identical interface instead of importing the
 *  harness's `CopyString`. TypeScript's structural typing makes the two
 *  interchangeable wherever a test needs to hand one to the harness. */
export interface CopyLocation {
  at: string
  text: string
}

type CopyTree = { [key: string]: string | CopyTree }

/** Turns a nested authored-copy tree into the flat {at,text}[] shape the
 *  guardrail scan and the coverage test consume, addressing each leaf as
 *  "<bucket>:<dotted.path>" — the same "<serviceId>:<field>" convention
 *  every other CopyString.at in the project already uses (contentSafety.ts,
 *  sirPlaybook.ts's sirCopyExtras). Flattening happens once, mechanically,
 *  so a leaf's rendered text and its scanned text can never drift apart. */
function flatten(bucket: string, tree: CopyTree, path = ''): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const [key, value] of Object.entries(tree)) {
    const nextPath = path ? `${path}.${key}` : key
    if (typeof value === 'string') {
      out.push({ at: `${bucket}:${nextPath}`, text: value })
    } else {
      out.push(...flatten(bucket, value, nextPath))
    }
  }
  return out
}

/** Service-agnostic chrome: topbar labels, the restart-confirm prompt,
 *  Home's hero + lead-ins, OtherServices' Coming Soon rows, the shared
 *  Diagnosis/Next Move template copy, and the trust toggle + its row
 *  labels. Screens import the nested leaves directly (e.g.
 *  `UI.trust.toggle`); `SCREEN_COPY.ui` (below) is the flattened view. */
export const UI = {
  serviceLabel: {
    passport: 'Passport',
    voterServices: 'Voter Services',
    sir: 'SIR',
  },
  /** The crumb strip's phase-chip labels (`PhaseEyebrow`'s `phase` prop) —
   *  short, service-agnostic context words reused across multiple screens
   *  (e.g. "Understanding your case" on both Passport's and Voter's Q1). */
  phase: {
    understandingYourCase: 'Understanding your case',
    lastQuestion: 'Last question',
    recovery: 'Recovery',
    diagnosis: 'Diagnosis',
    yourNextMove: 'Your next move',
    justOneQuestion: 'Just one question',
  },
  topbar: {
    brand: 'NextMove',
    back: '← Back',
    restart: 'Restart',
    restartConfirm: {
      prompt: 'Clear your answers?',
      yes: 'Yes',
      cancel: 'Cancel',
    },
  },
  common: {
    backToHome: 'Back to Home',
  },
  home: {
    hero: {
      lead: "Know what's",
      mark: 'holding things up',
      line2: 'Know what to do next.',
    },
    heroPromise:
      "When a government process goes quiet, NextMove helps you understand what's happening and what to do next.",
    listLead: "What's stuck?",
    svc: {
      passport: { title: 'Passport', sub: 'Application or police verification' },
      voter: { title: 'Voter Services', sub: 'Registration, correction, verification, or SIR' },
      other: { title: 'Other services', sub: 'Income, caste, EWS and more' },
    },
  },
  otherServices: {
    crumb: 'Other services',
    headline: 'More services, on the way.',
    lede:
      "NextMove does one thing: it tells you what's holding a government process up and what to do next. These are the processes next in line. They're not live yet, so there's nothing to diagnose here today.",
    listLead: 'Coming soon',
    tag: 'Coming Soon',
    cert: {
      income: 'Income Certificate',
      caste: 'Caste Certificate',
      ews: 'EWS Certificate',
      domicile: 'Domicile Certificate',
    },
  },
  diagnosis: {
    headlineFound: 'We found where this is',
    headlineMark: 'waiting',
    headlineUnclassified: "We don't have enough information to call this safely.",
    waitingOn: 'Waiting on',
    cta: 'See my next move',
  },
  nextMove: {
    why: 'Why',
    where: 'Where',
    needHeading: "What you'll need",
    howLong: 'How long?',
    expectNext: 'What to expect',
    handoffNote: "An official government channel. NextMove helps you understand and prepare; it doesn't act on your behalf.",
    prepare: 'Prepare this for me',
  },
  trust: {
    toggle: 'Why am I seeing this?',
    youToldUs: 'You told us',
    notEnough: 'Not enough to safely place your case; see below.',
    whatThatMeans: 'What that means',
    basedOn: 'Based on',
    /** A TEMPLATE, not rendered verbatim — see the carve-out in
     *  screenCopy.test.ts and the Open Question 3 ruling in the task brief.
     *  `TrustDisclosure.tsx` interpolates `SOURCES_VERIFIED` for `{date}` at
     *  render. Registering it with the placeholder (rather than a literal
     *  date) keeps the fail-closed numeric scan's teeth sharp: a real date
     *  here would need a `sourced_dates` allowlist entry that corrodes an
     *  allowlist meant to stay unambiguously government-sourced. */
    verifiedOn: "Checked against NextMove's archived copy of this source on {date}.",
  },
} as const

/** Passport-specific authored copy: the guardrail/out-of-scope/Q1/Q2/
 *  recovery screens (Tasks 4), and the case trail (Task 6, Passport-only —
 *  FR-V-10). Answer-option labels already owned by `labels.ts`
 *  (PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS) are deliberately NOT
 *  duplicated here — see this file's header note. */
export const PASSPORT_COPY = {
  guardrail: {
    headline: 'Already received your passport?',
    lede: "This version of NextMove is designed for applications where the passport hasn't been issued yet. Still waiting on yours? Two quick questions from here, or a few more if you're not sure. That's fine too.",
    no: 'No, still waiting on it',
    yes: 'Yes, I already have it',
  },
  outOfScope: {
    banner: "This version of NextMove is designed for applications where the passport hasn't been issued yet, and since yours has already arrived, there's nothing here for NextMove to diagnose.",
  },
  q1: {
    headline: "What's happening with your application?",
    lede: "Don't worry if you're not sure. Pick the closest option.",
    notSure: "I'm not sure",
    notSureSub: 'Show me how to find out',
  },
  q2: {
    headline: 'Have you already tried to follow up on this?',
    noFollowupSub: 'Most common answer',
    informalSub: 'Call, visit, or portal message',
  },
  recovery: {
    headline: "Let's find your status a different way.",
    paste: 'Paste your status text',
    pasteSub: "I'll try to match it to a known stage",
    show: 'Show me where to find my status',
    safest: 'Tell me the safest thing to do now',
    /** The recovery echoes forwarded to TrustDisclosure as `extraToldUs`
     *  (design note 10). `extraToldUsPasted` is a fixed PREFIX — the pasted
     *  text itself is the citizen's own input, never authored copy, so it
     *  is not (and must not be) part of this constant. */
    extraToldUsPasted: 'Pasted status text:',
    extraToldUsSafest: 'Asked for the safest thing to do now',
  },
  recoveryPaste: {
    headline: 'Paste the status text you see.',
    lede: 'NextMove only matches a small set of known example phrases exactly; anything else is treated as unknown rather than guessed. Try one of these, or paste your own:',
    placeholder: 'e.g. Police verification report has been received',
    continue: 'Continue',
  },
  recoveryShow: {
    headline: 'Where to find your status',
    ledeLead: 'Log in to the Passport Seva portal and open',
    ledeBold: 'Track Application Status',
    ledeTail: 'using your File Number or Application Reference Number (ARN).',
    cta: 'Okay, back to the question',
  },
  caseTrail: {
    steps: {
      application: 'Application',
      appointment: 'Appointment',
      policeVerification: 'Police verification',
      processing: 'Processing',
    },
    hereMarker: 'You are here',
  },
} as const

/** Voter Services-specific authored copy (Task 5). VOTER_Q1_LABELS /
 *  VOTER_APPEAL_LABELS stay in `labels.ts` — see this file's header note. */
export const VOTER_COPY = {
  entry: {
    headline: "What's going on with your voter registration?",
    applied: "I applied for something and I'm waiting to hear back",
    appliedSub: 'New registration, correction, or a replacement card',
    sir: 'This is about SIR',
    sirSub: 'The Special Intensive Revision',
    notSure: "I'm not sure",
    explain: {
      regularLabel: 'Regular application',
      regularText: ': you filled a form (new registration, address change, name correction, replacement card) and are waiting on a decision.',
      sirLabel: 'SIR',
      sirText: ': a special, area-wide re-check of the entire electoral roll happening in batches by state, separate from any individual application you may have also filed.',
      regularCta: "It's a regular application",
      sirCta: "It's about SIR",
    },
  },
  q1: {
    headline: "What's the situation with your application?",
    notSure: "I'm not sure",
  },
  q2: {
    headline: 'Have you already appealed this decision?',
  },
} as const

/** SIR-specific authored copy (Task 5). Phase notes and Q1 option labels
 *  are `sirPlaybook.ts`'s own (`sirCopyExtras()`), not duplicated here. */
export const SIR_COPY = {
  state: {
    headline: 'Which state is this for?',
    lede: 'SIR\'s document list and appeal rules are the same nationally, but the current phase and dates differ by state, so NextMove checks yours before saying "wait" or "act now."',
  },
  unsupported: {
    headline: "SIR guidance for your state isn't available in NextMove yet.",
    lede: "SIR processes can differ by state and revision stage. We only give case-specific guidance where we've verified the official workflow. Right now, that's Delhi only.",
    whereToCheck: 'Where to check instead',
    portalLabel: "Voters' Service Portal — voters.eci.gov.in",
    helpline: 'Toll-free Voter Helpline: 1950',
    handoffNoteLead: "An official ECI channel. NextMove hasn't verified state-specific SIR rules for",
    handoffNoteTail: "yet, so it can't safely tell you WAIT, FOLLOW UP, or ESCALATE here.",
  },
  q1: {
    headline: "What's happening with your SIR situation?",
    ledeConnective: 'is currently in the',
    ledeTail: "Enumeration and the Draft Roll are both already behind us, so that's what these options reflect.",
    notSure: "I'm not sure",
  },
} as const

/** Every authored C3 string, addressed serviceId-first — the flattened view
 *  the guardrail scan (screenCopy.test.ts) and the coverage test consume.
 *  Screens themselves import the nested trees above, never this object. */
export const SCREEN_COPY = {
  ui: flatten('ui', UI),
  passport: flatten('passport', PASSPORT_COPY),
  voter: flatten('voter', VOTER_COPY),
  sir: flatten('sir', SIR_COPY),
}
