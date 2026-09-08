import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReducer } from 'react'
import { TrustDisclosure, SOURCES_VERIFIED } from './TrustDisclosure'
import { diagnose } from '../domain/engine'
import { passportEngine, voterEngine, sirEngine } from '../playbooks/engines'
import { sessionReducer, initialSession } from '../session/session'
import { labelMap, PASSPORT_Q1_LABELS, PASSPORT_Q2_LABELS, VOTER_Q1_LABELS, VOTER_APPEAL_LABELS } from '../screens/labels'
import { SIR_Q1_OPTIONS_FOR } from '../playbooks/sirPlaybook'
import { loadManifest } from '../playbooks/guardrails/manifest'
import * as freshnessModule from '../domain/freshness'
import { UI } from '../screens/screenCopy'
import type { Fact } from '../domain/interpret'

describe('AC-10: "You told us" shows the real answers given', () => {
  it.each([
    ['passport', passportEngine, { q1: 'adverse', q2: 'no_followup' },
      { ...labelMap('q1', { ...PASSPORT_Q1_LABELS, not_sure: "I'm not sure" }),
        ...labelMap('q2', PASSPORT_Q2_LABELS) },
      ['I saw something on the portal that looks negative or confusing', 'No, not yet']],
    ['voter', voterEngine, { voterQ1: 'decision', voterAppealedRaw: 'pending', voterAppealed: 'pending' },
      { ...labelMap('voterQ1', { ...VOTER_Q1_LABELS, unclassified: "I'm not sure" }),
        ...labelMap('voterAppealedRaw', VOTER_APPEAL_LABELS) },
      ["I got a decision but don't understand it, or it wasn't what I expected",
       "Yes, and I'm still waiting to hear back"]],
    ['sir', sirEngine, { sirState: 'delhi', sirQ1: 'notice' },
      labelMap('sirQ1', { ...SIR_Q1_OPTIONS_FOR.claims_notice, unclassified: "I'm not sure" }),
      ['I got a notice asking for documents']],
  ])('%s: the panel is non-empty and echoes each real answer', (_, engine, answers, labels, expected) => {
    render(<TrustDisclosure d={diagnose(engine, answers)} answerLabels={labels}
                            appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    const told = screen.getByText('You told us').nextElementSibling!
    for (const label of expected) expect(told.textContent).toContain(label)
    expect(told.textContent).not.toBe('')
  })

  it('a genuinely unplaceable case says so instead of showing an empty row', () => {
    render(<TrustDisclosure d={diagnose(passportEngine, {})} answerLabels={{}} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.getByText('Not enough to safely place your case; see below.')).toBeInTheDocument()
  })

  it('extraToldUs appends the recovery echo', () => {
    render(<TrustDisclosure d={diagnose(passportEngine, { q1: 'not_sure' })} answerLabels={{}}
                            extraToldUs='Asked for the safest thing to do now'
                            appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.getByText(/Asked for the safest thing to do now/)).toBeInTheDocument()
  })
})

describe('the panel is controlled by session state, closed by default (PRD §15)', () => {
  // The component owns NO state (design note 7). This harness is the same
  // useReducer wiring Task 4's rendered-flow tests use.
  function Harness() {
    const [s, dispatch] = useReducer(sessionReducer, initialSession)
    return <TrustDisclosure d={diagnose(passportEngine, { q1: 'adverse', q2: 'no_followup' })}
                            answerLabels={labelMap('q1', PASSPORT_Q1_LABELS)}
                            appliedText={null} caseFacts={[]}
                            open={s.trustOpen} onToggle={() => dispatch({ type: 'TOGGLE_TRUST' })} />
  }

  it('the toggle reads "Why am I seeing this?" and reveals the panel on click', async () => {
    render(<Harness />)
    expect(document.querySelector('.trust-panel')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Why am I seeing this\?/ }))
    expect(document.querySelector('.trust-panel')).toBeInTheDocument()
  })

  it('reports aria-expanded, and holds no state of its own', async () => {
    const onToggle = vi.fn()
    render(<TrustDisclosure d={diagnose(passportEngine, { q1: 'no_contact', q2: 'no_followup' })}
                            answerLabels={{}} appliedText={null} caseFacts={[]} open={false} onToggle={onToggle} />)
    const btn = screen.getByRole('button', { name: /Why am I seeing this\?/ })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(btn)
    expect(onToggle).toHaveBeenCalledTimes(1)
    // open={false} never changed, so the panel must still be closed:
    // proof the component is controlled, not self-toggling.
    expect(document.querySelector('.trust-panel')).toBeNull()
  })
})

