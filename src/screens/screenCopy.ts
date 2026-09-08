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
  /** Account popover (C7, Task 10) — port of `acctPopover()` (design/
   *  nextmove-v1-prototype.html, 2246-2271, tag v1-design-lock-2), the
   *  chip-triggered menu Topbar shows once a citizen is signed in.
   *  `casefilesOne`/`casefilesMany` are TWO SEPARATE templates, never one
   *  string built by concatenating a plural `s` — the same
   *  `home.casefilesOne`/`casefilesMany` and `casefile.journeyOne`/
   *  `journeyMany` precedent this file already sets. `signOutConfirm.prompt`
   *  transcribes the PROTOTYPE's period-ended sentence (2257) — a
   *  deliberate deviation (D11) from the spec's em-dash variant.
   *  `signOutConfirm.yes` reuses the same literal text as `signOut` (both
   *  render "Sign out" in the prototype's own source — the row button and
   *  the confirm panel's "yes" button), kept as its own key because the
   *  confirm panel is its own distinct piece of UI, the same reasoning
   *  `topbar.restartConfirm` above already applies to its own `yes`/
   *  `cancel` pair. Rendered starting Task 15 — not yet mounted anywhere,
   *  so this subtree is expected to show up red in the coverage sweep
   *  until then (task-10-brief.md design note 9 / the GREEN note). */
  account: {
    ariaLabel: 'Account',
    casefilesOne: 'Your casefile · {n} open', // TEMPLATE
    casefilesMany: 'Your casefiles · {n} open', // TEMPLATE
    casefilesSub: 'On the Home screen, where they live',
    addName: 'Add your name',
    addNameSub: "Optional; it's how your casefile greets you",
    signOut: 'Sign out',
    signOutConfirm: {
      prompt: 'Sign out? Your cases stay on your account. Sign back in any time.',
      yes: 'Sign out',
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
    /** The "You wrote" row's fact-list line (C8 Task 16, FR-AI-04;
     *  transcribed verbatim from design/nextmove-v1-prototype.html:2371 —
     *  "Details kept from it:"). Task 10's own copy sweep never touched
     *  `UI.trust` (it registered `UI.describe/interp/unplaceable/facts`
     *  plus three `UI.prepare` entries only), so this is a real
     *  prototype-sourced string simply not yet registered, not a new
     *  citizen-facing string this task is inventing. `UI.interp.youWrote`
     *  (already registered) supplies the row's own "You wrote" label — see
     *  `TrustDisclosure.tsx`, which reuses it rather than duplicating it
     *  here as `ui:trust.youWrote`. */
    detailsKeptFrom: 'Details kept from it:',
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
    /** The third `bracketHintText` branch (C8, Task 10; prototype
     *  `bracketHintText`, 3714-3719) — reached once every [bracket] is
     *  filled but at least one fill came from the citizen's own describe-it
     *  text and has not yet been acknowledged (`fills>0 && !fillsReviewed`,
     *  **3718**). `hintReady` below stays registered unchanged but becomes
     *  the prototype's THIRD branch, not its second, once Task 15 (which
     *  owns the ordering, docs/superpowers/plans/2026-09-08-c8-describe-it.md
     *  Task 10 design note 9) wires `bracketHintText`'s three-way branch
     *  into `PrepareScreen`. `fillListKey` (**3780**, D8: the prototype's
     *  semicolon, not FR-AI-04's em-dash paraphrase) and `fillReviewLabel`
     *  (**3785**, the `.fill-review` control's own text) are the fill-list
     *  block's other two strings. None of the three is mounted anywhere yet
     *  — Task 15 wires them in, and `hintFilledUnreviewed` is registered in
     *  `INTERACTION_GATED` (a real interaction test arrives with Task 15)
     *  since reaching it needs a draft whose blanks are fully fact-filled,
     *  a shape no shipped PREP plan currently produces unassisted. */
    hintFilledUnreviewed: 'All blanks filled. Check the details filled from your text below.',
    fillListKey: 'Filled from your text; please check them', // D8 — the prototype's semicolon, not FR-AI-04's em-dash paraphrase.
    fillReviewLabel: "I've checked these details",
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
  /** The four-screen save/sign-in flow (C7, Task 10) — ports of
   *  `renderSaveCase` (3823-3845), `renderSaveOtp` (3846-3865) and
   *  `renderSaveName` (3870-3886), design/nextmove-v1-prototype.html, tag
   *  v1-design-lock-2. Registered here, ahead of Tasks 11-15 building the
   *  four screens themselves (task-10-brief.md design note 1), so the
   *  screens are assembled from already-registered, already-safety-swept
   *  copy rather than inline literals moved into place later. None of
   *  these three subtrees is mounted anywhere yet — the coverage sweep is
   *  expected to go red for all of them until their screens exist (design
   *  note 9 / the GREEN note).
   *
   *  `trust` (3831) is registered as ONE whole string, not split into
   *  sentence fragments — it is the load-bearing promise of this entire
   *  chunk ("your details are used for exactly one thing"), and splitting
   *  it would let one clause be edited out of the guardrail scan's sight.
   *  See screenCopy.test.tsx's dedicated assertion on this entry. */
  saveCase: {
    crumb: 'Save your case',
    headline: 'Keep this case. NextMove walks with you.',
    lede: 'Sign in once and this becomes a living casefile: add updates as things happen, watch your journey build, and always know your next move, whenever you come back.',
    trust: 'Your details are used for exactly one thing: bringing your case back to you, including anything you typed about your case. No marketing, nothing else. Remove deletes a case for good; Sign out just signs you out, and your cases stay on your account. And the diagnosis you just got never required signing in. This is only for keeping it.',
    google: 'Continue with Google',
    divider: 'or',
    fieldLabelMobile: 'Mobile number',
    fieldLabelEmail: 'Email address',
    placeholderMobile: '10-digit mobile number',
    placeholderEmail: 'you@example.com',
    send: 'Send me a code',
    switchToEmail: 'Use email instead',
    switchToMobile: 'Use mobile number instead',
    authNote: 'Signing in never changes your diagnosis, and NextMove still never acts on your behalf.',
    // The inline validation errors (2108, 2111) — straight apostrophes in
    // the source ("doesn't"), transcribed exactly, not curled.
    errors: {
      mobile: 'That doesn\'t look like a full mobile number yet.',
      email: 'That doesn\'t look like a complete email address yet.',
    },
  },
  /** `renderSaveOtp` (3846-3865). `crumbTail` is the SECOND crumb segment
   *  only — the first segment reuses `saveCase.crumb` ("Save your case"),
   *  the same two-part-array convention `DeadEndScreen.tsx` already uses
   *  for its own `[c.serviceLabel, UI.deadEnd.crumbTail]`. `lede` is a
   *  TEMPLATE (interpolates the masked destination for `{dest}`).
   *
   *  `resendWaitMany`/`resendWaitOne` (D2) are FINALIZED — a Fable
   *  consultation the repo owner explicitly requested (Open Question 2,
   *  resolved 2026-09-07) REPLACED the draft single `resendWait: 'You can
   *  ask for another code in {n}s'`: (a) the resend control already has a
   *  verb ("Send again"), so the cooldown state is that SAME control,
   *  disabled, keeping that verb rather than inventing "ask for" plus
   *  permission-granting filler this codebase's voice never uses elsewhere;
   *  (b) a raw `{n}s` abbreviation has no precedent — `time.daysAgo` spells
   *  its unit out and dodges the singular by splitting into two entries
   *  rather than concatenating a plural `s`, the same mechanism used here.
   *  `resendWaitOne` is spelled out ("one second"), not "1 second", keeping
   *  it digit-free like its sibling so the numeric content-safety scan sees
   *  no number to flag in EITHER form. The shown value is
   *  `Math.ceil(msRemaining / 1000)`, which is what makes 'Send again in 0
   *  seconds' unreachable and pins `n >= 1` for the whole disabled-state
   *  window (see task-10-brief.md design note 5 for the full reasoning).
   *
   *  No `demo-hint` entry (D1, design note 4) — the prototype's "Design
   *  prototype: any 6 digits work here." is prototype-only scaffold copy,
   *  never rendered by the real app; registering it would put an unrendered
   *  string into the coverage sweep. screenCopy.test.tsx asserts it appears
   *  nowhere under src/. */
  saveOtp: {
    crumbTail: 'One-time code',
    headline: 'Enter the code we sent.',
    lede: 'A 6-digit code is on its way to {dest}.', // TEMPLATE
    fieldLabel: '6-digit code',
    placeholder: '••••••',
    verify: 'Verify and save my case',
    resendPrompt: "Didn't get it? Send again",
    resendSent: 'Code sent again ✓',
    resendWaitMany: 'Send again in {n} seconds', // TEMPLATE — FINALIZED, see header note above.
    resendWaitOne: 'Send again in one second', // FINALIZED, see header note above; NOT a template (no placeholder) — same one-literal-alongside-a-template shape as time.today/time.yesterday alongside time.daysAgo.
    // The code-length error (2121).
    errors: {
      code: 'The code is 6 digits.',
    },
  },
  /** `renderSaveName` (3870-3886) — the one optional, skippable name ask,
   *  reached either mid-save (`midSave = !!S.pendingSave`, true) or
   *  standalone from the account popover's "Add your name" row (false).
   *  THREE places branch on `midSave`: the crumbs, a trailing clause on the
   *  lede, and both buttons — six distinct strings below
   *  (`ledeClauseMidSave`/`ledeClauseStandalone`, `saveMidSave`/
   *  `saveStandalone`, `switchMidSave`/`switchStandalone`), never collapsed
   *  into one pair (task-10-brief.md design note 6 — "the detail most
   *  likely to be missed"). `crumbTailMidSave` reuses `saveCase.crumb` as
   *  its array's first segment at the call site (same convention as
   *  `saveOtp.crumbTail` above); `crumbStandalone` is the WHOLE single-part
   *  crumb array on its own (the standalone entry has no shared first
   *  segment). `ledeStem` is the shared lede sentence; the render joins it
   *  to whichever lede clause applies with a single space, inside the same
   *  `.lede` text node — the prototype builds one string (3877), the same
   *  join discipline `saveDone.ledeTailPhone`/`ledeTailOther` below need. */
  saveName: {
    crumbTailMidSave: 'One last thing, optional',
    crumbStandalone: 'Your name (optional)',
    headline: 'What should we call you?',
    ledeStem: "Just a first name is fine; it's how your casefile greets you when you come back.",
    ledeClauseMidSave: 'Skip it and nothing changes about your case.',
    ledeClauseStandalone: 'It changes nothing about your cases.',
    fieldLabel: 'Your name',
    placeholder: 'First name',
    saveMidSave: 'Save my case',
    saveStandalone: 'Save name',
    switchMidSave: 'Skip and save without a name',
    switchStandalone: 'Never mind',
  },
  /** SaveDoneScreen (C5, Task 10; C7 Task 10 adds `ledeTailPhone`/
   *  `ledeTailOther`; C7 Task 14 wires them in) — port of `renderSaveDone`
   *  (prototype 3887-3899, tag v1-design-lock-2): the confirmation shown
   *  right after a case is saved.
   *
   *  `lede` is ONLY the prototype's first sentence (design note 3 of C5's
   *  own task-10 brief; Open Question 1, RESOLVED, option (b)) — the
   *  second sentence was a deliberate SUBTRACTION there: C5 was
   *  device-local, had no accounts at all, and keeping that sentence would
   *  have told a reader they DID have an account.
   *
   *  `ledeTailPhone`/`ledeTailOther` are TWO complete entries, a ternary
   *  choosing between two full sentences rather than one template with a
   *  slot, exactly how the prototype writes it (3894). Task 14 (C7)
   *  discharges the debt C5 recorded against it: `SaveDoneScreen.tsx` joins
   *  whichever branch applies onto `lede` with a single space, in the SAME
   *  `.lede` text node — never a separate `<span>` or `<br>`. It renders
   *  `ledeTailPhone` when the signed-in user's method is `'phone'`,
   *  `ledeTailOther` for Google or email, and — deliberately diverging from
   *  the prototype's own ternary, which falls through to 'account' with no
   *  user — renders NEITHER sentence when there is no user at all, since
   *  that would be exactly the misleading claim C5 subtracted the sentence
   *  to avoid. See `SaveDoneScreen.tsx`'s own header comment for the full
   *  restoration note. */
  saveDone: {
    crumb: 'Case saved',
    headline: 'Your casefile is saved.',
    lede:
      "It's waiting on the Home screen whenever you come back: your answers, your diagnosis, and any steps "
      + "you've already ticked off.",
    ledeTailPhone: 'Nothing else happens with your number.',
    ledeTailOther: 'Nothing else happens with your account.',
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
  /** "Describe it instead" — the entry row + box under a question screen's
   *  answer list (C8, Task 10; port of `describeBlock`, design/nextmove-v1-
   *  prototype.html 3003-3024, tag v1-design-lock-2 — see
   *  docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10). Rendered
   *  starting Task 11 (`DescribeBlock`) — not yet mounted anywhere, so this
   *  subtree is expected to show up red in the coverage sweep until then
   *  (task-10-brief.md design note 10 / the GREEN note).
   *
   *  `rowLead`/`rowStrong` are TWO entries, not one string with an embedded
   *  `<b>` (**3009**) — the bold half is markup `DescribeBlock` composes, and
   *  a single string carrying a literal tag would either be dangerously set
   *  as HTML or render the tag as text. `rowLead` keeps its trailing space
   *  (the prototype's own `"Not sure which fits? "` runs directly into the
   *  `<b>` with no space added at the join).
   *
   *  `DESCRIBE_MAX` (600) is NOT registered here — it is a constant, not
   *  copy (design note 3): the counter it drives (`${length} / ${DESCRIBE_MAX}`,
   *  **3015**) is a computed string with no authored words, and registering
   *  it would put a bare number into the content-safety scan for nothing.
   *  `domain/interpret.ts` owns the constant; `DescribeBlock` composes the
   *  display (Task 11).
   *
   *  `err`/`reading` are registered but NOT reachable by a static mount —
   *  `err` needs a submit-with-empty-text interaction and `reading` needs an
   *  in-flight interpretation — so both are declared in `INTERACTION_GATED`
   *  (Task 11 supplies the covering interaction test). `read` (the button's
   *  OTHER state, **3020**) is reachable at first render and is not gated. */
  describe: {
    rowLead: 'Not sure which fits? ',
    rowStrong: 'Describe it instead.',
    ariaLabel: 'Describe your situation',
    placeholder: 'e.g. Police came to my house in June, I called the office twice since, nothing has moved',
    langNote: 'English works best here; the real product will understand Hindi and Hinglish too.',
    err: 'Write a line or two first. Even rough words are fine.',
    read: 'Read my situation',
    reading: 'Reading…',
    /** `EX_STORIES` (**2388-2409**) — D5's whole problem (design note 4).
     *  Eight citizen-facing example strings across six entry screens,
     *  registered as a KEYED OBJECT per screen, never an array (design note
     *  4a — `CopyTree` is `{ [key: string]: string | CopyTree }`, which has
     *  no array arm; an array here is a compile error, not a style choice).
     *  Keys are ordinal (`one`, `two`), not the citizen-visible label —
     *  `DescribeBlock` renders `Object.values(...)` in declaration order.
     *  The screen-id keys match `domain/interpret.ts`'s own
     *  `DescribeEntryScreenId` union exactly.
     *
     *  `examples['passport-q1'].one` contains "12 March 2026", which trips
     *  `numericFindings`' `DATE_RE` — the one and only D5 exemption case
     *  (`NUMERIC_EXEMPTIONS` below in `src/playbooks/guardrails/
     *  contentSafety.ts`). The other seven trip nothing (verified at plan
     *  time and re-verified here): none of the two file/EPIC/reference
     *  numbers (`BN1068334517807`, `123456789012`, `ABC1234567`) nor "in
     *  June"/"last month" match `DATE_RE`, `INTERVAL_RE`, or any
     *  `CATCH_ALL_PATTERNS` entry. */
    examples: {
      'passport-q1': {
        one: 'Police came to my house in June but nothing moved since. I called the PSK twice. File no BN1068334517807, applied 12 March 2026',
        two: 'My agent said he will handle everything but his phone is switched off now',
      },
      'passport-q2': {
        one: 'I called the regional office twice last month and visited once',
        two: 'Someone from the passport office called me yesterday about my file',
      },
      'voter-entry': {
        one: "I applied for address correction in May, it got rejected by SMS, I haven't appealed yet. Ref 123456789012",
      },
      'voter-q1': {
        one: "I haven't heard anything since I applied",
      },
      'voter-q2': {
        one: 'I filed an appeal at the DM office and got no response so far',
      },
      'sir-q1': {
        one: "I checked the draft roll and my name isn't there. My EPIC is ABC1234567",
      },
    },
  },
  /** "Here's how we read it" — the interpretation confirm screen (C8, Task
   *  10; port of `renderInterpConfirm`'s mapped-cards path, prototype
   *  3037-3105, tag v1-design-lock-2 — docs/superpowers/plans/2026-09-08-c8-
   *  describe-it.md, Task 10). Rendered starting Task 12
   *  (`InterpConfirmScreen`) — not yet mounted anywhere, so this subtree is
   *  expected to show up red in the coverage sweep until then (design note
   *  10 / the GREEN note). `youWrote`, `discardNote` and `simulatorNote`
   *  below are ALSO rendered by `UnplaceablePanel` (Task 14, prototype
   *  3053-3054, 3063) — registered once, here, and reused from both sites,
   *  the same discipline `UI.facts.aadhaarRefused` below follows.
   *
   *  `spanPrefix` ('you wrote: ', with its trailing space) is Task 9's own
   *  deferred entry (design note 6 there): originally `.span-quote::before
   *  {content:"you wrote: "}` in `index.css` was real citizen-facing text
   *  living in CSS, invisible to this file's own copy sweep, and
   *  `src/ui/tokens.test.ts` asserted the two were byte-identical — that
   *  test was deliberately left red at the end of Task 9 for Task 12 to
   *  close, which it did. UPDATED (Task 12 fix round 1, finding F2): that
   *  `::before` rule is now GONE — pairing CSS generated content with a
   *  `.vh`-hidden duplicate span (design note 10's belt-and-braces choice)
   *  caused a real screen-reader double announcement, since engines DO
   *  expose `::before` content to the accessibility tree. `spanPrefix` is
   *  now rendered by `InterpConfirmScreen.tsx` as a real, visible span
   *  (`.span-quote-prefix` in `index.css`) — the ONE remaining source of
   *  this string, nothing left to keep byte-identical with.
   *
   *  `framingParagraph` (**3094**) is D8: the prototype's semicolon
   *  ("...next; the verified playbook does that.") is transcribed, NOT the
   *  spec's/PRD's em-dash paraphrase.
   *
   *  `discardNote` (**3043**) is a TEMPLATE — it interpolates the first
   *  discarded question's own label, LOWERCASED, for `{question}`; only the
   *  first discarded item is ever named (design note 9), never a list.
   *
   *  `qLabel` (design note 5) is the SIX `DESCRIBE_CTX` question display
   *  labels (prototype 1753-1772), transcribed verbatim and registered here
   *  rather than reusing an existing, similarly-worded screen headline.
   *  THREE of the six differ from the shipped headline by a word or a
   *  contraction — `q2` ("...follow up?" vs. `PASSPORT_COPY.q2.headline`'s
   *  "...follow up on this?"), `voterQ1` ("What is..." vs.
   *  `VOTER_COPY.q1.headline`'s "What's..."), `sirQ1` ("What is..." vs.
   *  `SIR_COPY.q1.headline`'s "What's...") — and are pinned apart by
   *  `screenCopy.test.tsx`'s own negative rows so a future edit to a screen
   *  headline can never silently change what a confirm card shows. The
   *  other two (`q1`, `voterAppealedRaw`) are byte-identical to an existing
   *  headline today and are STILL registered separately: they are different
   *  strings serving different surfaces (a screen's own `<h1>` vs. a compact
   *  card label on a summary screen) that merely coincide today. */
  interp: {
    crumbTail: 'How we read it',
    headline: "Here's how we read it.",
    framingParagraph: "AI matched your words to NextMove's fixed categories. It cannot change what happens next; the verified playbook does that. Please check the matches below.",
    youWrote: 'You wrote',
    discardNote: 'We also read something about "{question}" but set it aside; it only applies on a different path.', // TEMPLATE
    change: 'Change',
    useTheseAnswers: 'Use these answers',
    answerMyself: "I'll answer the questions myself instead",
    simulatorNote: 'Here, only a few example phrasings are understood. The real build uses an AI model, which will sometimes get things wrong. That is why this check step exists.',
    spanPrefix: 'you wrote: ',
    qLabel: {
      q1: "What's happening with your application?",
      q2: 'Have you already tried to follow up?',
      voterEntry: 'What is this about?',
      voterQ1: 'What is the situation with your application?',
      voterAppealedRaw: 'Have you already appealed this decision?',
      sirQ1: 'What is happening with your SIR situation?',
    },
    /** Task 12's own addition — NOT a prototype string, and the one
     *  deliberate exception to this whole file's "C8 authors NO new
     *  citizen-facing string" rule (docs/superpowers/plans/2026-09-08-c8-
     *  describe-it.md, chunk-level constraint). Spec §7 requires a
     *  post-interpretation live-region announcement (design note 10 of
     *  task-12-brief.md), and the prototype has NO screen-reader
     *  announcement anywhere on this screen to transcribe — Task 10's own
     *  implementer found this same gap, correctly declined to invent the
     *  string without a brief asking for it, and left it here for Task 12
     *  (see task-10-report.md); Task 10's independent reviewer separately
     *  confirmed that was the right call. This is authored HERE, now,
     *  because: (1) it is screen-reader-ONLY chrome, never visible prose —
     *  a `.vh`-classed live region, not a paragraph a sighted citizen reads;
     *  (2) it is the SAME category of a11y addition this exact screen's
     *  design notes already authorize elsewhere (D11's reveal-control
     *  mechanism; design note 10's own focus-move/live-region requirements
     *  generally) — "the prototype has none of this" is the brief's own
     *  phrase for that category; (3) every number in it is COMPUTED at
     *  render time from `state.interp` (mapping/fact/discard counts), never
     *  an authored claim about a government process, so it adds no surface
     *  to the numeric content-safety scan the same way `ui:time.daysAgo`'s
     *  own comment already argues for arithmetic over the citizen's own
     *  session data.
     *
     *  `matchedOne`/`factsOne` are FIXED, digit-free literals (never
     *  templates) for the n===1 case — the same convention
     *  `ui:saveOtp.resendWaitOne` already establishes alongside its own
     *  `resendWaitMany` template sibling: 1 is the only value that branch
     *  ever renders, so spelling it out costs nothing and keeps a bare
     *  digit off the n===1 path entirely. `matchedMany`/`factsMany` are
     *  CAPTION_TEMPLATES (screenCopy.test.tsx) for every other count,
     *  INCLUDING 0 — standard English takes the plural for zero ("0 facts
     *  picked up"), so no separate zero-count variant is needed, matching
     *  `ui:account.casefilesMany`'s own precedent of covering 0 via the
     *  "many" branch. `discardedNote` is a plain semicolon CLAUSE (not a
     *  second sentence, not a count), appended only when
     *  `interp.discarded.length > 0` — spec §7 only asks whether anything
     *  was set aside, and design note 9 already establishes this bucket's
     *  own "never a count of discards, only a fact of one" discipline for
     *  the visible discard note right above; the semicolon join mirrors
     *  `ui:interp.framingParagraph`'s own D8 semicolon, this bucket's
     *  established voice. `InterpConfirmScreen.tsx` (Task 12) composes the
     *  four pieces into one sentence; see its own header note for the exact
     *  join. Design note 11's own verbatim-against-the-prototype check
     *  (screenCopy.test.tsx) carves this whole `summary` subtree out by
     *  name, for exactly this reason — see that test's own comment. */
    summary: {
      matchedOne: 'One reading matched',
      matchedMany: '{matched} readings matched', // TEMPLATE
      factsOne: 'one fact picked up',
      factsMany: '{facts} facts picked up', // TEMPLATE
      discardedNote: '; something you mentioned was set aside since it applies to a different path',
    },
  },
  /** "We couldn't safely place this" — the fail-closed panel (C8, Task 10;
   *  port of `renderInterpConfirm`'s unplaceable branch, prototype 3044-3065,
   *  tag v1-design-lock-2 — docs/superpowers/plans/2026-09-08-c8-describe-it.md,
   *  Task 10). Rendered starting Task 14 (`UnplaceablePanel`) — not yet
   *  mounted anywhere, so this subtree is expected to show up red in the
   *  coverage sweep until then (design note 10 / the GREEN note).
   *
   *  `lede` (**3052**) is registered as ONE indivisible string, not sentence
   *  fragments — it is the paragraph spec §7's "copy never blames the user
   *  for what they wrote" is about, and its FIRST sentence
   *  ("That's not a problem with what you wrote.") does all the work.
   *  Splitting it would let that sentence be edited out of the guardrail
   *  scan's sight without anything catching it — the same treatment C7 gave
   *  the trust paragraph (`UI.saveCase.trust` above), for the same reason. */
  unplaceable: {
    headline: "We couldn't safely place this.",
    lede: "That's not a problem with what you wrote. NextMove only matches words against its verified categories, and it couldn't do that safely here. Rather than guess, pick the closest option yourself.",
  },
  /** "What we picked up" — the fact chips (C8, Task 10; port of
   *  `factChips`, prototype 3025-3036, tag v1-design-lock-2 —
   *  docs/superpowers/plans/2026-09-08-c8-describe-it.md, Task 10). Rendered
   *  starting Task 13 (`FactChips`) — not yet mounted anywhere, so this
   *  subtree is expected to show up red in the coverage sweep until then
   *  (design note 10 / the GREEN note).
   *
   *  `aadhaarRefused` (D8: the prototype's longer sentence, not the spec's/
   *  PRD's shorter paraphrase) is registered ONCE and rendered from BOTH of
   *  the prototype's identical call sites (**3028**, **3035**) — Task 13's
   *  own design note 2 names this file as the source of that discipline.
   *
   *  The four `aria-label` templates (**3031-3032**) are spec §7's "chips
   *  carry distinct accessible names": `editValueAria`/`removeValueAria`
   *  belong to a chip's NORMAL state and are reachable at first render (not
   *  gated); `editLabel`/`saveLabel` belong to a chip's EDIT-MODE state,
   *  reachable only after clicking Edit, so both are ALSO declared in
   *  `INTERACTION_GATED` (Task 13 supplies the covering interaction test).
   *  All four are `CAPTION_TEMPLATES` entries (they interpolate `{label}`/
   *  `{value}`), so none is checked against the literal-string coverage
   *  sweep — see `screenCopy.test.tsx`'s own `CAPTION_SUBSTITUTIONS`. */
  facts: {
    pickedUpKey: 'What we picked up',
    aadhaarRefused: 'A number that looked like an Aadhaar number was left out on purpose. NextMove never keeps Aadhaar numbers, and nothing here ever needs one.',
    unknownNumberNote: "A number NextMove couldn't recognize stays listed here but is never used to fill anything.",
    editValueAria: 'Edit {label} {value}', // TEMPLATE
    removeValueAria: 'Remove {label} {value}', // TEMPLATE
    editLabel: 'Edit {label}', // TEMPLATE — edit-mode input; INTERACTION_GATED (Task 13)
    saveLabel: 'Save {label}', // TEMPLATE — edit-mode save button; INTERACTION_GATED (Task 13)
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
