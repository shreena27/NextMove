/** FactChips — port of the prototype's `factChips` (design/nextmove-v1-
 *  prototype.html, 3025-3036, tag v1-design-lock-2): "What we picked up" —
 *  the citizen's own reference numbers/dates/notes, extracted by the
 *  verbatim-fact gate (Task 3) and shown back to them, editable and
 *  removable (spec §3, FR-AI-04).
 *
 *  STANDALONE, OWNED BY NEITHER SCREEN (task-13-brief.md design note 8).
 *  This component is composed by BOTH `InterpConfirmScreen` (prototype
 *  3099, mapped path) and `UnplaceablePanel` (prototype 3062, Task 14) —
 *  the unplaceable path still shows facts, because they passed the
 *  verbatim gate independently of any mapping. It takes exactly
 *  `{ facts, droppedSensitive, factEditIdx, factEditVal, dispatch }` and
 *  nothing else — in particular, NOT the citizen's `text` (see the edited-
 *  fact note below for why that omission is load-bearing, not an
 *  oversight).
 *
 *  DESIGN NOTE 1 — three render states, in the prototype's own check order
 *  (`factChips`, 3026-3028):
 *   1. no facts AND no `droppedSensitive` -> render nothing (`null`).
 *   2. no facts BUT `droppedSensitive` -> render ONLY the Aadhaar refusal
 *      paragraph. No "What we picked up" heading here — nothing was picked
 *      up, and a heading over a refusal would claim otherwise.
 *   3. facts present -> the heading, the chips, then conditionally the
 *      unknown-number note (3034) and the Aadhaar refusal (3035).
 *
 *  DESIGN NOTE 2 — the Aadhaar refusal is ONE registered string
 *  (`UI.facts.aadhaarRefused`), read from `screenCopy.ts` and referenced
 *  from BOTH JSX sites below (state 2 and state 3's tail) — never inlined,
 *  never a second entry. Its condition, `droppedSensitive`, is a boolean
 *  that carries no digits (Task 3 design note 7): the copy says a number
 *  was left out: the number itself is never in state to leak.
 *
 *  DESIGN NOTE 3 — the unknown-number note (`UI.facts.unknownNumberNote`)
 *  renders only when `facts.some(f => f.refType === 'unknown')` (3034). It
 *  must never show when every fact was recognised — that would be a false
 *  claim about the citizen's own data.
 *
 *  DESIGN NOTE 4 — chip anatomy (3032, spec §7's "chips carry distinct
 *  accessible names"). Each normal-state chip (`.fchip`) holds `.fk` (the
 *  label), `.fv` (the value), an Edit button and a Remove button. BOTH
 *  buttons' `aria-label`s carry the label AND the value
 *  (`UI.facts.editValueAria`/`removeValueAria`, both `{label} {value}`
 *  templates) so two chips sharing a label (two dates, two reference
 *  numbers of the same kind) stay distinguishable to a screen reader. The
 *  visible glyphs (pencil/cross) are decorative and carry no accessible
 *  name of their own — the `aria-label` is the only name either button has.
 *
 *  DESIGN NOTE 5 — edit mode (3031). Clicking Edit dispatches
 *  `SET_FACT_EDIT { index }`, which the reducer uses to seed
 *  `factEditIdx`/`factEditVal` from the fact's CURRENT value (session.ts).
 *  While `factEditIdx === i`, that chip renders `.fchip.fchip-edit`: an
 *  `<input>` (`aria-label="Edit {label}"`, value from the `factEditVal`
 *  PROP, never local state — D7), a Save button
 *  (`aria-label="Save {label}"`), and Enter-in-the-input also saves. Typing
 *  dispatches `SET_FACT_EDIT_VAL`; both Enter and the Save button dispatch
 *  the SAME `SAVE_FACT_EDIT` (no payload) — this component does not decide
 *  whether the value is kept. `SAVE_FACT_EDIT`'s own guard (session.ts)
 *  trims and discards a whitespace-only value while still closing the
 *  editor either way; this component contains no second copy of that
 *  guard, deliberately, so there is exactly one place the rule can drift.
 *
 *  DESIGN NOTE 6 — an edited fact is NOT re-gated against the citizen's
 *  text, and this is deliberate, not a gap. The verbatim-fact gate (Task 3)
 *  runs on the MODEL's proposal, to stop a hallucinated value from being
 *  shown back as if the citizen wrote it. A citizen editing their own chip
 *  is not a model — they are correcting a value they themselves typed,
 *  possibly fixing an OCR-style transcription slip — and spec §3 explicitly
 *  permits this ("each editable and removable"). So this component takes
 *  no `text` prop at all and performs no substring check of its own: it
 *  renders whatever `facts[i].value` the reducer handed back, full stop.
 *  `edited: true` (set by `editFact`, domain/interpret.ts) is what records
 *  the difference in provenance for the trust disclosure (Task 16) to show
 *  separately from the quoted text — nothing here or downstream may assume
 *  "every value in `facts` is a substring of the text," because that
 *  becomes false the moment a citizen edits one.
 *
 *  DESIGN NOTE 7 — removal is immediate, with no confirm (2450). Clicking
 *  Remove dispatches `REMOVE_FACT { index }` straight away. A removed fact
 *  simply does not exist and cannot fill anything, so there is nothing
 *  destructive to guard against — an inline confirm here would only be
 *  friction on the safest action in the whole feature (contrast
 *  `removeConfirm` on a casefile, which destroys a saved record). */
