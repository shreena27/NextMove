import { describe, it, expect } from 'vitest'
import { caseSessionReducer, initialCaseSession } from './caseSession'

describe('caseSessionReducer', () => {
  it('starts at home with no answers', () => {
    expect(initialCaseSession.screenHistory).toEqual(['home'])
    expect(initialCaseSession.answers).toEqual([])
  })

  it('ANSWER stores the answer and navigates to the next screen', () => {
    const state = caseSessionReducer(initialCaseSession, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })

    expect(state.answers).toEqual([{ questionId: 'q1', value: 'no_contact' }])
    expect(state.screenHistory).toEqual(['home', 'q2'])
  })

  it('ANSWER updates an existing answer for the same question rather than duplicating it', () => {
    let state = caseSessionReducer(initialCaseSession, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })
    state = caseSessionReducer(state, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'adverse',
      nextScreen: 'q2',
    })

    expect(state.answers).toEqual([{ questionId: 'q1', value: 'adverse' }])
  })

  it('changing Q1 clears any existing Q2 answer (stage-change resets follow-up)', () => {
    let state = caseSessionReducer(initialCaseSession, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })
    state = caseSessionReducer(state, {
      type: 'ANSWER',
      questionId: 'q2',
      value: 'informal',
      nextScreen: 'diagnosis',
    })
    // user goes back and changes Q1
    state = caseSessionReducer(state, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'adverse',
      nextScreen: 'q2',
    })

    expect(state.answers).toEqual([{ questionId: 'q1', value: 'adverse' }])
  })

  it('re-answering Q1 with the SAME value does not clear the existing Q2 answer', () => {
    let state = caseSessionReducer(initialCaseSession, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })
    state = caseSessionReducer(state, {
      type: 'ANSWER',
      questionId: 'q2',
      value: 'informal',
      nextScreen: 'diagnosis',
    })
    state = caseSessionReducer(state, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })

    expect(state.answers).toHaveLength(2)
    expect(state.answers).toEqual(
      expect.arrayContaining([
        { questionId: 'q1', value: 'no_contact' },
        { questionId: 'q2', value: 'informal' },
      ]),
    )
  })

  it('BACK returns to the previous screen without clearing that screen\'s answer', () => {
    let state = caseSessionReducer(initialCaseSession, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })
    state = caseSessionReducer(state, { type: 'BACK' })

    expect(state.screenHistory).toEqual(['home'])
    expect(state.answers).toEqual([{ questionId: 'q1', value: 'no_contact' }])
  })

  it('BACK at the initial screen is a no-op', () => {
    const state = caseSessionReducer(initialCaseSession, { type: 'BACK' })

    expect(state).toEqual(initialCaseSession)
  })

  it('NAVIGATE moves to a screen without recording any answer', () => {
    const state = caseSessionReducer(initialCaseSession, { type: 'NAVIGATE', screen: 'guardrail' })

    expect(state.screenHistory).toEqual(['home', 'guardrail'])
    expect(state.answers).toEqual([])
  })

  it('RESTART clears all answers and history back to home', () => {
    let state = caseSessionReducer(initialCaseSession, {
      type: 'ANSWER',
      questionId: 'q1',
      value: 'no_contact',
      nextScreen: 'q2',
    })
    state = caseSessionReducer(state, { type: 'RESTART' })

    expect(state).toEqual(initialCaseSession)
  })
})
