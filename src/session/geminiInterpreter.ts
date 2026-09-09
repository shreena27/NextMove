// The real Gemini adapter (Task 18, design note 3). This is the ONLY module
// in this codebase that calls Google's Gemini REST API, and the ONLY
// non-test module that ever constructs a `QuotaError`.
//
// Small on purpose (design note 3): one `POST` to Gemini's REST
// `generateContent` endpoint via the platform `fetch`, no SDK dependency.
// `@google/genai` would pull a transitive dependency tree into a bundle for
// the sake of one request this module can build by hand.
//
// Contract discipline, matching `simInterpreter.ts` exactly: this module
// builds its prompt from `InterpretationRequest` — `service`, `questions`,
// `text` — and NOTHING else (scope exclusion 4). It returns RAW only, never
// gates itself, and ships zero fallback logic of its own: a malformed or
// unreachable response THROWS, and `runInterpretation`'s existing try/catch
// (session/interpretation.ts) is where fail-closed handling lives. This
// module's own shape check is deliberately light — it rejects a response
// that is structurally wrong at the top level (missing/non-array
// `mappings`/`facts`) and drops any per-item field beyond the three/one this
// codebase's `RawInterpretation` allows; the EXHAUSTIVE per-field type check
// already exists downstream (`isRawInterpretation`, session/interpretation.ts)
// as the real safety net, so duplicating that same exhaustive check here
// would just be two behaviours to keep in sync for a check that never runs
// this adapter's output ungated regardless.
import type { InterpretationRequest, InterpreterProvider, RawInterpretation } from '../domain/interpret'

/** A real, current Gemini model id (the `gemini-2.x-flash` family) — a
 *  plain string constant for the provenance label
 *  (`session/interpretation.ts`'s `provenanceLabel`) and the REST URL below.
 *  Not validated against a live call by anything in this codebase; the repo
 *  owner's manual verification script (Task 18 brief) is what actually
 *  exercises it against Google's API. Update this constant, not the
 *  provenance format, the day the owner wants to move models — see D17/Open
 *  Question 2 in the task brief for why no separate prompt-version field
 *  exists yet. */