describe('"Based on" — three distinct cases, all three pinned', () => {
  it('a sourced rule WITH a quote shows the title, the verbatim quote, and the caption', () => {
    // state-5b (rec ESCALATE) is the one passport rule carrying source.quote:
    // '"...within a reasonable period of time" — no numeric deadline is stated.'
    // It is already Task 6's and Task 9's fixture, so nothing new is introduced.
    const d = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })
    expect(d.source.quote).toBeTruthy()          // guard: the fixture really has one
    render(<TrustDisclosure d={d} answerLabels={{}} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.getByText(d.source.title, { exact: false })).toBeInTheDocument()
    expect(document.querySelector('.source-quote')).toHaveTextContent(d.source.quote!)
    // C6: computed via the SAME live-then-fallback logic the component
    // itself uses, rather than hardcoded — this fixture's docId
    // (web/grievance_page.txt) happens to be one of the two check:"manual"
    // web-page sources, so this currently exercises the SOURCES_VERIFIED
    // fallback specifically (see the dedicated fallback test below), but
    // the assertion itself doesn't assume which branch and so doesn't rot
    // if a future manifest change makes this document auto-checked too.
    const expectedDate = freshnessModule.verifiedDateFor(d.source.docId) ?? SOURCES_VERIFIED
    expect(screen.getByText(
      new RegExp(`Checked against NextMove's archived copy of this source on ${expectedDate}\\.`)))
      .toBeInTheDocument()
  })

  it('a sourced rule WITHOUT a quote shows title + caption and NO .source-quote', () => {
    // s-notice's source is { docId: SIR_FAQ, title: 'CEO Delhi — Official SIR
    // 2026 FAQ, Q23, Q11' } — sourced, but no quote field. Distinct from the
    // docId === null safety net below, and previously conflated with it.
    const d = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })
    expect(d.source.quote).toBeUndefined()       // guard
    render(<TrustDisclosure d={d} answerLabels={{}} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.getByText(d.source.title, { exact: false })).toBeInTheDocument()
    expect(document.querySelector('.source-quote')).toBeNull()
    expect(screen.getByText(/archived copy/)).toBeInTheDocument()
  })

  it('the UNCLASSIFIED safety net (docId null) shows NO archived-copy caption', () => {
    const d = diagnose(passportEngine, { q1: 'not_sure' })
    expect(d.source.docId).toBeNull()            // guard
    render(<TrustDisclosure d={d} answerLabels={{}} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.queryByText(/archived copy/)).toBeNull()
  })
})

describe('C6: the "verified on" date is live per-document where the freshness job covers it, static where it does not', () => {
  it('a document check_freshness.py does NOT cover (check:"manual"/"none" in manifest.json) falls back to the static SOURCES_VERIFIED', () => {
    // state-dpg-p cites GRIEVANCE ('web/grievance_page.txt'), one of the
    // two web-page sources — manifest.json marks both check:"manual", so
    // sources/freshness.json has no entry for it at all.
    const d = diagnose(passportEngine, { dpgFiled: 'yes' })
    expect(d.source.docId).toBe('web/grievance_page.txt') // guard
    expect(freshnessModule.verifiedDateFor(d.source.docId)).toBeNull()     // guard: confirms the fallback path is actually exercised
    render(<TrustDisclosure d={d} answerLabels={{}} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.getByText(
      new RegExp(`Checked against NextMove's archived copy of this source on ${SOURCES_VERIFIED}\\.`)))
      .toBeInTheDocument()
  })

  it('a covered document shows the LIVE date, not the static SOURCES_VERIFIED, when the two genuinely differ', () => {
    // Mocking domain/freshness's verifiedDateFor directly (same vi.spyOn
    // pattern sirFlow.test.tsx uses for degradedFor) makes this assertion
    // independent of whatever sources/freshness.json's real committed
    // content happens to be on the day this runs.
    const spy = vi.spyOn(freshnessModule, 'verifiedDateFor').mockReturnValue('1 Jan 2027')
    const d = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })
    render(<TrustDisclosure d={d} answerLabels={{}} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.getByText(
      /Checked against NextMove's archived copy of this source on 1 Jan 2027\./)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(SOURCES_VERIFIED))).toBeNull()
    spy.mockRestore()
  })
})

describe('SOURCES_VERIFIED is real metadata, not a decorative string (Open Question 3)', () => {
  // This test file is a *.test.tsx file, so it is outside the scan performed
  // by playbooks/guardrails/isolation.test.ts (which walks non-test `.ts`
  // files only) and may import the harness's manifest reader. TrustDisclosure
  // .tsx itself must NOT.
  it('parses as "d Mon yyyy" and matches the manifest\'s captured date', () => {
    expect(SOURCES_VERIFIED).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)

    const captured = Object.values(loadManifest().documents)
      .map(doc => doc.captured)
    expect(captured.every(Boolean)).toBe(true)

    // NOTE: two manifest entries append provenance prose to the ISO date
    // ("2026-09-05 (rendered in browser; raw HTML is a JS shell)",
    //  "2026-09-05 via Wayback Machine snapshot 2025-03-18"), so compare the
    // leading ISO date, not the whole string. There is no top-level
    // verification-date field in the manifest to compare against; the
    // per-document `captured` prefix IS the record.
    const isoDates = new Set(captured.map(c => c!.slice(0, 10)))
    expect(isoDates.size, `captured dates are not uniform: ${[...isoDates]}`).toBe(1)

    const [iso] = [...isoDates]                                   // '2026-09-05'
    const d = new Date(`${iso}T00:00:00Z`)
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    expect(SOURCES_VERIFIED)
      .toBe(`${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`)
  })
})

