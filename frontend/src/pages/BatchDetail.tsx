import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cancelBatch, getBatchStatus, getCaseDetail, getImageUrl } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import ClassBadge from '@/components/ClassBadge'
import ProbabilityBars from '@/components/ProbabilityBars'
import { classFromLabel } from '@/lib/classification'
import type { BatchJobStatus, BatchResultItem } from '@/lib/types'
import BatchNav from '@/components/BatchNav'
import WorkspaceContainer from '@/components/WorkspaceContainer'

const CLASS_COLORS: Record<string, string> = {
  normal: 'border-success-border bg-success-bg text-success-text',
  endometrial_cancer: 'border-danger-border bg-danger-bg text-danger-text',
  polyp: 'border-warning-border bg-warning-bg text-warning-text',
}

function SummaryBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-text-secondary w-12 shrink-0">{label}</span>
      <div className="flex-1 h-4 rounded-sm overflow-hidden bg-border">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-text-primary w-16 text-right">
        {count} ({pct.toFixed(0)}%)
      </span>
    </div>
  )
}

function PatientCard({
  item,
  isActive,
  onClick,
}: {
  item: BatchResultItem
  isActive: boolean
  onClick: () => void
}) {
  const colorClass = item.predicted_class
    ? CLASS_COLORS[item.predicted_class] ?? 'border-border bg-bg-secondary text-text-tertiary'
    : 'border-border bg-bg-secondary text-text-tertiary'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border px-3 py-2 transition-all ${
        isActive
          ? 'ring-2 ring-accent ring-offset-1 ' + colorClass
          : colorClass + ' hover:opacity-80'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-medium truncate">
          {item.patient_no}
        </span>
        <span className="text-[10px] tabular-nums shrink-0">
          {item.confidence !== null ? `${(item.confidence * 100).toFixed(0)}%` : '—'}
        </span>
      </div>
      {item.predicted_class_zh && (
        <div className="text-[10px] mt-0.5 font-medium">{item.predicted_class_zh}</div>
      )}
      {item.error && (
        <div className="text-[10px] mt-0.5 text-danger-text">{item.error}</div>
      )}
    </button>
  )
}

