import type { ReactNode } from 'react'

interface Props {
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

export default function ClinicalWorkbench({ left, center, right }: Props) {
  return (
    <div
      data-testid="clinical-workbench"
      className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]"
    >
      <section aria-label="病例信息" className="min-w-0 self-start">
        {left}
      </section>
      <section aria-label="影像阅片" className="min-w-0 self-start">
        {center}
      </section>
      <section aria-label="医生确认" className="min-w-0 self-start xl:sticky xl:top-4">
        {right}
      </section>
    </div>
  )
}
