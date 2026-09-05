# Source verification notes — 2026-09-05

Findings from re-fetching and re-verifying every cited source (grill-synthesis sources chunk).
Read alongside `manifest.json` (rule-by-rule citations) and
`Downloads/Final Case study/GRILL_SYNTHESIS_2026-09-05.md`.

## 1. Delhi SIR calendar — two official documents conflict; the FAQ wins

Two documents from the same authority give different calendars:

| Milestone | ECI revised-schedule order (15 Jul 2026) | CEO Delhi FAQ Q4 | What actually happened |
|---|---|---|---|
| House-to-house enumeration | 30.06 – 08.08 | 30.06 – 17.08 | — |
| Draft publication | 17.08 | 31.08 | **Published 31 Aug** (news-corroborated) |
| Claims & objections filing | 17.08 – 16.09 | 31.08 – **30.09** | News: claims by **30 Sep** |
| Notice phase / disposal | 17.08 – 15.10 | 31.08 – 29.10 | — |
| Final publication | 19.10 | **04.11** | — |

The draft roll demonstrably published on 31 Aug, matching the FAQ, so the 15-July order was
itself superseded by a later re-revision. **The FAQ's calendar is operative; the order PDF is
kept as provenance only and must never be cited for dates.** The prototype's dates were
faithfully sourced from the FAQ — the earlier "did the fork invent dates?" concern is closed.

## 2. P0 copy error found: filing window vs. disposal window

The FAQ distinguishes the citizens' **claims & objections filing window (ends 30 Sep 2026)**
from the ERO's **notice/disposal phase (ends 29 Oct 2026)**. The prototype conflates them:
every "file Form 6 … through 29 Oct" instruction (s-roll-absent, s-roll-unchecked, their PREP
steps, and the SIR phase note) points users at a date **one month after their actual filing
deadline**. A user trusting our copy could miss the window entirely.

**Fix (fix-pass, P0):** everything the citizen must *file* cites 30 Sep; 29 Oct may appear only
as "the ERO disposes of claims by"; s-notice's "submit before 29 Oct" instruction is dropped
per grill A11 (no elector-facing response deadline is stated in any source — respond per the
notice itself).

## 3. S-6 (duplicate registration): the source itself is phase-stale

FAQ Q22's advice ("submit the Enumeration Form in the constituency where you currently
reside") is verbatim-sourced **and impossible to follow** — enumeration ended 17 Aug per the
same FAQ's Q4. The rule retires to `sirDormantRules_enumeration` (grill A1). Lesson recorded:
phase-gating applies ON TOP of sources, because official documents go stale without being
republished or amended.

## 4. Closed research questions (PRD §23)

- **(a) S-6 enumeration-form tension** — resolved by retirement (above), not by re-verification.
- **(b) First voter-appeal deadline** — Final-ER-FAQ Q34 states the two-tier appeal route with
  **no deadline for the first appeal**. The rule's "no deadline in verified sources" phrasing is
  confirmed correct. (The dormant SIR S-5 15-day window at FAQ_SIR2026 Q32 is a different,
  SIR-specific appeal and stays as-is.)

## 5. Everything else verified clean

- Citizen's Charter: "Up to 30 working days (Police Verification (PV) period excluded)" —
  state-1's PV-exclusion claim, verbatim. Grievance Redressal section supports 5a/5b channels.
- Grievance page: "within a reasonable period of time" DPG passage verbatim; no numeric
  deadline anywhere — the dpg rule's verified-absence claim holds.
- Passport FAQ Q20 (adverse report): archived via Wayback (live portal migrated to the /psp/
  shell ~Jul 2026 and hides the FAQ route); state-4's whatToDo is a faithful paraphrase.
- Final-ER-FAQ Q21/Q23/Q25/Q34: v-1 … v-5 all check out, including Q25's post-and-SMS
  notification (v-1 expectNext) and Q34's two-tier appeal (v-3/v-5).

## Process rule going forward

No rule ships citing a document that is not committed under `sources/` with a manifest entry.
The manifest-resolution test (grill A2) enforces this mechanically once the build starts.
