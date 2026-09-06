// The exact source title every playbook's UNCLASSIFIED fallback carries.
// Its own module, with no imports, because both the shipped playbooks and the
// fs-backed guardrail harness need it and the playbooks must never reach the
// harness (and through it, node:fs).
export const SAFETY_NET_TITLE = "NextMove's own safety net — not a sourced official state."
