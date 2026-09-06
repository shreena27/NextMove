/** Shared shape every question-flow screen component takes. Extracted out of
 *  PassportScreens.tsx/PassportRecovery.tsx (Task 4 duplicated this as an
 *  unexported local in both files) once Voter and SIR needed it too (Task 5).
 *
 *  RECORDED FIX: the duplication was originally excused as dodging oxlint's
 *  react/only-export-components warning, but that rule only fires on a file
 *  that exports a component — a shared, component-free module like this one
 *  never trips it, so the duplication bought nothing. Every screen file now
 *  imports both symbols from here instead of re-declaring them. */
import type { SessionState, SessionAction } from '../session/session'

export interface ScreenProps {
  state: SessionState
  dispatch: (action: SessionAction) => void
}

export function hasAnswers(state: SessionState): boolean {
  return Object.keys(state.answers).length > 0
}
