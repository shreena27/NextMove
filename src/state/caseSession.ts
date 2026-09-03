import type { Answer } from '../domain/types'

export interface CaseSession {
  answers: Answer[]
  screenHistory: string[]
}

export const initialCaseSession: CaseSession = {
  answers: [],
  screenHistory: ['home'],
}

export type CaseSessionAction =
  | { type: 'ANSWER'; questionId: string; value: string; nextScreen: string }
  | { type: 'NAVIGATE'; screen: string }
  | { type: 'BACK' }
  | { type: 'RESTART' }

export function currentScreen(state: CaseSession): string {
  return state.screenHistory[state.screenHistory.length - 1]
}

export function answerFor(state: CaseSession, questionId: string): string | undefined {
  return state.answers.find((a) => a.questionId === questionId)?.value
}

export function caseSessionReducer(
  state: CaseSession,
  action: CaseSessionAction,
): CaseSession {
  switch (action.type) {
    case 'ANSWER': {
      const { questionId, value, nextScreen } = action
      const previousValue = answerFor(state, questionId)
      let answers = state.answers.filter((a) => a.questionId !== questionId)
      answers = [...answers, { questionId, value }]

      // Changing Q1 to a different stage invalidates any existing Q2 answer —
      // a follow-up answer given for the old stage shouldn't silently carry
      // over to the new one. Re-answering Q1 with the same value is not a
      // change, so Q2 is left alone.
      if (questionId === 'q1' && previousValue !== undefined && previousValue !== value) {
        answers = answers.filter((a) => a.questionId !== 'q2')
      }

      return {
        answers,
        screenHistory: [...state.screenHistory, nextScreen],
      }
    }
    case 'NAVIGATE':
      return { ...state, screenHistory: [...state.screenHistory, action.screen] }
    case 'BACK': {
      if (state.screenHistory.length <= 1) return state
      return {
        ...state,
        screenHistory: state.screenHistory.slice(0, -1),
      }
    }
    case 'RESTART':
      return initialCaseSession
  }
}
