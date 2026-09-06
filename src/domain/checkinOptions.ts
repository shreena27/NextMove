// Check-in OPTION LABELS, KINDS and prepAware flags — the citizen-facing
// half of the prototype's CHECKIN table (design/nextmove-v1-prototype.html
// lines 2508-2616, tag v1-design-lock-2). TRANSCRIBED, not authored.
//
// checkinPatches.ts (C1) already carries the payload half — every option's
// `patch` / `pendingPatch` / `rejectPatch` / `acceptPendingPatch` /
// `rejectDeadend` — keyed the same way, in the same order, and its own
// header comment reserves labels/kinds/prepAware for this file. The two
// tables are hand-maintained SEPARATELY and zipped together at module load
// (see CHECKIN below); they are never merged back into one file, because
// doing so would rewrite a file C1 shipped and tested.
//
// Key resolution is `CHECKIN[d.state] ?? CHECKIN[d.ruleId]`, gated on
// `d.ruleId` being non-null (prototype 2599). The mixed keying is
// deliberate: SIR entries key by user-facing `state` ('S-1'...'S-9'),
// Passport and Voter by rule id ('state-1', 'v-1'). Voter's 'v-4' rule
// carries a CAPITALISED `state` ('V-4') but a lowercase CHECKIN key
// ('v-4') — the fallback to `CHECKIN[d.ruleId]` is what makes that
// resolve, and it only works because JS object keys are case-sensitive.
import type { Diagnosis, Playbook } from './types'
import type { ServiceKey } from './casefile'
import { CHECKIN_PATCHES, type CheckinPatchOption } from './checkinPatches'
import { prepPlanFor } from '../playbooks/prep'

/** Local {at,text}. MUST NOT import CopyString from ../playbooks/guardrails/
 *  — this is domain-data code and guardrails/isolation.test.ts walks it (its
 *  regex does not exempt `import type`). Same pattern as prep.ts's own
 *  CopyLocation, sirPlaybook.ts's, and casefile.ts's. */
export interface CopyLocation { at: string; text: string }

/** The six option "kinds" a per-state CHECKIN_META entry may carry —
 *  verbatim from checkinPatches.ts's own header comment, which reserved
 *  these six for this file. */
export type CheckinKind = 'event' | 'action' | 'resolved-rung' | 'valence' | 'closureq' | 'deadend'

/** The four kinds checkinOptionsFor appends to every list — unconditionally
 *  (nothing/deliverable/else) or gated on prepAware (notdone). Never present
 *  in CHECKIN_META; only checkinOptionsFor produces them. */
export type UniversalKind = 'notdone' | 'nothing' | 'deliverable' | 'else'

/** One resolved option: a CHECKIN_META entry's own `k`/`label`, plus
 *  whatever payload fields CHECKIN_PATCHES carries at the same key/index. */
export interface CheckinOption extends CheckinPatchOption {
  k: CheckinKind | UniversalKind
  label: string
}

/** The label/kind/prepAware half of the prototype's CHECKIN table
 *  (2508-2596), option-for-option, in table order. Zipped with
 *  CHECKIN_PATCHES below via matching key AND index — never merged or
 *  re-transcribed against the payload table. */
