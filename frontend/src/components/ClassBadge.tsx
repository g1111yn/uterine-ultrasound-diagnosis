import type { ClassificationClass } from '@/lib/classification'

const config: Record<ClassificationClass, { label: string; className: string }> = {
  normal: { label: '正常', className: 'bg-success-bg text-success-text' },
  endometrial_cancer: { label: '内膜癌', className: 'bg-danger-bg text-danger-text' },
  polyp: { label: '息肉', className: 'bg-warning-bg text-warning-text' },
  indeterminate: { label: '无法判断', className: 'bg-bg-tertiary text-text-secondary' },
}

const fallback = { label: '—', className: 'bg-bg-tertiary text-text-secondary' }

interface Props {
  type?: ClassificationClass | null
  confidence?: number
  showDot?: boolean
  label?: string
}

export default function ClassBadge({ type, confidence, showDot = false, label }: Props) {
  const cfg = type ? config[type] : fallback
  const display = label ?? cfg.label
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${cfg.className}`}
    >
      {showDot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: 'currentColor' }}
        />
      )}
      {display}
      {confidence !== undefined && (
        <span className="tabular-nums">{` ${(confidence * 100).toFixed(0)}%`}</span>
      )}
    </span>
  )
}