import type { Fact } from '../domain/interpret'
import type { SessionAction } from '../session/session'
import { UI } from '../screens/screenCopy'

export interface FactChipsProps {
  facts: readonly Fact[]
  droppedSensitive: boolean
  factEditIdx: number | null
  factEditVal: string
  dispatch: (action: SessionAction) => void
}

export function FactChips({ facts, droppedSensitive, factEditIdx, factEditVal, dispatch }: FactChipsProps) {
  // State 1 (design note 1): nothing to show at all.
  if (facts.length === 0 && !droppedSensitive) return null

  // State 2: nothing was picked up, but something WAS refused — the
  // refusal paragraph only, no heading (a heading here would claim
  // something was picked up when nothing was).
  if (facts.length === 0) {
    return <p className="small" style={{ marginTop: 20 }}>{UI.facts.aadhaarRefused}</p>
  }

  // State 3: facts present. `key={i}` is the correct identity here (not an
  // anti-pattern to "fix") — the reducer addresses every fact by its ARRAY
  // INDEX (`SET_FACT_EDIT`/`SAVE_FACT_EDIT`/`REMOVE_FACT { index }`), so a
  // chip's identity genuinely IS its current index, the same way this
  // component dispatches it.
  return (
    <>
      <div className="nm-k" style={{ margin: '20px 0 0' }}>{UI.facts.pickedUpKey}</div>
      <div className="fact-chips">
        {facts.map((f, i) =>
          factEditIdx === i ? (
            <span className="fchip fchip-edit" key={i}>
              <span className="fk">{f.label}</span>
              <input
                value={factEditVal}
                onChange={e => dispatch({ type: 'SET_FACT_EDIT_VAL', value: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') dispatch({ type: 'SAVE_FACT_EDIT' })
                }}
                aria-label={UI.facts.editLabel.replace('{label}', f.label)}
              />
              <button
                type="button"
                onClick={() => dispatch({ type: 'SAVE_FACT_EDIT' })}
                aria-label={UI.facts.saveLabel.replace('{label}', f.label)}
              >
                {'✓'}
              </button>
            </span>
          ) : (
            <span className="fchip" key={i}>
              <span className="fk">{f.label}</span>
              <span className="fv">{f.value}</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_FACT_EDIT', index: i })}
                aria-label={UI.facts.editValueAria.replace('{label}', f.label).replace('{value}', f.value)}
              >
                {'✎'}
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: 'REMOVE_FACT', index: i })}
                aria-label={UI.facts.removeValueAria.replace('{label}', f.label).replace('{value}', f.value)}
              >
                {'✕'}
              </button>
            </span>
          ),
        )}
      </div>
      {facts.some(f => f.refType === 'unknown') ? (
        <p className="small" style={{ marginTop: 8 }}>{UI.facts.unknownNumberNote}</p>
      ) : null}
      {droppedSensitive ? <p className="small" style={{ marginTop: 8 }}>{UI.facts.aadhaarRefused}</p> : null}
    </>
  )
}
