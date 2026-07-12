import ClassBadge from './ClassBadge'
import ProbabilityBars from './ProbabilityBars'
import type { PredictedClass, Probabilities } from '@/lib/types'

interface Props {
  predictedClass: PredictedClass
  predictedClassZh: string
  confidence: number
  probabilities: Probabilities
  detail?: string
}

export default function AiSuggestionPanel({
  predictedClass,
  predictedClassZh,
  confidence,
  probabilities,
  detail,
}: Props) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-4">
      <h2 className="text-xs font-medium text-text-secondary">AI 辅助建议</h2>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-xl font-medium text-text-primary">{predictedClassZh}</span>
        <ClassBadge
          type={predictedClass}
          label={predictedClassZh}
          confidence={confidence}
        />
      </div>
      <ProbabilityBars probabilities={probabilities} />
      {detail && <div className="text-[10px] text-text-tertiary tabular-nums">{detail}</div>}
    </section>
  )
}
