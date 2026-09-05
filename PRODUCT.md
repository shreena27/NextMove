# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: React + Vite + TypeScript + Tailwind CSS v4. Vitest + React Testing Library for tests. No native app — mobile web is the target, not a wrapped/native build.

## Users

Indian citizens who have already completed their part of a government process — submitted a Passport application, completed the appointment — and are now stuck waiting on an institution (police verification, an electoral authority, etc.) to act next. They don't understand government terminology, don't know whether a delay is normal, and don't know who to contact or how. The moment: "I've already done what I was supposed to do. Why is this still stuck?"

## Product Purpose

NextMove is a resolution assistant that diagnoses where a citizen's stuck government case is waiting, explains it in plain language, and tells them the appropriate verified next action — reducing the burden of the citizen having to act as their own case manager. Promise: "Know what's holding things up. Know what to do next."

## Positioning

Not a generic government chatbot, not a government portal. The mechanism: a verified-playbook-decides / AI-only-helps-execute architecture — the product never invents government rules, timing thresholds, or eligibility. Every recommendation and official channel is sourced from real government publications (for Passport: passportindia.gov.in's Citizen's Charter, Police Verification FAQ, Feedback/Grievance page). NextMove is an independent, unofficial companion tool with no government affiliation.

## Operating Context

Used by a citizen anxious about a real pending government case, most often on their phone, in a moment of frustration or uncertainty — and, once a case is saved, returning over days or weeks as a recurring companion (check-ins, journey log). V1 design covers Passport + Voter Services (SIR as a sub-flow, Delhi-only case-specific coverage); certificate services (Income, Caste, EWS, Domicile) appear only as inert "Coming Soon" rows on the Other-services roadmap screen reached from Home's third menu row, not built.

## Capabilities and Constraints

- Diagnoses case state via two short questions (Q1: current stage, Q2: prior follow-up) plus a recovery path for "I'm not sure."
- Recommends WAIT / FOLLOW UP / ESCALATE / UNCLASSIFIED, each with a verified official channel and a source citation ("Why am I seeing this?").
- Deferred authentication (Google/OTP at the save moment only), per-service casefiles with a journey log, a check-in tracking loop with undo, AI-drafted follow-ups with guided (never automatic) submission, and AI answer interpretation behind code-level gates are all in the V1 design (PRD §§22–29); the sole hard boundary is submission on the citizen's behalf.
- Never invents thresholds, deadlines, or causes for an adverse finding; where official guidance is broad or silent, NextMove stays broad rather than fabricating precision.
- Government terminology is always explained in plain language; "I don't know" is a first-class, always-available answer.

## Brand Commitments

Product name "NextMove" and the promise line "Know what's holding things up. Know what to do next." are confirmed and binding. No visual identity — palette, typography, logo — has been established yet. The current implementation's styling is default/unstyled Tailwind applied during functional implementation, not a design decision; treat it as evidence of what to move away from, not as an incumbent world to preserve.

## Evidence on Hand

Real official-source citations already gathered and wired into the Passport rules engine (`src/playbooks/passportPlaybook.ts`): the Citizen's Charter PDF, the Police Verification FAQ, and the Feedback/Grievance page, all from passportindia.gov.in. No user testimonials, customer quotes, or usage metrics exist yet — none should be fabricated for the design.

## Product Principles

1. Verified workflows decide, AI only helps execute — never invent government process.
2. Diagnose before asking for execution data — minimum questions needed to reach a state.
3. Admit uncertainty rather than force a diagnosis — UNCLASSIFIED is a first-class outcome, not a failure state to hide.
4. Value before account creation — no login gates the core diagnostic value.
5. Accuracy over the appearance of intelligence — when official guidance is broad, the product stays broad.

## Accessibility & Inclusion

WCAG 2.1 AA. Large tap targets and plain language are functional requirements, not polish — users may be under stress and unfamiliar with government terminology.
