// RED for Task 10 — CaseClosedScreen, the port of `renderCaseClosed`
// (design/nextmove-v1-prototype.html, 2986-3000, tag v1-design-lock-2): "the
// single calm celebratory beat" the spec allows, shown only on outcome
// `deliverable_received`.
//
// DESIGN NOTE 2's lede gate is the load-bearing assertion in this file: the
// prototype's lede ends "...NextMove's part is done; the casefile and its
// journey stay under "Closed" on Home if you ever need the record." — true
// for a SAVED case, affirmatively FALSE for a working (unsaved) one (an
// unsaved case is never in savedCases; RESTART drops it; nothing stays
// under "Closed" on Home). The fix is a gate, not a rewrite: the closing
// clause renders only when `!case.unsaved`. Both branches below query the
// SAME selector (`.lede`'s textContent) — Task 9's absence rule: an absence
// assertion is only meaningful when the same query has a positive control
// elsewhere in this file.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CaseClosedScreen } from './CaseClosedScreen'
import { caseSnapshot, type Casefile } from '../domain/casefile'
import { diagnose } from '../domain/engine'
import { passportEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'

const NOW = 1_760_000_000_000

function makeCase(overrides: Partial<Casefile> = {}): Casefile {
  const answers = { q1: 'adverse', q2: 'informal' }
  const snap = caseSnapshot(
    'passport', UI.serviceLabel.passport, 'passport-nextmove', diagnose(passportEngine, answers), answers, {}, NOW,
  )
  return {
    ...snap, id: 'cc-c1', outcome: 'deliverable_received',
    lastCheck: null, remindAt: null, closedAt: NOW, log: [], ...overrides,
  }
}

describe('CaseClosedScreen (port of renderCaseClosed, prototype 2986-3000)', () => {
  it('renders the "Case closed" crumb (sq-butter), the "You got it." headline with a .mark span on "got it", and Gems — a Split', () => {
    const c = makeCase()
    render(<CaseClosedScreen case={c} logOpen={{}} dispatch={vi.fn()} />)
    expect(document.querySelector('.split')).toBeInTheDocument()
    expect(document.querySelector('.crumbs')).toHaveTextContent(UI.caseClosed.crumb)
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-butter')
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('You got it.')
    expect(h1.querySelector('.mark')).toHaveTextContent('got it')
    expect(document.querySelector('.gems')).toBeInTheDocument()
  })

  it("the reduced-motion CSS still collapses .gem's animation (index.css, @media (prefers-reduced-motion:reduce))", () => {
    // Derive the path via node:path, not new URL(...) — same jsdom/Vite
    // asset-URL workaround tokens.test.ts's own header comment explains.
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8')
    const match = css.match(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/)
    expect(match, 'the reduced-motion media block must exist in index.css').not.toBeNull()
    expect(match![1]).toMatch(/(^|[,{])\.gem([,{]|\b)/)
  })

  it('the journey log renders when a case exists', () => {
    const c = makeCase({ log: [{ t: NOW, kind: 'diagnosed', text: 'x' }] })
    render(<CaseClosedScreen case={c} logOpen={{}} dispatch={vi.fn()} />)
    expect(document.querySelector('.journey')).toBeInTheDocument()
  })

  it('renders no journey log when no case exists (prototype\'s own `${c ? renderLog(c) : \'\'}`)', () => {
    render(<CaseClosedScreen case={null} logOpen={{}} dispatch={vi.fn()} />)
    expect(document.querySelector('.journey')).toBeNull()
  })

  it('"Back to Home" is primary+arrow+block and dispatches RESTART', async () => {
    const dispatch = vi.fn()
    const c = makeCase()
    render(<CaseClosedScreen case={c} logOpen={{}} dispatch={dispatch} />)
    const btn = screen.getByRole('button', { name: new RegExp(UI.caseClosed.backToHome) })
    expect(btn).toHaveClass('btn-primary', 'btn-block')
    await userEvent.click(btn)
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESTART' })
  })

  describe(
    'DESIGN NOTE 2 (Task 10, Open Question 3 RESOLVED, Finding 13) — the lede gate: ' +
    'the "stays under Closed on Home" clause is false for an unsaved case, so it is a subtraction, never a rewrite',
    () => {
      it('a SAVED case: the lede contains the "stay under "Closed" on Home" clause', () => {
        const c = makeCase() // unsaved is undefined/falsy => this reads as saved
        render(<CaseClosedScreen case={c} logOpen={{}} dispatch={vi.fn()} />)
        expect(document.querySelector('.lede')!.textContent).toContain('stay under "Closed" on Home')
      })

      it(
        'an UNSAVED case (case.unsaved === true): the clause is ABSENT — claiming otherwise would tell a citizen ' +
        'their record is kept at the exact moment RESTART discards it — while "NextMove\'s part is done" still ' +
        'renders (same .lede query as the saved-case assertion above, per Task 9\'s absence rule)',
        () => {
          const c = makeCase({ unsaved: true })
          render(<CaseClosedScreen case={c} logOpen={{}} dispatch={vi.fn()} />)
          const lede = document.querySelector('.lede')!.textContent!
          expect(lede).toContain("NextMove's part is done")
          expect(lede).not.toContain('stay under "Closed" on Home')
        },
      )
    },
  )
})