describe('C8 Task 16: the "You wrote" row (FR-AI-04; port of prototype 2371)', () => {
  // Same diagnosis/labels for every case in this block — only appliedText/
  // caseFacts vary, which is exactly what this row's own logic branches on.
  const base = {
    d: diagnose(passportEngine, { q1: 'adverse', q2: 'no_followup' }),
    answerLabels: labelMap('q1', PASSPORT_Q1_LABELS),
  }

  it('appliedText: null renders no "You wrote" row — the panel is otherwise unchanged from before this row existed (regression pin)', () => {
    render(<TrustDisclosure {...base} appliedText={null} caseFacts={[]} open onToggle={vi.fn()} />)
    expect(screen.queryByText(UI.interp.youWrote)).toBeNull()
    expect(screen.queryByText(UI.trust.detailsKeptFrom)).toBeNull()
    // Exactly the three pre-existing rows — "You told us", "What that
    // means", "Based on" — never four.
    expect(document.querySelectorAll('.trust-row')).toHaveLength(3)
  })

  it('appliedText set, no facts: renders the quoted italic text and NO "Details kept from it" line', () => {
    render(<TrustDisclosure {...base} appliedText="Police came to my house in June" caseFacts={[]}
                            open onToggle={vi.fn()} />)
    expect(document.querySelectorAll('.trust-row')).toHaveLength(4)
    const row = screen.getByText(UI.interp.youWrote).closest('.trust-row')!
    expect(row).toHaveTextContent('"Police came to my house in June"')
    expect(row.querySelector('.nm-v')).toHaveStyle({ fontStyle: 'italic' })
    expect(row.textContent).not.toContain(UI.trust.detailsKeptFrom)
    expect(row.querySelector('.small')).toBeNull()
  })

  it('appliedText + facts: the details line lists each fact as "{label} {value}", joined with " · "', () => {
    const facts: Fact[] = [
      { kind: 'reference_number', refType: 'passport_file_no', label: 'File Number', value: 'BN1068334517807', fills: '[File Number / ARN]' },
      { kind: 'date', refType: 'date_applied', label: 'Date applied', value: '12 March 2026', fills: '[date you applied]' },
    ]
    render(<TrustDisclosure {...base} appliedText="Police came to my house in June, File no BN1068334517807, applied 12 March 2026"
                            caseFacts={facts} open onToggle={vi.fn()} />)
    const row = screen.getByText(UI.interp.youWrote).closest('.trust-row')!
    expect(row.querySelector('.small')).toHaveTextContent(
      `${UI.trust.detailsKeptFrom} File Number BN1068334517807 · Date applied 12 March 2026`,
    )
  })

  it('the text renders in the "You wrote" row, not the "You told us" answer list — free text is not an answer; extraToldUs would render it alongside option labels as if it had been picked', () => {
    render(<TrustDisclosure {...base} appliedText="Police came to my house in June" caseFacts={[]}
                            open onToggle={vi.fn()} />)
    const toldUs = screen.getByText(UI.trust.youToldUs).nextElementSibling!
    expect(toldUs.textContent).not.toContain('Police came to my house in June')
    // Guard: the text really did render somewhere on the panel (in its own row).
    expect(screen.getByText(/Police came to my house in June/)).toBeInTheDocument()
  })

  it('an edited fact (Task 13) renders its edited value here — the disclosure shows the fact and the text as two separate things, never claiming the edited value was quoted from the text', () => {
    const edited: Fact = {
      kind: 'reference_number', refType: 'passport_file_no', label: 'File Number',
      value: 'BN9999999999999', fills: '[File Number / ARN]', edited: true,
    }
    render(<TrustDisclosure {...base} appliedText="Police came to my house in June, File no BN1068334517807"
                            caseFacts={[edited]} open onToggle={vi.fn()} />)
    const row = screen.getByText(UI.interp.youWrote).closest('.trust-row')!
    // The EDITED value shows in the details line, not the original text's value.
    expect(row.querySelector('.small')).toHaveTextContent(`${UI.trust.detailsKeptFrom} File Number BN9999999999999`)
    // The quoted text itself is untouched — it still shows what was actually typed.
    expect(row).toHaveTextContent('"Police came to my house in June, File no BN1068334517807"')
  })

  it('a closed panel renders nothing from this row (open gates the whole trust-panel, not just this piece)', () => {
    render(<TrustDisclosure {...base} appliedText="Police came to my house in June"
                            caseFacts={[]} open={false} onToggle={vi.fn()} />)
    expect(screen.queryByText(UI.interp.youWrote)).toBeNull()
  })
})
