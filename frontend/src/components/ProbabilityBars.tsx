import type { Probabilities } from '@/lib/types'

type ProbColor = 'danger' | 'warning' | 'success'

const colorMap: Record<ProbColor, string> = {
  danger: 'var(--color-danger-text)',
  warning: 'var(--color-warning-text)',
  success: 'var(--color-success-text)',
}

const items: { key: keyof Probabilities; label: string; color: ProbColor }[] = [
  { key: 'endometrial_cancer', label: '子宫内膜癌', color: 'danger' },
  { key: 'polyp', label: '息肉', color: 'warning' },
  { key: 'normal', label: '子宫正常大', color: 'success' },
]

interface Props {
  probabilities: Probabilities
}

export default function ProbabilityBars({ probabilities }: Props) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const value = probabilities[item.key]
        return (
          <div key={item.key} className="flex items-center gap-2.5 text-xs">
            <span className="w-[78px] text-text-secondary">{item.label}</span>
            <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${value * 100}%`,
                  backgroundColor: colorMap[item.color],
                }}
              />
            </div>
            <span className="w-[42px] text-right tabular-nums text-text-primary">
              {(value * 100).toFixed(1)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}