export const MODEL_ID = 'gemini-2.5-flash'

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`

/** Thrown for, and ONLY for, a Gemini HTTP 429 (quota/rate-limit exhausted).
 *  Exported so `session/interpretation.ts` can `instanceof`-check it and map
 *  it onto the pre-declared quota failure reason — spec §2's "quota
 *  exhaustion hides the entry row rather than breaking it" (design note 8).
 *  Every OTHER throw from this module is a plain `Error`, which
 *  `runInterpretation`'s catch falls through to the generic failed reason
 *  for — the distinction is load-bearing, not decorative. */
export class QuotaError extends Error {
  constructor(message = 'Gemini API quota exceeded (HTTP 429)') {
    super(message)
    this.name = 'QuotaError'
  }
}

/** Builds the prompt from `req` alone. Every fact this string can contain —
 *  the service name, the offered question ids and their allowed values, and
 *  the citizen's own text — comes from `InterpretationRequest`, the whole of
 *  what any provider ever sees (scope exclusion 4). No playbook rule, no
 *  diagnosis, no source, no `whatToDo`, no prior answer ever crosses into
 *  this function — `geminiInterpreter.test.ts`'s own prompt test asserts
 *  that directly against real `passportPlaybook` strings. Exported for that
 *  test's direct use, and because a pure string-builder is easy to reason
 *  about in isolation. */
export function buildPrompt(req: InterpretationRequest): string {
  const questionLines = req.questions
    .map(q => `- questionId: "${q.questionId}", allowed values: [${q.optionValues.map(v => JSON.stringify(v)).join(', ')}]`)
    .join('\n')
  return [
    'A citizen described, in their own words, their situation with an Indian government process. Read ONLY the text below and decide, for each offered question, whether the text clearly supports one of its allowed answers.',
    '',
    `Service: ${req.service}`,
    '',
    'Questions offered (map only these; do not invent a questionId that is not listed):',
    questionLines || '(none offered)',
    '',
    "Citizen's text — the ONLY source of truth. Do not use outside knowledge about this service, and do not assume anything the text does not say:",
    `"""${req.text}"""`,
    '',
    'Respond with STRICT JSON and nothing else — no markdown fencing, no commentary — matching exactly this shape:',
    '{"mappings":[{"questionId":"...","value":"...","span":"..."}],"facts":[{"value":"..."}]}',
    '',
    'Rules:',
    '- Only include a mapping for a question the text clearly answers; omit any question the text does not address. Do not guess.',
    '- "value" in each mapping MUST be exactly one of that question\'s listed allowed values.',
    '- "span" MUST be an exact, verbatim substring of the citizen\'s text above (same characters, same case) that justifies the mapping. Do not paraphrase or summarize the span.',
    '- "facts" lists candidate reference numbers or dates you find VERBATIM in the citizen\'s text, each as {"value": "..."} only — copy the exact substring, add no label, type, or confidence.',
    '- Do not add any field beyond "mappings" and "facts", and do not add any field beyond "questionId", "value", "span" on a mapping or "value" on a fact.',
  ].join('\n')
}

/** Extracts the model's generated text from Gemini's REST response envelope
 *  (`{ candidates: [{ content: { parts: [{ text }] } }] }`). Throws if the
 *  envelope does not have that shape — an unexpected envelope is exactly as
 *  unusable as a malformed payload, and this module throws on anything
 *  unexpected (design note 3). */
function extractGeneratedText(envelope: unknown): string {
  const candidates = (envelope as { candidates?: unknown })?.candidates
  const first = Array.isArray(candidates) ? candidates[0] : undefined
  const text = (first as { content?: { parts?: { text?: unknown }[] } } | undefined)?.content?.parts?.[0]?.text
  if (typeof text !== 'string') {
    throw new Error('Gemini adapter: response envelope had no generated text')
  }
  return text
}

/** Parses the model's generated text as the strict JSON it was asked for,
 *  and reconstructs a `RawInterpretation` picking ONLY the known fields —
 *  `questionId`/`value`/`span` per mapping, `value` per fact — so any extra
 *  field the model adds (a `confidence` score, most obviously) is dropped at
 *  this parse boundary and never reaches the returned object (design note 3,
 *  the `RawInterpretation` doc comment in `domain/interpret.ts`).
 *
 *  Throws on: text that is not valid JSON; a parsed value that is not an
 *  object; a parsed object whose `mappings` or `facts` is missing or not an
 *  array. A per-ITEM shape problem (a mapping missing `span`, a fact that is
 *  not an object, etc.) is NOT a throw here — that item is silently dropped,
 *  matching this codebase's general silent-drop-over-crash gate discipline
 *  (`domain/interpretGates.ts`'s enum/span gates do the same) — and the
 *  downstream `isRawInterpretation` shape check
 *  (`session/interpretation.ts`) is the exhaustive safety net regardless. */
function parseGeminiPayload(text: string): RawInterpretation {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Gemini adapter: generated text was not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini adapter: parsed JSON was not an object')
  }
  const obj = parsed as { mappings?: unknown; facts?: unknown }
  if (!Array.isArray(obj.mappings) || !Array.isArray(obj.facts)) {
    throw new Error('Gemini adapter: parsed JSON is missing a mappings/facts array')
  }

  const mappings: RawInterpretation['mappings'] = []
  for (const item of obj.mappings) {
    if (!item || typeof item !== 'object') continue
    const m = item as { questionId?: unknown; value?: unknown; span?: unknown }
    if (typeof m.questionId === 'string' && typeof m.value === 'string' && typeof m.span === 'string') {
      mappings.push({ questionId: m.questionId, value: m.value, span: m.span })
    }
  }

  const facts: RawInterpretation['facts'] = []
  for (const item of obj.facts) {
    if (!item || typeof item !== 'object') continue
    const f = item as { value?: unknown }
    if (typeof f.value === 'string') facts.push({ value: f.value })
  }

  return { mappings, facts }
}

/** The registered `InterpreterProvider` for `'gemini'`
 *  (`session/interpretation.ts`'s registry, design note 7). */
export const geminiProvider: InterpreterProvider = {
  id: 'gemini',
  // D3: the production span floor — 3, not the simulator's 1. This is the
  // one line that distinguishes this provider's safety posture from
  // simInterpreter.ts's. Do not lower it.
  minSpanTokens: 3,
  async interpret(req: InterpretationRequest): Promise<RawInterpretation> {
    // Read lazily, inside the function, never at module scope — the same
    // discipline `session/supabase.ts` and `session/featureFlags.ts` already
    // follow: a module-scope read is evaluated (and frozen) the first time
    // any test transitively imports this module.
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('Gemini adapter: VITE_GEMINI_API_KEY is not set')
    }

    const prompt = buildPrompt(req)
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    // The one behavioural addition Task 18 makes beyond a plain adapter
    // (design note 8): a 429 throws the typed QuotaError, checked BEFORE the
    // generic non-200 check below so a quota response is never mistaken for
    // an ordinary failure.
    if (res.status === 429) {
      throw new QuotaError()
    }
    if (!res.ok) {
      throw new Error(`Gemini adapter: HTTP ${res.status}`)
    }

    // `res.json()` throws (a rejected promise) when the HTTP body itself is
    // not valid JSON — that propagates unchanged, satisfying "a non-JSON
    // response body throws" without this module needing its own try/catch
    // around it.
    const envelope: unknown = await res.json()
    const generatedText = extractGeneratedText(envelope)
    return parseGeminiPayload(generatedText)
  },
}