export const CHECKIN_META: Record<string, { prepAware?: true; opts: { k: CheckinKind; label: string }[] }> = {
  'state-1': {
    opts: [
      { k: 'event', label: 'Police contacted or visited me' },
      { k: 'event', label: 'Verification seems done, but nothing has moved since' },
      { k: 'event', label: 'The portal shows an adverse or confusing status' },
    ],
  },
  'state-2': {
    opts: [
      { k: 'event', label: 'Verification finished, but nothing has moved since' },
      { k: 'event', label: 'The portal shows an adverse or confusing status' },
      { k: 'action', label: 'I asked the office what was pending (call, visit, or message)' },
    ],
  },
  'state-3': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I followed up with the Passport Office' },
      { k: 'event', label: 'The portal shows an adverse or confusing status' },
    ],
  },
  'state-4': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I contacted the office and asked for clarification' },
    ],
  },
  'state-5a-p': {
    opts: [
      { k: 'resolved-rung', label: 'They responded and things are moving again' },
      { k: 'event', label: 'They responded, but it did not help' },
      { k: 'event', label: 'No response at all so far' },
    ],
  },
  'state-5a-r': {
    opts: [
      { k: 'event', label: 'It stalled again; nothing has moved since' },
    ],
  },
  'state-5b-r': {
    opts: [
      { k: 'event', label: 'It stalled again; nothing has moved since' },
    ],
  },
  'state-dpg-r': {
    opts: [
      { k: 'deadend', label: "It stalled again after the DPG's response" },
    ],
  },
  'state-5a': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I filed the formal grievance on CPGRAMS and have a number' },
    ],
  },
  'state-5b-p': {
    opts: [
      { k: 'resolved-rung', label: 'They responded and things are moving again' },
      { k: 'event', label: 'They responded, but it did not help' },
      { k: 'event', label: 'No response at all so far' },
    ],
  },
  'state-5b': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I escalated to the DPG and have a reference number' },
    ],
  },
  'state-dpg-p': {
    opts: [
      { k: 'resolved-rung', label: 'The DPG responded and things are moving again' },
      { k: 'deadend', label: 'The DPG responded, but it did not resolve anything' },
    ],
  },
  'v-1': {
    opts: [
      { k: 'event', label: 'A BLO visited or contacted me' },
      { k: 'valence', label: 'A decision arrived' },
    ],
  },
  'v-2': {
    opts: [
      { k: 'valence', label: 'A decision arrived' },
    ],
  },
  'v-3': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I filed the first appeal with the DEO/DM' },
      { k: 'closureq', label: 'I checked, and the decision was actually in my favour' },
    ],
  },
  'v-4': {
    opts: [
      { k: 'valence', label: 'The appeal was decided' },
    ],
  },
  'v-5': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I filed the second appeal with the state CEO' },
    ],
  },
  'v-5-p': {
    opts: [
      { k: 'valence', label: 'The second appeal was decided' },
    ],
  },
  'v-acc': {
    opts: [
      { k: 'event', label: "It's been a long time with no sign of it" },
    ],
  },
  'S-1': {
    opts: [
      { k: 'event', label: 'I got a notice asking for documents' },
    ],
  },
  'S-2': {
    opts: [
      { k: 'event', label: 'I checked, and my name IS on the Draft Roll' },
      { k: 'event', label: 'I checked, and my name is NOT on the Draft Roll' },
    ],
  },
  'S-3': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I filed Form 6 with the declaration and a document' },
    ],
  },
  'S-4': {
    prepAware: true,
    opts: [
      { k: 'action', label: 'I submitted the requested document to the BLO/ERO' },
    ],
  },
  // 'S-6' check-in moved to sirDormantRules_enumeration (phase-retired) — not
  // ported, matching CHECKIN_PATCHES's own comment at the same key.
  'S-9': {
    opts: [
      { k: 'event', label: 'I checked, and my name IS on the Final Roll' },
      { k: 'event', label: 'I checked, and my name is NOT on the Final Roll' },
    ],
  },
}

/** One resolved check-in config: CHECKIN_META's own `prepAware`/`opts[].k`/
 *  `opts[].label`, zipped index-for-index with CHECKIN_PATCHES's payload at
 *  the same key. Built once at module load. */
export interface CheckinConfig {
  prepAware?: true
  opts: CheckinOption[]
}

function zipCheckin(): Record<string, CheckinConfig> {
  const out: Record<string, CheckinConfig> = {}
  for (const [key, meta] of Object.entries(CHECKIN_META)) {
    const patches = CHECKIN_PATCHES[key]
    if (!patches || patches.length !== meta.opts.length) {
      throw new Error(
        `checkinOptions: CHECKIN_META['${key}'] (${meta.opts.length} opts) and ` +
        `CHECKIN_PATCHES['${key}'] (${patches?.length ?? 'missing'} opts) are out of sync.`,
      )
    }
    out[key] = {
      ...(meta.prepAware ? { prepAware: meta.prepAware } : {}),
      opts: meta.opts.map((o, i) => ({ ...o, ...patches[i] })),
    }
  }
  return out
}

