import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { QuestionScreen } from './QuestionScreen'

const options = [
  { value: 'no_contact', label: "I haven't heard from the police yet" },
  { value: 'contacted_incomplete', label: 'Someone contacted me, not finished' },
  { value: 'not_sure', label: "I'm not sure", muted: true },
]

describe('QuestionScreen', () => {
  it('renders one question per screen with all its options', () => {
    render(
      <QuestionScreen
        questionNumber={1}
        totalQuestions={2}
        question="What's happening with your application?"
        options={options}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByText("What's happening with your application?")).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
    for (const o of options) {
      expect(screen.getByRole('button', { name: new RegExp(o.label) })).toBeInTheDocument()
    }
  })

  it('calls onSelect with the option value when an option is chosen', async () => {
    const onSelect = vi.fn()
    render(
      <QuestionScreen
        questionNumber={1}
        totalQuestions={2}
        question="Q"
        options={options}
        onSelect={onSelect}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /not finished/ }))

    expect(onSelect).toHaveBeenCalledWith('contacted_incomplete')
  })

  it('shows visible back navigation and calls onBack when clicked', async () => {
    const onBack = vi.fn()
    render(
      <QuestionScreen
        questionNumber={2}
        totalQuestions={2}
        question="Q"
        options={options}
        onSelect={() => {}}
        onBack={onBack}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /back/i }))

    expect(onBack).toHaveBeenCalledOnce()
  })

  it('does not render a back control when onBack is not provided (first screen)', () => {
    render(
      <QuestionScreen
        questionNumber={1}
        totalQuestions={2}
        question="Q"
        options={options}
        onSelect={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })
})
