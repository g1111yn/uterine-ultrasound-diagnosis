import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AiSuggestionPanel from './AiSuggestionPanel'

describe('AiSuggestionPanel', () => {
  it('presents the model result as a read-only AI suggestion', () => {
    render(
      <AiSuggestionPanel
        predictedClass="polyp"
        predictedClassZh="息肉"
        confidence={0.823}
        probabilities={{ normal: 0.1, endometrial_cancer: 0.077, polyp: 0.823 }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'AI 辅助建议' })).toBeVisible()
    expect(screen.getAllByText('息肉').length).toBeGreaterThan(0)
    expect(screen.getAllByText('82.3%').length).toBeGreaterThan(0)
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存判断' })).not.toBeInTheDocument()
  })
})