/** The zipped table — reconstructs what the prototype's own single CHECKIN
 *  object carried, from the two hand-maintained halves (CHECKIN_META here,
 *  CHECKIN_PATCHES in C1's checkinPatches.ts). Never authored directly. */
export const CHECKIN: Record<string, CheckinConfig> = zipCheckin()

/** 2500 — the "I got it" option's label, per service. Also doubles as
 *  UNIVERSAL_LABELS.deliverable below. */
export const DELIVERABLE_LABEL: Record<ServiceKey, string> = {
  passport: 'I got my passport!',
  voter: 'My name is on the roll / my card arrived!',
  sir: 'My name is on the roll. Sorted!',
}

/** 2501 — the closure question asked after a resolved-rung/closureq option
 *  before the case can close as deliverable_received. */
export const DELIVERABLE_Q: Record<ServiceKey, string> = {
  passport: 'Did you get your passport?',
  voter: 'Is your name / card actually in place now?',
  sir: 'Is your name on the roll now?',
}

/** 3116 — the closed-card headline used once a case's outcome is
 *  'deliverable_received', so a closed card headlines the deliverable
 *  rather than the stale diagnosis. */
export const CLOSED_TITLE: Record<ServiceKey, string> = {
  passport: 'Passport received',
  voter: 'On the roll / card arrived',
  sir: 'Name on the roll',
}

/** The four universal option labels every check-in list carries. Domain
 *  data, NOT screenCopy.ts chrome (plan-review ruling, Open Question 8 /
 *  Finding 3): they are rows in the same option list as the per-state
 *  labels, appended to the same array, and one of them (deliverable) is
 *  already per-service data. `nothing`/`else`/`notDone` are fixed literals;
 *  `deliverable` is resolved per-service from DELIVERABLE_LABEL. Reaches the
 *  guardrail scan through checkinCopyExtras, never through SCREEN_COPY.ui —
 *  routing it there would be the codebase's first `domain/ -> screens/`
 *  import. */
export const UNIVERSAL_LABELS = {
  nothing: 'Nothing yet',
  deliverable: DELIVERABLE_LABEL,
  else: 'Something else happened',
  notDone: "I haven't done this yet; take me back to the steps",
} as const

/** Builds one diagnosis's check-in option list, in prototype order
 *  (2597-2616):
 *    1. 'notdone' — only when the resolved config has prepAware, the
 *       diagnosis has a prep plan, and no step is checked yet.
 *    2. the resolved config's own options, in table order.
 *    3. 'nothing' (universal, unconditional).
 *    4. 'deliverable', per service (universal, unconditional).
 *    5. 'else' (universal, unconditional — the mandatory escape hatch).
 *  A diagnosis with no config at all (UNCLASSIFIED, or a matched rule that
 *  ships no check-in config) still gets exactly the last three.
 *
 *  `engineKey` is required to resolve DELIVERABLE_LABEL: Diagnosis carries
 *  no serviceId of its own (RuleContent has none), the same reason the
 *  prototype's own checkinOptions(c) reads `c.engineKey` rather than
 *  anything on the diagnosis it derives. */
