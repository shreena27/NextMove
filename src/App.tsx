import { useReducer } from 'react'
import { evaluate } from './domain/playbook'
import { passportPlaybook } from './playbooks/passportPlaybook'
import { caseSessionReducer, initialCaseSession, currentScreen, answerFor } from './state/caseSession'
import { Home } from './components/Home'
import { ScopeGuardrail } from './components/ScopeGuardrail'
import { QuestionScreen } from './components/QuestionScreen'
import { RecoveryFlow } from './components/RecoveryFlow'
import { DiagnosisScreen } from './components/DiagnosisScreen'
import { NextMoveCard } from './components/NextMoveCard'

const Q1_OPTIONS = [
  { value: 'no_contact', label: "I haven't heard anything about police verification yet" },
  {
    value: 'contacted_incomplete',
    label: "Someone from the police contacted me, but it isn't finished",
  },
  { value: 'verified_no_progress', label: "I think verification is done, but nothing's changed since" },
  { value: 'adverse', label: 'I saw something on the portal that looks negative or confusing' },
  { value: 'not_sure', label: "I'm not sure", sublabel: 'Show me how to find out', muted: true },
]

const Q2_OPTIONS = [
  { value: 'no_followup', label: 'No, not yet', sublabel: 'Most common answer' },
  { value: 'informal', label: 'Yes, informally', sublabel: 'Call, visit, or portal message' },
  { value: 'formal_grievance', label: 'Yes, I filed a formal grievance' },
]

const STATE_LABELS: Record<string, string> = {
  '1': 'Waiting for police verification to begin',
  '2': 'Verification in progress',
  '3': 'Verified, waiting on processing',
  '4': 'Adverse or unclear outcome',
  '5a': 'Followed up informally, unresolved',
  '5b': 'Formal grievance raised, unresolved',
  '6': 'Status unclear',
}

const ANSWER_LABELS: Record<string, string> = Object.fromEntries(
  [...Q1_OPTIONS, ...Q2_OPTIONS].map((o) => [o.value, o.label]),
)

function Shell({ children, onRestart }: { children: React.ReactNode; onRestart?: () => void }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-5 py-8">
        {children}
        {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            className="mt-10 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
          >
            Restart
          </button>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [session, dispatch] = useReducer(caseSessionReducer, initialCaseSession)
  const screen = currentScreen(session)
  const restart = () => dispatch({ type: 'RESTART' })
  const back = () => dispatch({ type: 'BACK' })

  if (screen === 'home') {
    return (
      <Shell>
        <Home onSelectPassport={() => dispatch({ type: 'NAVIGATE', screen: 'guardrail' })} />
      </Shell>
    )
  }

  if (screen === 'guardrail') {
    return (
      <Shell onRestart={restart}>
        <ScopeGuardrail
          onInScope={() => dispatch({ type: 'NAVIGATE', screen: 'q1' })}
          onOutOfScope={() => {}}
        />
      </Shell>
    )
  }

  if (screen === 'q1') {
    return (
      <Shell onRestart={restart}>
        <QuestionScreen
          questionNumber={1}
          totalQuestions={2}
          question="What's happening with your application?"
          subtext="Don't worry if you're not sure. Pick the closest option."
          options={Q1_OPTIONS}
          selectedValue={answerFor(session, 'q1')}
          onSelect={(value) =>
            dispatch({
              type: 'ANSWER',
              questionId: 'q1',
              value,
              nextScreen: value === 'not_sure' ? 'recovery' : 'q2',
            })
          }
          onBack={back}
        />
      </Shell>
    )
  }

  if (screen === 'q2') {
    return (
      <Shell onRestart={restart}>
        <QuestionScreen
          questionNumber={2}
          totalQuestions={2}
          question="Have you already tried to follow up on this?"
          options={Q2_OPTIONS}
          selectedValue={answerFor(session, 'q2')}
          onSelect={(value) =>
            dispatch({ type: 'ANSWER', questionId: 'q2', value, nextScreen: 'diagnosis' })
          }
          onBack={back}
        />
      </Shell>
    )
  }

  if (screen === 'recovery') {
    return (
      <Shell onRestart={restart}>
        <button
          type="button"
          onClick={back}
          className="mb-4 text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back
        </button>
        <RecoveryFlow
          onShowMeWhere={() => dispatch({ type: 'NAVIGATE', screen: 'q1' })}
          onResolved={(matchedStage) => {
            if (matchedStage) {
              dispatch({ type: 'ANSWER', questionId: 'q1', value: matchedStage, nextScreen: 'q2' })
            } else {
              dispatch({ type: 'NAVIGATE', screen: 'diagnosis' })
            }
          }}
        />
      </Shell>
    )
  }

  if (screen === 'diagnosis' || screen === 'nextmove' || screen === 'boundary') {
    // Diagnosis is always derived fresh from the current answers — never
    // cached — so a changed earlier answer is reflected immediately (FR-22).
    const diagnosis = evaluate(passportPlaybook, session.answers)
    const stateLabel = STATE_LABELS[diagnosis.state] ?? 'Status unclear'

    if (screen === 'diagnosis') {
      return (
        <Shell onRestart={restart}>
          <button
            type="button"
            onClick={back}
            className="mb-4 text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back
          </button>
          <DiagnosisScreen
            diagnosis={diagnosis}
            stateLabel={stateLabel}
            answerLabels={ANSWER_LABELS}
            onSeeNextMove={() => dispatch({ type: 'NAVIGATE', screen: 'nextmove' })}
          />
        </Shell>
      )
    }

    if (screen === 'nextmove') {
      return (
        <Shell onRestart={restart}>
          <button
            type="button"
            onClick={back}
            className="mb-4 text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back
          </button>
          <h1 className="mb-4 text-xl font-semibold text-slate-900">{stateLabel}</h1>
          <NextMoveCard
            recommendation={{
              what: diagnosis.whatToDo ?? '',
              why: diagnosis.explanation,
              where: diagnosis.action ?? { label: 'Passport Office' },
              whatYoullNeed: diagnosis.whatYoullNeed ?? '',
            }}
            onPrepare={() => dispatch({ type: 'NAVIGATE', screen: 'boundary' })}
          />
        </Shell>
      )
    }

    return (
      <Shell onRestart={restart}>
        <button
          type="button"
          onClick={back}
          className="mb-4 text-sm text-slate-500 hover:text-slate-800"
        >
          ← Back
        </button>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">You're all set for now.</h1>
        <p className="text-slate-600">
          Preparing your follow-up for you is coming in a future slice. NextMove has told you what
          your next move is — execution assistance comes next.
        </p>
      </Shell>
    )
  }

  return null
}
