// NOTE: the shared test-harness imports an earlier draft of this file's
// plan wanted pre-imported for Tasks 4/5 (`vi`, `beforeEach`, `afterEach`,
// `fireEvent`, `userEvent`, `VISIT_EXPECT`) are deliberately NOT imported
// here unused — this repo's tsconfig.app.json has noUnusedLocals/
// noUnusedParameters on, which is a real, correct compiler setting, not
// something to relax or route around. The two testing-library gotchas that
// pre-import was meant to flag (vi.useFakeTimers() + user-event v14 hang;
// vi.restoreAllMocks() not restoring navigator.clipboard) are documented in
// the plan's design notes instead, for whichever task first needs them.
// Add each import at the task that actually uses it.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrepareScreen } from './PrepareScreen'
import { PREP } from '../playbooks/prep'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { UI } from '../screens/screenCopy'

// Real engines on purpose: this is an integration point, and a toy fixture
// would not exercise a real `where` shape.
const escalate = diagnose(passportEngine, { q1: 'adverse', q2: 'formal_grievance' })  // state-5b
const noticeD = diagnose(sirEngine, { sirState: 'delhi', sirQ1: 'notice' })           // s-notice
// state-5a: the ONE reachable rule whose where carries a phone (1800-258-1800).
const helplineD = diagnose(passportEngine, { q1: 'adverse', q2: 'informal' })         // state-5a

describe('the prepare shell', () => {
  it('crumbs read "<service> · <matched state>" then "Prepare"', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(`Passport · ${escalate.label}`)).toBeInTheDocument()
    expect(screen.getByText(UI.phase.prepare)).toBeInTheDocument()
    expect(document.querySelector('.crumb-sq')).toHaveClass('sq-passport')
  })

  it('uses the plan title when there is one, and the fallback headline when there is not', () => {
    const { unmount } = render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(PREP['state-5b'].title!)
    unmount()
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(UI.prepare.headlineFallback)
  })

  it('the lede matches whether the plan carries a draft', () => {
    const { unmount } = render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(screen.getByText(UI.prepare.ledeDraft)).toBeInTheDocument()
    unmount()
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(screen.getByText(UI.prepare.ledeSteps)).toBeInTheDocument()
  })

  it('always shows the trust line — NextMove never submits (locked Non-Goal)', () => {
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.prep-trust')).toHaveTextContent(UI.prepare.trust)
  })
})

describe('the official-channel card', () => {
  it("renders the rule's own where.label, phone and url — nothing re-derived", () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    const card = document.querySelector('.channel-card')!
    expect(card).toHaveTextContent(UI.prepare.channelK)
    expect(card).toHaveTextContent(escalate.where.label)
    const link = screen.getByRole('link', { name: UI.prepare.channelOpen })
    expect(link).toHaveAttribute('href', escalate.where.url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('omits the helpline row and the link when the rule carries neither', () => {
    // s-notice's real where is { label: "Submit to your BLO / ERO per the
    // notice's instructions" } — no url, no phone. Both optional fields
    // absent, which is what makes it the right negative fixture.
    render(<PrepareScreen serviceLabel="SIR" engineKey="sir" d={noticeD} prep={PREP['s-notice']} />)
    expect(document.querySelector('.channel-phone')).toBeNull()
    expect(screen.queryByRole('link', { name: UI.prepare.channelOpen })).toBeNull()
    expect(document.querySelector('.channel-v')).toHaveTextContent(noticeD.where.label)
  })

  it('renders the helpline with the phone interpolated into the registered template', () => {
    // REAL data, no synthetic spread: passportPlaybook.ts:161-165 gives
    // state-5a where.phone '1800-258-1800', and PREP['state-5a'] exists, so
    // this row ships to real citizens today. See design note 5.
    expect(helplineD.where.phone).toBe('1800-258-1800')   // guards the fixture itself
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={helplineD} prep={PREP['state-5a']} />)
    expect(document.querySelector('.channel-phone'))
      .toHaveTextContent(UI.prepare.channelPhone.replace('{phone}', helplineD.where.phone!))
  })
})

describe('scope exclusions are structural, not incidental', () => {
  it('ships no save/casefile control (C5) and no fills-review panel (C8)', () => {
    render(<PrepareScreen serviceLabel="Passport" engineKey="passport" d={escalate} prep={PREP['state-5b']} />)
    expect(document.querySelector('.btn-ghost')).toBeNull()
    expect(document.querySelector('.saved-note')).toBeNull()
    expect(document.querySelector('.fill-list')).toBeNull()
    expect(document.querySelector('.fill-review')).toBeNull()
  })
})