export function checkinOptionsFor(
  d: Diagnosis,
  prepChecks: Record<number, boolean>,
  engineKey: ServiceKey,
): CheckinOption[] {
  const cfg = d.ruleId ? (CHECKIN[d.state] ?? CHECKIN[d.ruleId]) : undefined
  const prep = prepPlanFor(d)
  const done = prep ? prep.steps.filter((_, i) => prepChecks[i]).length : 0

  const list: CheckinOption[] = []
  // C6 seam: the prototype guards this push with `!degradedFor(c.engineKey)`
  // (2606) — under source re-verification, the "not done yet" nudge pauses
  // with the rest of the state-specific guidance. C6's concern; not built
  // here (scope exclusion 2).
  if (cfg?.prepAware && prep && done === 0) {
    list.push({ k: 'notdone', label: UNIVERSAL_LABELS.notDone })
  }
  // C6 seam: the prototype guards this spread with `!degradedFor(c.engineKey)`
  // (2611) — under source re-verification, only the universal three remain.
  // C6's concern; not built here (scope exclusion 2).
  if (cfg) list.push(...cfg.opts)
  list.push({ k: 'nothing', label: UNIVERSAL_LABELS.nothing })
  list.push({ k: 'deliverable', label: UNIVERSAL_LABELS.deliverable[engineKey] })
  list.push({ k: 'else', label: UNIVERSAL_LABELS.else })
  return list
}

/** Resolves which CHECKIN_META key (if any) belongs to a playbook rule,
 *  using the SAME resolution order checkinOptionsFor uses at runtime
 *  (state first, then rule id) — so the scan and the renderer can never
 *  disagree about which config a rule owns. This is what lets SIR's
 *  state-keyed entries ('S-1'...'S-9') resolve without a hand-typed
 *  prefix map: SIR rules simply hit the `rule.state` branch, passport/voter
 *  rules fall through to the `rule.id` branch. */
function resolveMetaKey(rule: { id: string; state: string }): string | undefined {
  if (CHECKIN_META[rule.state]) return rule.state
  if (CHECKIN_META[rule.id]) return rule.id
  return undefined
}

/** Every citizen-facing check-in string this playbook's rules reach,
 *  addressed serviceId-first — the shape guardrailFindings({ extra })
 *  consumes. Driven off playbook.rules, NOT off Object.keys(CHECKIN_META),
 *  so a config for a rule no playbook ships is caught by the completeness
 *  pin instead of silently swept under the wrong serviceId (mirrors
 *  prep.ts's prepCopyExtras exactly — see that function's own doc comment).
 *
 *  DELIVERABLE_LABEL[serviceId], DELIVERABLE_Q[serviceId] and
 *  CLOSED_TITLE[serviceId] are swept under the same serviceId, one entry
 *  each per call. The three UNIVERSAL_LABELS literals are swept too (design
 *  note 7: they reach the scan through this function, not SCREEN_COPY.ui) —
 *  one entry each per call, same text every time, so each service's own
 *  sweep sees them regardless of whether that service has state-specific
 *  options at all. */
export function checkinCopyExtras(playbook: Playbook): CopyLocation[] {
  const out: CopyLocation[] = []
  for (const rule of playbook.rules) {
    const key = resolveMetaKey(rule)
    if (!key) continue
    const meta = CHECKIN_META[key]
    meta.opts.forEach((o, i) => {
      out.push({ at: `${playbook.serviceId}:CHECKIN.${key}.opts[${i}].label`, text: o.label })
    })
  }
  // playbook.serviceId is plain `string` (frozen to 3 values in practice —
  // see casefile.ts's own ServiceKey note); the three real call sites only
  // ever pass passportPlaybook/voterPlaybook/sirPlaybook.
  const svc = playbook.serviceId as ServiceKey
  out.push({ at: `${playbook.serviceId}:DELIVERABLE_LABEL`, text: DELIVERABLE_LABEL[svc] })
  out.push({ at: `${playbook.serviceId}:DELIVERABLE_Q`, text: DELIVERABLE_Q[svc] })
  out.push({ at: `${playbook.serviceId}:CLOSED_TITLE`, text: CLOSED_TITLE[svc] })
  out.push({ at: `${playbook.serviceId}:UNIVERSAL_LABELS.nothing`, text: UNIVERSAL_LABELS.nothing })
  out.push({ at: `${playbook.serviceId}:UNIVERSAL_LABELS.else`, text: UNIVERSAL_LABELS.else })
  out.push({ at: `${playbook.serviceId}:UNIVERSAL_LABELS.notDone`, text: UNIVERSAL_LABELS.notDone })
  return out
}
