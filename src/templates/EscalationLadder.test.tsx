import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { diagnose } from '../domain/engine'
import { passportEngine, sirEngine } from '../playbooks/engines'
import { LADDER_DEFS } from './ladder'
import { EscalationLadder } from './EscalationLadder'

describe('EscalationLadder (port of renderLadder, prototype 2792-2803)', () => {
  it('renders nothing for SIR — no verified ladder exists (ladderFor returns null unconditionally)', () => {
    const answers = { sirState: 'delhi', sirQ1: 'notice' }
    const d = diagnose(sirEngine, answers)
    const { container } = render(<EscalationLadder engineKey="sir" d={d} answers={answers} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a passport state-1 diagnosis — the ladder is not in play', () => {
    const answers = { q1: 'no_contact', q2: 'no_followup' }
    const d = diagnose(passportEngine, answers)
    expect(d.state).toBe('1')
    const { container } = render(<EscalationLadder engineKey="passport" d={d} answers={answers} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders three rungs with the right status classes and tags for a real state-5b diagnosis', () => {
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const d = diagnose(passportEngine, answers)
    expect(d.state).toBe('5b')
    const { container } = render(<EscalationLadder engineKey="passport" d={d} answers={answers} />)
    const rungs = Array.from(container.querySelectorAll('.lrung'))
    expect(rungs).toHaveLength(3)
    expect(rungs[0]).toHaveClass('lrung', 'done')
    expect(rungs[1]).toHaveClass('lrung', 'done')
    expect(rungs[2]).toHaveClass('lrung', 'next')
    expect(rungs[0].querySelector('.lr-tag')).toHaveTextContent('Done')
    expect(rungs[1].querySelector('.lr-tag')).toHaveTextContent('Done')
    expect(rungs[2].querySelector('.lr-tag')).toHaveTextContent('Recommended now')
    expect(rungs[0].querySelector('.lr-label')).toHaveTextContent(LADDER_DEFS.passport.rungs[0])
    expect(rungs[1].querySelector('.lr-label')).toHaveTextContent(LADDER_DEFS.passport.rungs[1])
    expect(rungs[2].querySelector('.lr-label')).toHaveTextContent(LADDER_DEFS.passport.rungs[2])
  })

  it("the done rung's dot contains the check icon and no other rung's does", () => {
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const d = diagnose(passportEngine, answers)
    const { container } = render(<EscalationLadder engineKey="passport" d={d} answers={answers} />)
    const rungs = Array.from(container.querySelectorAll('.lrung'))
    expect(rungs[0].querySelector('.lr-dot svg')).not.toBeNull() // done
    expect(rungs[1].querySelector('.lr-dot svg')).not.toBeNull() // done
    expect(rungs[2].querySelector('.lr-dot svg')).toBeNull() // next — no check icon
  })

  it('.lr-tag is absent for an "up" rung (LADDER_TAG.up is empty)', () => {
    const answers = { q1: 'adverse', q2: 'no_followup' }
    const d = diagnose(passportEngine, answers)
    expect(d.state).toBe('4')
    const { container } = render(<EscalationLadder engineKey="passport" d={d} answers={answers} />)
    const rungs = Array.from(container.querySelectorAll('.lrung'))
    expect(rungs[0]).toHaveClass('next')
    expect(rungs[1]).toHaveClass('up')
    expect(rungs[2]).toHaveClass('up')
    expect(rungs[1].querySelector('.lr-tag')).toBeNull()
    expect(rungs[2].querySelector('.lr-tag')).toBeNull()
  })

  it('the caption is LADDER_DEFS.passport.caption verbatim', () => {
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const d = diagnose(passportEngine, answers)
    const { container } = render(<EscalationLadder engineKey="passport" d={d} answers={answers} />)
    expect(container.querySelector('.ladder-note')).toHaveTextContent(LADDER_DEFS.passport.caption)
  })

  it('the title is LADDER_DEFS.passport.title', () => {
    const answers = { q1: 'adverse', q2: 'formal_grievance' }
    const d = diagnose(passportEngine, answers)
    const { container } = render(<EscalationLadder engineKey="passport" d={d} answers={answers} />)
    expect(container.querySelector('.nm-k')).toHaveTextContent(LADDER_DEFS.passport.title)
  })
})
