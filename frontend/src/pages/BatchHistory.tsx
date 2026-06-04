import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, Inbox, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react'
import { getBatchJobs } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import type { BatchJobStatus } from '@/lib/types'

const statusConfig: Record<BatchJobStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  queued: { label: '排队中', color: 'text-text-tertiary', Icon: Clock },
  running: { label: '运行中', color: 'text-info-text', Icon: Loader2 },
  completed: { label: '已完成', color: 'text-success-text', Icon: CheckCircle2 },
  failed: { label: '失败', color: 'text-danger-text', Icon: XCircle },
  cancelled: { label: '已取消', color: 'text-warning-text', Icon: Ban },
}

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-3 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

export default function BatchHistory() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['batch-jobs', page],
    queryFn: () => getBatchJobs(page, pageSize),
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-text-primary text-base font-medium">批量推理历史</h1>
        <button
          onClick={() => navigate('/batch')}
          className="rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary transition-colors"
        >
          新建批量任务
        </button>
      </div>

      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        <table className={tableClass}>
          <thead>
            <tr>
              <th>任务 ID</th>
              <th>状态</th>
              <th>病人数</th>
              <th>图像数</th>
              <th>聚合策略</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-text-tertiary" />
                  <span className="text-text-secondary text-xs">加载中...</span>
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((job) => {
                const cfg = statusConfig[job.status] ?? statusConfig.failed
                const StatusIcon = cfg.Icon
                return (
                  <tr
                    key={job.job_id}
                    className="hover:bg-bg-secondary transition-colors cursor-pointer"
                    onClick={() => navigate(`/batch/${job.job_id}`)}
                  >
                    <td className="font-mono text-[11px] tabular-nums text-text-primary">
                      {job.job_id.slice(0, 12)}
                    </td>
                    <td>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
                        <StatusIcon className={`w-3 h-3 ${job.status === 'running' ? 'animate-spin' : ''}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="text-[11px] tabular-nums text-text-primary">
                      {job.succeeded_patients}/{job.total_patients}
                    </td>
                    <td className="text-[11px] tabular-nums text-text-secondary">
                      {job.completed_images}/{job.total_images}
                    </td>
                    <td className="text-[11px] text-text-secondary">{job.aggregation_strategy}</td>
                    <td className="text-[11px] text-text-secondary tabular-nums">
                      {job.started_at ? formatDateTime(job.started_at) : '—'}
                    </td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/batch/${job.job_id}`) }}
                        className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Inbox className="w-6 h-6 mx-auto mb-2 text-text-tertiary" />
                  <span className="text-text-secondary text-xs">暂无批量推理记录</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-text-secondary tabular-nums">
            共 {data?.total} 条，第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-md border border-border-secondary bg-bg-primary text-text-primary disabled:opacity-30 hover:bg-bg-tertiary transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded-md border border-border-secondary bg-bg-primary text-text-primary disabled:opacity-30 hover:bg-bg-tertiary transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
