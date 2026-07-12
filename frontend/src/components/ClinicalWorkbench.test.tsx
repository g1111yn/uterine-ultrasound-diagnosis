import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ClinicalWorkbench from './ClinicalWorkbench'
import WorkspaceContainer from './WorkspaceContainer'

afterEach(cleanup)

describe('ClinicalWorkbench', () => {
  it('renders the clinical reading order as three named regions', () => {
    render(
      <ClinicalWorkbench
        left={<div>左侧内容</div>}
        center={<div>中间内容</div>}
        right={<div>右侧内容</div>}
      />,
    )

    const regions = screen.getAllByRole('region')
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      '病例信息',
      '影像阅片',
      '医生确认',
    ])
    expect(regions[0]).toHaveTextContent('左侧内容')
    expect(regions[1]).toHaveTextContent('中间内容')
    expect(regions[2]).toHaveTextContent('右侧内容')
  })

  it('uses the wide desktop grid and keeps doctor confirmation sticky', () => {
    render(<ClinicalWorkbench left="病例" center="影像" right="确认" />)

    const workbench = screen.getByTestId('clinical-workbench')
    const doctorRegion = screen.getByRole('region', { name: '医生确认' })

    expect(workbench).toHaveClass(
      'grid',
      'grid-cols-1',
      'gap-4',
      'xl:grid-cols-[240px_minmax(0,1fr)_360px]',
    )
    expect(doctorRegion).toHaveClass('xl:sticky', 'xl:top-4', 'self-start')
  })
})

describe('WorkspaceContainer', () => {
  it('provides the shared 1600px workspace width without adding a card', () => {
    render(<WorkspaceContainer>工作区</WorkspaceContainer>)

    expect(screen.getByText('工作区')).toHaveClass(
      'w-full',
      'max-w-[1600px]',
      'mx-auto',
    )
  })

  it('merges an explicit max width without retaining the default conflict', () => {
    render(<WorkspaceContainer className="max-w-6xl">窄工作区</WorkspaceContainer>)

    const container = screen.getByText('窄工作区')
    expect(container).toHaveClass('w-full', 'max-w-6xl', 'mx-auto')
    expect(container).not.toHaveClass('max-w-[1600px]')
  })
})
