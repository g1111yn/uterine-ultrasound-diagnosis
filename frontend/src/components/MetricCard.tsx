interface Props {
  label: string
  value: string | number
  sub?: string
  color?: 'success' | 'warning' | 'danger'
}

const colorMap = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
}

export default function MetricCard({ label, value, sub, color }: Props) {
  const colorClass = color ? colorMap[color] : 'text-text-primary'
  return (
    <div className="bg-bg-tertiary rounded-md px-3 py-2.5">
      <div className="text-[10px] text-text-secondary mb-1 tracking-wide">{label}</div>
      <div className={`text-lg font-medium tabular-nums ${colorClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-tertiary mt-0.5 tabular-nums">{sub}</div>}
    </div>
  )
}
