import { useQuery } from '@tanstack/react-query'
import { Activity, Cpu, Clock, Loader2, Layers } from 'lucide-react'
import { getHealth } from '@/api/client'

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return `${m} 分 ${s} 秒`
  return `${s} 秒`
}

export default function AdminStats() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-health'],
    queryFn: getHealth,
    refetchInterval: 10000,
  })

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-text-primary">系统统计</h1>
        <p className="text-[11px] text-text-tertiary mt-0.5">
          实时服务状态 · 每 10 秒自动刷新
        </p>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-border bg-bg-primary p-12 flex flex-col items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin mb-2 text-text-tertiary" />
          <span className="text-xs text-text-secondary">正在连接后端服务...</span>
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
          无法连接后端：{(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard
              icon={Activity}
              label="服务状态"
              value={data.status === 'ok' ? '运行中' : '异常'}
              ok={data.status === 'ok'}
            />
            <StatCard
              icon={Cpu}
              label="模型加载"
              value={data.model_loaded ? '已加载' : '未加载'}
              ok={data.model_loaded}
            />
            <StatCard
              icon={Layers}
              label="队列长度"
              value={String(data.queue_length ?? 0)}
            />
            <StatCard
              icon={Clock}
              label="运行时间"
              value={formatUptime(data.uptime_seconds)}
            />
          </div>

          <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-3">
            <h2 className="text-xs font-medium text-text-secondary">服务详情</h2>
            <DetailRow label="模型版本" value={data.model_version} mono />
            <DetailRow
              label="Uptime"
              value={`${data.uptime_seconds.toFixed(0)} 秒`}
              mono
            />
            <DetailRow label="Queue length" value={String(data.queue_length ?? 0)} mono />
          </div>

          <div className="rounded-md border border-border bg-bg-tertiary p-3 mt-4 text-[11px] text-text-tertiary">
            V1.6 将扩展更多 metrics（推理吞吐、QPS、GPU 占用等）。
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  ok?: boolean
}) {
  const valueClass =
    ok === false
      ? 'text-danger-text'
      : ok === true
      ? 'text-success-text'
      : 'text-text-primary'
  return (
    <div className="rounded-md border border-border bg-bg-primary p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3 h-3 text-text-tertiary" />
        <span className="text-[10px] text-text-secondary tracking-wide">{label}</span>
      </div>
      <div className={`text-base font-medium tabular-nums ${valueClass}`}>{value}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className={`text-text-primary ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  )
}
