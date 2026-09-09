// The "Describe it in your own words" (C8) feature flag and interpreter
// selector. Both read `import.meta.env` LAZILY, inside a function, never at
// module scope -- copying `src/session/supabase.ts`'s discipline exactly: a
// module-scope read gets evaluated (and frozen) the first time any test
// transitively imports anything under `session/`, which is most of the
// suite, before a test ever gets the chance to set the value it wants to
// check against.
//
// This is environment configuration, not session state: it cannot change
// during a session, nothing in the reducer branches on it, and it is
// deliberately NOT a `SessionState` field.

/** True only when `VITE_DESCRIBE_IT` is exactly `'on'`. This is an
 *  allowlist of one value, not a truthy/falsy check: an unset var is
 *  `undefined`, a blank `.env` line is `''`, and `VITE_DESCRIBE_IT=off`
 *  must not enable anything. An allowlist of one value is the only
 *  reading where every typo -- `'true'`, `'1'`, `'ON'`, `' on '` included
 *  -- fails closed. The feature ships OFF by default. */
export function describeItEnabled(): boolean {
  return import.meta.env.VITE_DESCRIBE_IT === 'on'
}

export type InterpreterId = 'sim' | 'gemini'

/** Which interpreter provider to route "describe it" answers through.
 *  Returns `'gemini'` only for exactly `'gemini'`; everything else,
 *  including unset, returns `'sim'`. Until Task 18 registers a real
 *  Gemini provider, `'gemini'` here resolves against Task 5's registry,
 *  which returns `null` for an unknown id -- `runInterpretation` then
 *  fails closed. That is the correct behaviour for a misconfigured
 *  environment, not a case this function needs to guard against. */
export function interpreterId(): InterpreterId {
  return import.meta.env.VITE_INTERPRETER === 'gemini' ? 'gemini' : 'sim'
}
