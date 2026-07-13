import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock3,
  type LucideIcon,
} from 'lucide-react'
import type { BatchResultItem } from '@/lib/types'

export type BatchPatientFilter = 'all' | 'unjudged' | 'judged' | 'failed'

// The filter is exported with the component so page logic and tests share one rule.
// eslint-disable-next-line react-refresh/only-export-components
export function matchesBatchPatientFilter(
  item: BatchResultItem,
  filter: BatchPatientFilter,
) {
  if (filter === 'unjudged') return !!item.predicted_class && !item.has_judgment
  if (filter === 'judged') return item.has_judgment
  if (filter === 'failed') return !!item.error
  return true
}

interface BatchPatientQueueProps {
  results: BatchResultItem[]
  filter: BatchPatientFilter
  selectedCaseId: string | null
  onFilterChange: (filter: BatchPatientFilter) => void
  onSelect: (caseId: string) => void
}

const FILTERS: Array<{ value: BatchPatientFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unjudged', label: '未诊断' },
  { value: 'judged', label: '已诊断' },
  { value: 'failed', label: '推理失败' },
]

const CLASS_COLORS: Record<string, string> = {
  normal: 'border-success-border bg-success-bg text-success-text',
  endometrial_cancer: 'border-danger-border bg-danger-bg text-danger-text',
  polyp: 'border-warning-border bg-warning-bg text-warning-text',
}

interface PatientStatus {
  label: string
  className: string
  Icon: LucideIcon
}

function getPatientStatus(item: BatchResultItem): PatientStatus {
  if (item.error) {
    return {
      label: '推理失败',
      className: 'text-danger-text',
      Icon: AlertCircle,
    }
  }
  if (!item.predicted_class) {
    return {
      label: '等待推理',
      className: 'text-text-tertiary',
      Icon: Clock3,
    }
  }
  if (item.has_judgment) {
    return {
      label: '已诊断',
      className: 'text-success-text',
      Icon: CheckCircle2,
    }
  }
  return {
    label: '未诊断',
    className: 'text-accent',
    Icon: Circle,
  }
}

function PatientButton({
  item,
  selected,
  onSelect,
}: {
  item: BatchResultItem
  selected: boolean
  onSelect: (caseId: string) => void
}) {
  const status = getPatientStatus(item)
  const colorClass = item.predicted_class
    ? CLASS_COLORS[item.predicted_class] ?? 'border-border bg-bg-secondary text-text-primary'
    : 'border-border bg-bg-secondary text-text-primary'
  const confidence = item.confidence !== null
    ? `${(item.confidence * 100).toFixed(0)}%`
    : null
  const aiSummary = item.predicted_class_zh && confidence
    ? `，AI ${item.predicted_class_zh} ${confidence}`
    : ''

  return (
    <button
      type="button"
      aria-label={`患者 ${item.patient_no}，${status.label}${aiSummary}`}
      aria-pressed={selected}
      disabled={item.case_id === null}
      onClick={() => {
        if (item.case_id !== null) onSelect(item.case_id)
      }}
      className={`w-40 shrink-0 rounded-md border px-3 py-2 text-left transition-all lg:w-full ${
        selected
          ? `ring-2 ring-accent ring-offset-1 ${colorClass}`
          : `${colorClass} enabled:hover:opacity-80 disabled:cursor-default`
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs font-medium">{item.patient_no}</span>
        {confidence && (
          <span className="shrink-0 text-[10px] tabular-nums">{confidence}</span>
        )}
      </span>
      <span className="mt-0.5 block min-h-4 truncate text-[10px] font-medium">
        {item.predicted_class_zh ?? '暂无 AI 结果'}
      </span>
      <span className={`mt-1 flex items-center gap-1 text-[10px] ${status.className}`}>
        <status.Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span>{status.label}</span>
      </span>
      {item.error && (
        <span className="mt-0.5 block truncate text-[10px] text-danger-text">
          {item.error}
        </span>
      )}
    </button>
  )
}

export default function BatchPatientQueue({
  results,
  filter,
  selectedCaseId,
  onFilterChange,
  onSelect,
}: BatchPatientQueueProps) {
  const counts = Object.fromEntries(
    FILTERS.map(({ value }) => [
      value,
      results.filter((item) => matchesBatchPatientFilter(item, value)).length,
    ]),
  ) as Record<BatchPatientFilter, number>
  const visibleResults = results.filter((item) => matchesBatchPatientFilter(item, filter))
  const judgedCount = results.filter((item) => item.has_judgment).length
  const diagnosableCount = results.filter((item) => !!item.predicted_class).length

  return (
    <section
      aria-label="批量患者队列"
      className="flex min-h-0 flex-col rounded-lg border border-border bg-bg-primary p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" aria-label="患者筛选">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              aria-label={`${label} ${counts[value]}`}
              onClick={() => onFilterChange(value)}
              className={`whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                filter === value
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-bg-secondary text-text-secondary hover:border-border-secondary hover:text-text-primary'
              }`}
            >
              {label} {counts[value]}
            </button>
          ))}
        </div>
        <div className="whitespace-nowrap text-[10px] tabular-nums text-text-secondary">
          已诊断 {judgedCount} / 可诊断 {diagnosableCount}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0">
        {visibleResults.map((item) => (
          <PatientButton
            key={item.case_id ?? item.patient_no}
            item={item}
            selected={item.case_id !== null && item.case_id === selectedCaseId}
            onSelect={onSelect}
          />
        ))}
        {visibleResults.length === 0 && (
          <div className="flex min-h-20 w-full items-center justify-center text-xs text-text-tertiary">
            当前筛选下暂无患者
          </div>
        )}
      </div>
    </section>
  )
}
