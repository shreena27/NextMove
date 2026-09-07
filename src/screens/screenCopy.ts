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
    prepare: 'Prepare',
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
  footer: {
    copyright: '© 2026 NextMove. All rights reserved.',
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
    // The casefiles section (Task 11; prototype renderHome, 3137-3142).
    // `casefilesOne`/`casefilesMany` are TWO SEPARATE templates, not one
    // built by string concatenation — the same JourneyLog.tsx-precedented
    // reason casefile.journeyOne/journeyMany already give: the singular
    // form can then never accidentally grow a suffix it shouldn't have.
    casefilesOne: 'Your casefile · {n}', // TEMPLATE
    casefilesMany: 'Your casefiles · {n}', // TEMPLATE
    closedLead: 'Closed',
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
  /** freshBanner (C6; prototype's freshBanner(), line 2022) — shared by
   *  Diagnosis/NextMove/Prepare/Casefile, the first child of the right
   *  column on all four (same position in every one, per the prototype's
   *  own call sites). `reverifiedLead` is the bold lead-in, `reverifiedBody`
   *  the plain tail — same one-Banner bold/plain split as
   *  diagnosis.phaseDriftLead/Body below. `reverifiedBody` is a TEMPLATE:
   *  interpolates the earliest changedOn among the degraded engine's
   *  changed documents for {date} — never rendered verbatim, see
   *  CAPTION_TEMPLATES in screenCopy.test.tsx. */
  freshness: {
    reverifiedLead: 'Being re-verified.',
    reverifiedBody:
      "An official source behind this guidance changed on {date}. A human is re-checking the affected rules against it. Until that's done, NextMove pauses its case-specific advice here rather than show guidance it can't currently back. For anything urgent, use the official channel directly.", // TEMPLATE
  },
  diagnosis: {
    headlineFound: 'We found where this is',
    headlineMark: 'waiting',
    headlineUnclassified: "We don't have enough information to call this safely.",
    waitingOn: 'Waiting on',
    cta: 'See my next move',
    /** The ciJustUpdated undo banner (Task 11, design note 3.1; prototype
     *  renderDiagnosis, 3598) — `updateRecorded` is the banner's own text,
     *  `undoUpdate` its `.read-change` button label. */
    updateRecorded: 'Update recorded. This is where it leaves your case.',
    undoUpdate: 'Undo that update',
    /** The SIR phase-drift banner (Task 13, design note 1; prototype
     *  renderDiagnosis, 3600) — `phaseDriftLead` is the bold lead-in,
     *  `phaseDriftBody` the plain tail, rendered inside one `<Banner>` the
     *  same way `updateRecorded`'s own bold/plain split doesn't need
     *  (single sentence there) but this one does (two, the first bold). */
    phaseDriftLead: 'The SIR phase changed while this case was saved.',
    phaseDriftBody:
      "NextMove re-checked your case against the current phase, so this diagnosis reflects today's rules, not the ones from when you saved.",
  },
  /** `updateEntry` (prototype 2284-2289) — the tracking entry point shared
   *  by Diagnosis (Task 11's own design note 3.5) and Next Move (design
   *  note 4). Only one string: the component itself makes no routing
   *  decision (design note 1 — that logic already lives in the reducer's
   *  BEGIN_WORKING_CHECKIN arm, Task 5). */
  updateEntry: {
    label: "Add an update: what's happened since?",
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
  /** "Prepare this for me" screen chrome (C4). Transcribed from the
   *  prototype's `renderPrepare` (design/nextmove-v1-prototype.html,
   *  3746-3800-ish, tag v1-design-lock-2) — none of it authored. Task 3
   *  supplies the shell's seven entries (through `channelOpen`); Task 4
   *  adds the draft-card entries (`draftK` through `copiedMany`), and
   *  Task 5 adds the checklist/visit-card entries (`stepsCount` through
   *  `doneBackHome`). `channelPhone` is a TEMPLATE like `ui:trust.verifiedOn`
   *  above — registered with its `{phone}` placeholder, interpolated at
   *  render, carved out of screenCopy.test.tsx's literal-string scan the
   *  same way. */
  prepare: {
    headlineFallback: "Here's how to get this done.",
    ledeDraft:
      'Review the draft, make it yours, then walk the steps. You send it yourself, from your own hands, on the official channel.',
    ledeSteps:
      'Walk the steps below, ticking them off as you go. Every one of them happens on the official channel, by you.',
    trust:
      "NextMove drafts and organizes; it never submits anything on your behalf. The final step is always yours. That's by design.",
    channelK: 'Official channel',
    channelPhone: 'Helpline: {phone}', // TEMPLATE — see the header note above.
    channelOpen: 'Open in new tab ↗',
    draftK: 'Your draft',
    draftAria: 'Editable draft',
    hintOne: '{n} blank in [brackets] left to fill; everything else is ready.', // TEMPLATE
    hintMany: '{n} blanks in [brackets] left to fill; everything else is ready.', // TEMPLATE
    hintReady: 'All blanks filled. Ready to copy and send.',
    copy: 'Copy draft',
    copied: 'Copied ✓',
    copiedOne: 'Copied, {n} blank left', // TEMPLATE
    copiedMany: 'Copied, {n} blanks left', // TEMPLATE
    stepsCount: '{done} of {total} done', // TEMPLATE
    stepOpen: 'Open ↗',
    doneNoteFallback: "All steps done. You've completed everything this stage needs from you.",
    visitTitle: "If you're going in person",
    visitCarry: 'Carry',
    visitExpect: 'What to expect',
    visitThen: 'Then what?',
    visitNote:
      "The carry list combines this case's verified requirements with common-sense basics. The tips are general practical guidance for any government office, not official rules.",
    doneBackHome: 'Done, back to Home',
  },
  /** The casefile screen — port of `renderCheckin` (design/nextmove-v1-
   *  prototype.html, 2830-2970, tag v1-design-lock-2). Per the compact-card
   *  spec, this screen IS the case's home ("there is no fifth surface").
   *  `prepareStepsK`/`prepareCount` are Task 8's (the `.case-progress`
   *  block); everything else is Task 9's.
   *
   *  `journeyOne`/`journeyMany` are TWO separate full templates, not one
   *  built by concatenating a shared prefix with a conditionally-appended
   *  plural suffix — a mechanism deviation from the prototype's own inline
   *  ternary (`` `Journey · ${n} entr${n===1?'y':'ies'}` ``), for the exact
   *  reason JourneyLog.tsx's own header note gives for `collapsedOne`/
   *  `collapsedMany`: the singular form can then never accidentally grow a
   *  suffix it shouldn't have. Same rendered output either way. */
  casefile: {
    prepareStepsK: 'Prepare steps',
    prepareCount: '{done} of {total} done', // TEMPLATE

    yourCasefile: 'Your casefile',
    // The meta-line templates (2914, 2888). `metaSaved` is reused for BOTH
    // the open-and-saved branch and the closed variant's "Saved {day}"
    // prefix — the prototype composes the identical literal in both places.
    metaStarted: 'Started {day}', // TEMPLATE
    metaSaved: 'Saved {day}', // TEMPLATE
    metaCheckBackSuffix: ' · check back {date}', // TEMPLATE
    metaClosedSuffix: ' · closed {date}', // TEMPLATE
    journeyOne: 'Journey · {n} entry', // TEMPLATE
    journeyMany: 'Journey · {n} entries', // TEMPLATE

    // The closed variant (2884-2901).
    closedGotItHeadline: 'Case closed: you got it.',
    closedUnresolvedHeadline: 'Case closed. The record stays.',
    // Task 5 (D3) — FINALIZED, added during the same Fable consultation
    // that authored LOG_COPY.superseded (domain/casefile.ts). Not in the
    // original draft; reuses closedUnresolvedHeadline's exact second
    // sentence deliberately, so closedLede below still reads true beneath
    // it without its own change (see task-5-brief.md design note 4).
    closedSupersededHeadline: 'Case set aside. The record stays.',
    closedLede: "Nothing further is tracked on a closed case. The journey record stays yours. It's the paper trail any future step would start from.",
    reopen: 'This came back; reopen it',

    // The "Add an update" module head + lede (2932-2937).
    addUpdateKicker: 'Add an update',
    whatsHappenedTitle: "What's happened since?",
    addUpdateLede: 'Pick what actually happened, and your casefile and diagnosis update from it. If none of these fit, "Something else happened" re-checks your case properly.',

    // The SIR phase-drift interstitial (Task 13, design note 2; prototype
    // 2925-2931) — REPLACES the whole module above when `phaseDrift`, so no
    // check-in option is reachable before the citizen re-checks their case.
    phaseDriftKicker: 'Before any update',
    phaseDriftTitle: 'The SIR phase changed while this case was saved.',
    phaseDriftBody:
      "The options and recommendations from when you saved may no longer apply. Answer one question against today's phase and NextMove re-diagnoses your case; your journey record keeps everything you've already done.",
    phaseDriftCta: "Re-check my case against today's phase",

    // The four follow-up panels (2836-2876). `cancel` is ONE registered
    // string reused at its three literal "Cancel" sites within this same
    // render function (the confirm panel's `.btn-secondary`, the valence
    // panel's `.btn-ghost`, and the remove control's inline confirm) — the
    // prototype's own source has the same bare word at all three.
    pickedEcho: 'You picked:',
    confirmQ: 'Record this?',
    confirmBody: 'It updates your casefile',
    confirmDiagnosisClause: ' and may change your diagnosis',
    confirmYes: 'Yes, record it',
    cancel: 'Cancel',
    valenceQ: 'Which way did it go?',
    favour: 'In my favour',
    against: 'Against me / rejected',
    closureYes: "Yes, it's done",
    closureNotYet: 'Not yet',
    reassureLead: 'Nothing changing is not a bad sign here.',
    reassureConsecutive: "This stage doesn't change day to day, so checking more often won't move it.",
    undoButton: 'Undo this check-in',

    // The remind row + copyable reminder line (2953-2958).
    remindPrompt: 'Want to check back on a date of your choosing?',
    checkBackAria: 'Check-back date',
    remindLead: 'Your own reminder (copy it to your phone):',
    reminderText: 'Check NextMove case: {date}', // TEMPLATE — also copyReminder's own argument text.
    copyLabel: 'Copy',
    copiedLabel: 'Copied',

    // .case-links (2960-2963, 2895-2897) and the tail (2879-2883, 2964-2967).
    diagnosisLink: 'See my diagnosis',
    prepareLink: 'Continue preparing',
    livesOnlyNote: 'This casefile lives only in this tab until you save it.',
    removePrompt: 'Remove this case and its history?',
    removeYes: 'Yes',
    removeButton: 'Remove this case and its history',
  },
  /** `saveControl` (prototype 2292-2298) — the one save entry point, shared
   *  by Next Move, Prepare (both Task 11) and the casefile screen's own
   *  unsaved-case tail (Task 9, 2966). Built here, ahead of Task 11's own
   *  file-list entry, because the casefile screen's tail already needs it
   *  (design note 8) — Task 11 wires it into the other two call sites and
   *  Home, it does not rebuild it. */
  saveControl: {
    savedNote: 'Saved. Find it on Home whenever you come back',
    save: 'Save this case, and NextMove keeps walking with you',
    saveWithSteps: 'Save this case (your ticked steps come with it)',
  },
  /** The compact Home casefile card (C5, Task 8) — port of `caseCard`
   *  (prototype 3117-3135). `next`/`steps`/`lastUpdate`/`checkBack` are
   *  TEMPLATES; `closedMark` is the mini closed stamp's literal text
   *  (3127). */
  card: {
    savedPrefix: 'Saved {date}', // TEMPLATE
    closedGotIt: 'Closed — got it',
    closedUnresolved: 'Closed — unresolved',
    // Task 5 (D3) — FINALIZED. "Closed" is the right lead word specifically
    // because this codebase's OWN existing usage already means "not
    // active, record kept, can come back" (closedUnresolved cases are
    // already reopenable), not "final" — a set-aside case fits the same
    // category honestly. See task-5-brief.md design note 4.
    closedSuperseded: 'Closed — set aside',
    next: 'Next: {what}', // TEMPLATE — the "→ " prefix is the CSS ::before, not part of this string.
    steps: '{done} of {total} steps done', // TEMPLATE
    lastUpdate: 'last update {ago}', // TEMPLATE
    checkBack: 'check back {date}', // TEMPLATE
    closedMark: 'CLOSED',
  },
  /** The journey log (C5, Task 8) — port of `renderLog` (prototype
   *  2807-2829). `collapsedOne`/`collapsedMany` are two SEPARATE templates
   *  (not one built by string concatenation) so the " – {to}" half only
   *  ever exists in the plural form's own registered copy — see
   *  JourneyLog.tsx's own header note. */
  log: {
    showAll: 'Show all {n} entries', // TEMPLATE
    collapsedOne: 'Checked {n} time, {from} — no change reported', // TEMPLATE
    collapsedMany: 'Checked {n} times, {from} – {to} — no change reported', // TEMPLATE
    whoReported: 'You reported:',
    whoDiagnosed: 'NextMove:',
    whoOther: '—',
    note: 'Your journey record, not an official document.',
  },
  /** DeadEndScreen (C5, Task 10) — port of `renderDeadEnd` (prototype
   *  2971-2985, tag v1-design-lock-2): the screen shown once every
   *  verified step in a service's escalation ladder is exhausted. `lede` is
   *  transcribed whole, word for word — per the task brief, "the most
   *  carefully written copy in the product." This screen offers no next
   *  action, ever: no `*-prepare`/`*-nextmove` link, only "keep it open"
   *  (RESTART) or "close as unresolved" (CLOSE_UNRESOLVED). */
  deadEnd: {
    crumbTail: 'End of the verified ladder',
    headline: "You've used every step this playbook can verify.",
    lede:
      "That's a hard place to be, and NextMove won't pretend otherwise. There is no further official rung in the "
      + 'verified sources, and inventing one would be worse than saying so. What you\'ve built still matters: every '
      + 'filing, number, and date in your journey record is exactly what any lawyer, RTI request, or public '
      + 'representative would ask for first.',
    keepOpen: 'Keep the case open',
    closeUnresolved: 'Close it as unresolved',
  },
  /** CaseClosedScreen (C5, Task 10) — port of `renderCaseClosed` (prototype
   *  2986-3000, tag v1-design-lock-2): "the single calm celebratory beat"
   *  the spec allows, shown only on outcome `deliverable_received`.
   *
   *  `ledeLead`/`ledeSavedClause` are TWO SEPARATE strings, not one full
   *  sentence split at render time (design note 2 of the task brief; Open
   *  Question 3, RESOLVED; Finding 13). The prototype's full lede ends
   *  "...NextMove's part is done; the casefile and its journey stay under
   *  "Closed" on Home if you ever need the record." That closing clause is
   *  true for a SAVED case, but affirmatively FALSE for a working (unsaved)
   *  one — an unsaved case is never in `savedCases`, and RESTART drops it,
   *  so nothing stays under "Closed" on Home. `ledeSavedClause` therefore
   *  renders (in CaseClosedScreen.tsx) ONLY when the case is not `unsaved`
   *  — a SUBTRACTION, not a rewrite: no replacement clause is authored for
   *  the working-case branch, and the working case is never auto-saved to
   *  make the sentence true (that would create a casefile the citizen
   *  never asked for, contradicting the casefile screen's own
   *  informed-consent warning). */
  caseClosed: {
    crumb: 'Case closed',
    headlineLead: 'You',
    headlineMark: 'got it',
    ledeLead:
      "The thing you were waiting for is in your hands. That's the whole point of all of this: the diagnosis, the "
      + "letters, the waiting. NextMove's part is done",
    ledeSavedClause: '; the casefile and its journey stay under "Closed" on Home if you ever need the record.',
    backToHome: 'Back to Home',
  },
  /** SaveDoneScreen (C5, Task 10) — port of `renderSaveDone` (prototype
   *  3887-3899, tag v1-design-lock-2): the confirmation shown right after a
   *  case is saved.
   *
   *  `lede` is ONLY the prototype's first sentence (design note 3 of the
   *  task brief; Open Question 1, RESOLVED, option (b)) — the second
   *  sentence ("Nothing else happens with your
   *  ${S.user && S.user.method==='phone' ? 'number' : 'account'}.") is a
   *  deliberate SUBTRACTION, not an oversight: C5 is device-local, has no
   *  accounts at all, and keeping that sentence would tell a reader they DO
   *  have an account. C7 (real auth) restores it with its original ternary
   *  — both branches recorded here so it is re-derived, not re-authored:
   *    - phone sign-in: "Nothing else happens with your number."
   *    - any other sign-in: "Nothing else happens with your account." */
  saveDone: {
    crumb: 'Case saved',
    headline: 'Your casefile is saved.',
    lede:
      "It's waiting on the Home screen whenever you come back: your answers, your diagnosis, and any steps "
      + "you've already ticked off.",
    backToCase: 'Back to my case',
    goHome: 'Go to Home',
  },
  /** `fmtDay`/`fmtRemind`/`daysAgo`'s (src/ui/dates.ts) own chrome —
   *  `daysAgo`'s three branches (prototype 2739). `daysAgo` renders, at
   *  runtime, a real day-count ("3 days ago"); the registered TEMPLATE
   *  carries no digit, so the numeric content-safety scan (numericFindings)
   *  never sees one to flag — this is arithmetic over the citizen's own
   *  journey log, not a claim about a government process, the same
   *  reasoning ui:trust.verifiedOn's own comment gives. No sources/
   *  manifest.json allowlist entry is needed or wanted here. */
  time: {
    today: 'today',
    yesterday: 'yesterday',
    daysAgo: '{n} days ago', // TEMPLATE
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
  /** C6's freshness landing (prototype `renderSirReverifying`, 3505-3523) —
   *  the SAME coverage-boundary visual language as `unsupported` above (a
   *  temporal boundary instead of a geographic one, per the prototype's own
   *  comment at that function), with its own distinct copy: `unsupported`
   *  never reaches this state at all (an unsupported state routes there
   *  regardless of freshness), and `reverifying`'s handoff note carries no
   *  state-name interpolation (`unsupported`'s does, since it's explaining
   *  what ISN'T covered for that specific state; this screen is explaining
   *  a temporary pause on a state NextMove already covers). `headline` and
   *  `lede` are TEMPLATEs (interpolate the state's name, and the lede also
   *  the changed document's date) — never rendered verbatim, see
   *  CAPTION_TEMPLATES in screenCopy.test.tsx. */
  reverifying: {
    headline: 'SIR guidance for {state} is being re-verified.', // TEMPLATE
    lede:
      "An official source behind {state}'s SIR guidance changed on {date}. A human is re-checking every affected rule against it. Until that's done, NextMove pauses its case-specific advice here. Showing you guidance it can't currently back would be worse than a short wait.", // TEMPLATE
    whereToCheck: 'Where to check meanwhile',
    portalLabel: "Voters' Service Portal — voters.eci.gov.in",
    helpline: 'Toll-free Voter Helpline: 1950',
    handoffNote: 'An official ECI channel, always current and straight from the source.',
    /** {date} interpolates SOURCES_VERIFIED — the static human-captured
     *  date, NOT the lede's changedOn date above; these are deliberately
     *  two different dates answering two different questions ("when did a
     *  source change" vs "when was this guidance last human-verified").
     *  DEVIATION (D8): the prototype's second sentence — "Re-verification
     *  usually completes within a day." — is SUBTRACTED. It is an unsourced
     *  day-count claim about NextMove's own re-verification turnaround, not
     *  a government process; there is no manifest entry backing it (nor
     *  could there be — no source document states how long a human
     *  re-verification takes), and the content-safety scan correctly
     *  flags it (numericFindings' catch-all, no allowlist path exists for
     *  this shape by design). Rather than carve out a guardrail exemption
     *  for an unsourced claim, this drops the clause — "never invent copy"
     *  forbids authoring an unbacked timeline, not omitting one; same
     *  reasoning already applied to SaveDoneScreen's OQ1 sentence. Made
     *  unilaterally by the implementing session, then explicitly confirmed
     *  with the repo owner (2026-09-07, C6 whole-branch final review) —
     *  "keep it dropped," no replacement text. */
    verifiedNote: 'Guidance here was last human-verified on {date}.', // TEMPLATE
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
