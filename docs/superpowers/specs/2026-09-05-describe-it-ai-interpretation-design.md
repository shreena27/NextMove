# Design: "Describe it in your own words" — AI-interpreted answers

**Date:** 2026-09-05 · **Status:** Approved (user), Opus-reviewed (ship-with-changes findings incorporated) · **Scope:** V1 design prototype + production contract

## Purpose

Let a citizen answer NextMove's diagnostic questions by describing their situation in their own words instead of picking from the closed option list — and never make them re-type a detail (File Number/ARN, dates) they already gave, all without weakening the locked guardrail: **verified playbooks decide; AI only helps execute; AI never invents government process rules.**

Positioning: this is not the fast path for a two-question flow. It exists for (a) users who cannot map their situation onto the options, and (b) fact capture — type your ARN once and the prepared letter arrives with it filled. Entry copy frames it that way: "Not sure which fits? Describe it instead."

## Decisions (all user-confirmed)

1. **AI suggests, user confirms.** The AI maps free text onto the *existing* closed option values only; the user confirms or corrects on a dedicated screen; confirmed answers flow through the normal answer-setting path so playbooks run byte-identically. Low confidence / no grounding → an honest "couldn't place it" state, never a guess.
2. **Every question + smart skip (branch-aware).** The describe row appears on every question screen. Text that answers later *reachable* questions maps them too; confirmed questions are never asked again.
3. **Provider: Gemini free tier in production** behind a provider-agnostic contract; **the prototype simulates** interpretation with a labeled deterministic matcher (an artifact page cannot call external APIs; the built-in Claude capability was declined).
4. **Language:** production supports English + Hindi/Hinglish input; option labels remain English (stated in-UI). The prototype simulator is English-only and says so.
5. **"I'm not sure" stays exactly as it is** (locked equal-weight row, its own recovery/UNCLASSIFIED paths). The describe row is a visually distinct row below a subtle divider — a different kind of thing, equal prominence, no funneling.

## Architecture

### 1. Entry (per question screen)

Below the answer list, after a hairline divider: a distinct row — pen icon, "Not sure which fits? **Describe it instead.**" Tapping expands an **inline** textarea on the same screen (options stay visible above; no mode switch). Placeholder shows a realistic example. Behaviors:

- Empty input: button disabled with stated reason. Very short input: hint, not a block.
- Long input: hard cap with a **visible character counter**; never silently truncated.
- The typed text survives Back, failure, and re-entry (and app reload once saved to a casefile).
- Not offered on the pasted-status recovery screen (see "Pasted-status resolution" below).

### 2. Interpretation contract (provider-agnostic)

Request: `{ service, questions: [only questions REACHABLE from currently-known answers, each with its closed option set], text }`.

Response (strict JSON):

```ts
interface Interpretation {
  mappings: { questionId: string; value: string;      // MUST be one of the provided option values
              span: string }[];                        // verbatim quote from the user's text justifying it
  facts:    { kind: 'reference_number'|'date'|'note';
              label: string; value: string;            // value MUST be a verbatim substring of the text
              refType?: string }[];                    // e.g. 'passport_file_no'|'arn'|'epic'|'unknown'
  unplaceable: boolean;
}
```

Hard rules enforced **in code, not just prompt**:

- A mapping whose `value` is not in the offered option set → dropped.
- A mapping whose `span` is not a verbatim substring of the input (whitespace-normalized) → dropped. Span grounding replaces confidence floats as the safety gate; any model confidence field is a hint only.
- A fact whose `value` is not a verbatim substring → dropped. No paraphrase, no reformatting.
- Reference numbers are validated against per-service formats; a number matching no known format becomes a "a number you mentioned" chip that **fills no bracket**.
- Relative/ambiguous dates ("last month", "3/4/25") never auto-fill a bracket.
- "What you already tried" is never a bracket-fill source — context display only.
- **Branch invariant:** after each confirmed mapping, the reachable question set is re-derived; answers for questions that became unreachable are pruned before any playbook evaluation. (Test: voter Q2 mapping must vanish if Q1 ≠ "decision".)
- User text is data, never instruction (prompt-injection AC: injected directives in the text must not alter contract behavior or place content anywhere except grounded facts, which are verbatim-substring-gated anyway).

All failures — timeout, quota exhaustion, malformed JSON, out-of-enum values, model down — **fail closed** to the unplaceable panel with the text preserved and structured options offered. Production: when quota is exhausted the entry row is hidden, not broken; an in-flight loading state shows an honest wait message.