function PatientDetail({ caseId }: { caseId: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['case-detail', caseId],
    queryFn: () => getCaseDetail(caseId),
    enabled: !!caseId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-text-primary">
            患者 {data.patient_no}
          </div>
          <div className="text-[11px] text-text-tertiary mt-0.5">
            {formatDateTime(data.created_at)}
          </div>
        </div>
        <button
          onClick={() => navigate(`/case/${caseId}`)}
          className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
        >
          打开完整详情
        </button>
      </div>

      {data.clinical_text && (
        <div className="rounded-md border border-border bg-bg-secondary px-3 py-2">
          <div className="text-[10px] text-text-tertiary mb-1">检查所见</div>
          <div className="text-xs text-text-primary leading-relaxed">
            {data.clinical_text}
          </div>
        </div>
      )}

      {data.prediction && (
        <div className="rounded-md border border-border bg-bg-secondary px-3 py-2.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-text-tertiary">患者级聚合预测</div>
            <ClassBadge
              type={classFromLabel(data.prediction.predicted_class_zh)}
              label={data.prediction.predicted_class_zh}
              confidence={data.prediction.confidence}
            />
          </div>
          <ProbabilityBars probabilities={data.prediction.probabilities} />
        </div>
      )}

      {data.images.length > 0 && (
        <div>
          <div className="text-[10px] text-text-tertiary mb-2">
            逐图预测（{data.images.length} 张）
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.images.map((img) => (
              <div key={img.image_id} className="rounded-md border border-border overflow-hidden bg-bg-secondary">
                <img
                  src={getImageUrl(img.image_id)}
                  alt={img.original_filename}
                  className="w-full h-32 object-cover"
                  loading="lazy"
                />
                {img.per_image_prediction && (
                  <div className="px-2 py-1.5 flex items-center justify-between">
                    <ClassBadge
                      type={classFromLabel(img.per_image_prediction.predicted_class_zh)}
                      label={img.per_image_prediction.predicted_class_zh}
                      showDot
                    />
                    <span className="text-[10px] tabular-nums text-text-secondary">
                      {(img.per_image_prediction.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function BatchCancelButton({ jobId, status }: { jobId: string; status: BatchJobStatus }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => cancelBatch(jobId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['batch-status', jobId] }),
        queryClient.invalidateQueries({ queryKey: ['batch-jobs'] }),
      ])
    },
  })

  if (status !== 'queued' && status !== 'running') return null

  const requestCancel = () => {
    if (window.confirm('确定要取消这个批量任务吗？已完成的结果将保留。')) {
      mutation.mutate()
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={requestCancel}
        disabled={mutation.isPending}
        className="rounded-md border border-danger-border bg-danger-bg px-3 py-1.5 text-xs font-medium text-danger-text hover:opacity-80 disabled:opacity-50 transition-opacity"
      >
        {mutation.isPending ? '正在取消...' : '取消任务'}
      </button>
      {mutation.isError && (
        <span role="alert" className="text-[11px] text-danger-text">
          {mutation.error.message}
        </span>
      )}
    </div>
  )
}

export default function BatchDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['batch-status', jobId],
    queryFn: () => getBatchStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' || s === 'queued' ? 3000 : false
    },
  })

  if (isLoading || !data) {
    return (
      <WorkspaceContainer className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />
      </WorkspaceContainer>
    )
  }

  const completedResults = data.results.filter((r) => r.predicted_class)
  const selected = selectedCaseId ?? (completedResults[0]?.case_id || null)

  const isRunning = data.status === 'running' || data.status === 'queued'
  const isDone = data.status === 'completed'
  const progressPct = data.total_patients > 0
    ? Math.round((data.completed_patients / data.total_patients) * 100)
    : 0

  // 分类统计
  const normalCount = completedResults.filter((r) => r.predicted_class === 'normal').length
  const polypCount = completedResults.filter((r) => r.predicted_class === 'polyp').length
  const cancerCount = completedResults.filter((r) => r.predicted_class === 'endometrial_cancer').length
  const totalCompleted = completedResults.length

  return (
    <WorkspaceContainer>
      <BatchNav />
      {/* 顶部 */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate('/batch/history')}
          className="p-1 rounded-md hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-text-secondary" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-text-primary text-base font-medium">
            批量任务 {data.job_id.slice(0, 12)}
          </h1>
          <div className="text-[11px] text-text-tertiary mt-0.5 tabular-nums">
            {data.total_patients} 病人 · {data.total_images} 图像 · {data.aggregation_strategy}
            {data.started_at && ` · ${formatDateTime(data.started_at)}`}
          </div>
        </div>
        <BatchCancelButton jobId={data.job_id} status={data.status} />
      </div>

      {data.status === 'failed' && data.error && (
        <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text mb-4">
          {data.error}
        </div>
      )}

      {/* 进度条（运行中时显示） */}
      {isRunning && (
        <div className="rounded-lg border border-border bg-bg-primary p-4 mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
              <span className="text-xs font-medium text-text-primary">
                正在推理中...
                {data.current_patient && ` 当前：${data.current_patient}`}
              </span>
            </div>
            <span className="text-xs tabular-nums text-text-secondary font-medium">
              {data.completed_patients}/{data.total_patients} 病人 · {progressPct}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-border">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                backgroundColor: 'var(--color-accent)',
              }}
            />
          </div>
          <div className="text-[11px] text-text-tertiary">
            已完成 {data.completed_images}/{data.total_images} 张图像
            {data.estimated_remaining_ms > 0 && (
              <span> · 预计还需 {Math.ceil(data.estimated_remaining_ms / 1000)} 秒</span>
            )}
          </div>
        </div>
      )}

      {/* 汇总图（完成后显示） */}
      {isDone && totalCompleted > 0 && (
        <div className="rounded-lg border border-border bg-bg-primary p-4 mb-4">
          <div className="text-[11px] font-medium text-text-secondary mb-3">分类汇总</div>
          <div className="flex items-center gap-4">
            {/* 条状图 */}
            <div className="flex-1 space-y-2">
              <SummaryBar label="正常" count={normalCount} total={totalCompleted} color="var(--color-success-border)" />
              <SummaryBar label="息肉" count={polypCount} total={totalCompleted} color="var(--color-warning-border)" />
              <SummaryBar label="内膜癌" count={cancerCount} total={totalCompleted} color="var(--color-danger-border)" />
            </div>
            {/* 数字统计 */}
            <div className="shrink-0 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-medium tabular-nums text-success-text">{normalCount}</div>
                <div className="text-[10px] text-text-tertiary">正常</div>
              </div>
              <div>
                <div className="text-lg font-medium tabular-nums text-warning-text">{polypCount}</div>
                <div className="text-[10px] text-text-tertiary">息肉</div>
              </div>
              <div>
                <div className="text-lg font-medium tabular-nums text-danger-text">{cancerCount}</div>
                <div className="text-[10px] text-text-tertiary">内膜癌</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 主体：左侧病人列表 + 右侧详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* 左侧病人列表 */}
        <div className="rounded-lg border border-border bg-bg-primary p-3 space-y-1.5 max-h-[calc(100vh-160px)] overflow-y-auto lg:sticky lg:top-4 self-start">
          <div className="text-[10px] text-text-tertiary font-medium mb-2 uppercase tracking-wider">
            病人列表（{data.results.length}）
          </div>
          {data.results.map((item) => (
            <PatientCard
              key={item.case_id ?? item.patient_no}
              item={item}
              isActive={item.case_id === selected}
              onClick={() => item.case_id && setSelectedCaseId(item.case_id)}
            />
          ))}
        </div>

        {/* 右侧详情 */}
        <div className="rounded-lg border border-border bg-bg-primary p-5 min-h-[400px]">
          {selected ? (
            <PatientDetail caseId={selected} />
          ) : (
            <div className="flex items-center justify-center h-64 text-xs text-text-tertiary">
              点击左侧病人查看详情
            </div>
          )}
        </div>
      </div>
    </WorkspaceContainer>
  )
}