### 3. Confirm screen — "Here's how we read it"

- Header shows the user's full text back ("You wrote: …") — the primary provenance record, on this screen, not only in the later trust disclosure.
- Each mapped answer: the question's context label, the **known option's exact label**, and beneath it the grounding span in the user's own words ("you wrote: *'police came in June'*").
- A question the user **has never seen** renders as its full option list with the AI's pick pre-selected — never a lone confirmed label (no anchoring).
- **No per-item ✓.** Per-item "Change" (reveals that question's options inline, `aria-expanded`, focus managed) + **one bottom action: "Use these answers."** A quiet secondary path: "I'll answer the questions myself instead."
- "What we picked up" — fact chips, each editable and removable; unrecognized numbers labeled honestly.
- Framing copy (Opus-corrected, truthful): *"AI matched your words to NextMove's fixed categories. It cannot change what happens next — the verified playbook does that. Please check the matches below."*
- Editing the original text from here re-runs interpretation (old mappings discarded, stated).
- Unplaceable state: *"We couldn't safely place this."* Text stays visible; structured options offered inline; copy never blames the user for what they wrote (see Distress note).

### 4. Facts → draft, disclosure, casefile

- Confirmed facts auto-fill matching `[brackets]` in the prepare draft. Auto-filled values are **visibly marked** ("from what you wrote"); the blank counter reads both states: "3 blanks · 2 filled from your text — please check them." The draft never reads "ready to send" while an auto-fill is unreviewed.
- Trust disclosure gains "You wrote" (full text) and the facts used.
- Saved casefile persists the text, facts, and interpretation provenance (model id, prompt version, timestamp in production; "simulated" in the prototype) — **and the privacy copy says so truthfully**, with a delete control for text + facts. (Fixes the earlier "not stored beyond the case" contradiction.)

### 5. Prototype simulation (labeled)

- Deterministic per-service phrase table (mappings with spans), reference-number shape detection (per-service formats + unknown), month-year date detection, "called/visited" → informal-follow-up context.
- Example chips per service including, deliberately: one **hard story → unplaceable panel**, and one that produces a **visibly wrong mapping the reviewer must catch and Change** — demonstrating that the confirm step (the feature's actual safeguard) works.
- Label (stronger than the OTP note, because this is the feature's whole risk surface): *"Here, only a few example phrasings are understood. The real build uses an AI model, which will sometimes get things wrong — that is why this check step exists."*

### 6. Pasted-status resolution (documents the P1-5 contradiction)

The passport pasted-status matcher stays exact-match-only. Rationale, now written down: silent fuzzy matching of a *status string* to a *case state* has no confirmation step, so "intelligent matching is not a goal" there stands. The describe flow is a different risk profile — free narrative + span-grounded suggestions + mandatory user confirmation — and is therefore permitted. The describe box is not offered on the paste screen; the matcher's code comment gets a pointer to this section.

### 7. Production launch gates (PRD)

- **Gemini free-tier data-use terms verified before any real user text flows**; budget the no-training/paid tier if terms permit training on submitted content. Compliance gate, not a cost note.
- Input minimization: placeholder names what's useful; unrecognized identifiers are never persisted.
- Eval set: fixed real phrasings per service with expected mappings, run on every prompt/model change. Quality metric: **Change-rate on the confirm screen** per question.
- Accessibility (WCAG 2.1 AA) specifics: textarea expansion announced + focus managed; post-interpretation results use a live region + focus move + non-visual summary; chips carry distinct accessible names ("remove ARN AB1234567"); inline reveals use `aria-expanded`.
- Distress/out-of-scope text (open question, deliberately deferred): unplaceable copy is written to never read as blame; routing distress or corruption reports to channels is out of V1 scope and flagged for a future decision.

## Out of scope

Chat, AI follow-up questions, AI-authored advice or diagnosis text, any AI access to playbook rules, offering the describe box on the pasted-status screen, multi-case merging.

## Error handling summary

Every failure path lands on the unplaceable panel with text preserved. No silent truncation, no silent discard of mappings (discarded ones are shown as discarded when a branch resolution voids them), no auto-fill without review marking.

## Testing (prototype)

Live assertions: branch pruning (voter Q2 vanishes when Q1 changes), enum/span/verbatim gates (simulator obeys same code gates), wrong-mapping chip is correctable and correction flows to diagnosis, unplaceable chip lands on the panel with text preserved, ARN fills the draft bracket marked + counter reflects it, unknown-format number fills nothing, describe row absent on the paste screen, "I'm not sure" behavior unchanged.
