import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { cancelBatch, getBatchStatus } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import type { BatchJobStatus } from '@/lib/types'
import BatchNav from '@/components/BatchNav'
import BatchPatientDiagnosis from '@/components/BatchPatientDiagnosis'
import BatchPatientQueue, {
  matchesBatchPatientFilter,
  type BatchPatientFilter,
} from '@/components/BatchPatientQueue'
import ClinicalWorkbench from '@/components/ClinicalWorkbench'
import WorkspaceContainer from '@/components/WorkspaceContainer'

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

const stablePanelClass =
  'flex min-h-[420px] items-center justify-center rounded-md border border-border bg-bg-primary p-4'

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
  const [filter, setFilter] = useState<BatchPatientFilter>('unjudged')
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [judgmentDirty, setJudgmentDirty] = useState(false)
  const [diagnosisVersion, setDiagnosisVersion] = useState(0)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['batch-status', jobId],
    queryFn: () => getBatchStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' || s === 'queued' ? 3000 : false
    },
  })

  /* eslint-disable react-hooks/set-state-in-effect -- polling payloads initialize or repair selection. */
  useEffect(() => {
    if (!data) return

    const selectionStillExists = selectedCaseId !== null && data.results.some(
      (item) => item.case_id === selectedCaseId,
    )
    if (selectionStillExists) return

    const firstUnjudged = data.results.find(
      (item) => item.case_id !== null && matchesBatchPatientFilter(item, 'unjudged'),
    )
    if (firstUnjudged?.case_id) {
      setFilter('unjudged')
      setSelectedCaseId(firstUnjudged.case_id)
      return
    }

    const firstSuccessful = data.results.find(
      (item) => item.case_id !== null && !item.error && !!item.predicted_class,
    )
    if (firstSuccessful?.case_id) {
      setFilter('all')
      setSelectedCaseId(firstSuccessful.case_id)
    }
  }, [data, selectedCaseId])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (isError) {
    return (
      <WorkspaceContainer>
        <BatchNav />
        <div className="rounded-lg border border-danger-border bg-danger-bg p-5">
          <div role="alert" className="text-xs text-danger-text">
            批量任务详情加载失败：{error.message}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <Link
              to="/batch/history"
              className="rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              返回批量任务历史
            </Link>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
            >
              重新加载批量任务详情
            </button>
          </div>
        </div>
      </WorkspaceContainer>
    )
  }

  if (isLoading || !data) {
    return (
      <WorkspaceContainer className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />
      </WorkspaceContainer>
    )
  }

  const completedResults = data.results.filter((r) => r.predicted_class)
  const diagnosableResults = data.results.filter(
    (item) => !!item.predicted_class && !item.error,
  )
  const diagnosedCount = diagnosableResults.filter((item) => item.has_judgment).length
  const selectedItem = selectedCaseId
    ? data.results.find((item) => item.case_id === selectedCaseId) ?? null
    : null

  const confirmDirtyTransition = () => (
    !judgmentDirty || window.confirm('医生判断尚未保存，确定要切换患者吗？')
  )
  const selectPatient = (caseId: string) => {
    if (caseId === selectedCaseId || !confirmDirtyTransition()) return
    setJudgmentDirty(false)
    setCompletionMessage(null)
    setSelectedCaseId(caseId)
  }
  const changeFilter = (nextFilter: BatchPatientFilter) => {
    if (nextFilter === filter || !confirmDirtyTransition()) return
    if (judgmentDirty) {
      setJudgmentDirty(false)
      setDiagnosisVersion((version) => version + 1)
    }
    setCompletionMessage(null)
    setFilter(nextFilter)
  }
  const saveAndSelectNext = (caseId: string) => {
    const currentIndex = data.results.findIndex((item) => item.case_id === caseId)
    const count = data.results.length
    for (let offset = 1; offset < count; offset += 1) {
      const index = (currentIndex + offset + count) % count
      const candidate = data.results[index]
      if (
        candidate.case_id !== null &&
        candidate.case_id !== caseId &&
        matchesBatchPatientFilter(candidate, 'unjudged')
      ) {
        setCompletionMessage(null)
        setFilter('unjudged')
        setSelectedCaseId(candidate.case_id)
        return
      }
    }
    setCompletionMessage('本批次已全部诊断')
  }

  const queue = (
    <BatchPatientQueue
      results={data.results}
      filter={filter}
      selectedCaseId={selectedCaseId}
      onFilterChange={changeFilter}
      onSelect={selectPatient}
    />
  )

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
  const hasAnotherUnjudged = data.results.some(
    (item) => item.case_id !== selectedCaseId && matchesBatchPatientFilter(item, 'unjudged'),
  )
  const visibleCompletionMessage = hasAnotherUnjudged ? null : completionMessage

  let workbench
  if (selectedItem?.case_id && selectedItem.error) {
    const fullDetailLink = (
      <Link
        to={`/case/${selectedItem.case_id}`}
        className="text-[11px] font-medium text-accent transition-colors hover:text-accent-hover"
      >
        打开完整详情
      </Link>
    )
    workbench = (
      <ClinicalWorkbench
        left={queue}
        center={(
          <div className={`${stablePanelClass} flex-col gap-3 text-center`}>
            <div className="text-xs font-medium text-text-primary">
              患者 {selectedItem.patient_no} 的影像未完成推理
            </div>
            <div className="text-[11px] text-text-tertiary">
              修正源文件后请重新提交批量任务
            </div>
          </div>
        )}
        right={(
          <div className={`${stablePanelClass} flex-col items-stretch gap-4`}>
            <div role="alert" className="rounded-md border border-danger-border bg-danger-bg p-4">
              <div className="text-xs font-medium text-danger-text">
                患者 {selectedItem.patient_no} 推理失败
              </div>
              <div className="mt-2 break-words text-xs leading-relaxed text-danger-text">
                {selectedItem.error}
              </div>
            </div>
            <div className="flex justify-end">{fullDetailLink}</div>
          </div>
        )}
      />
    )
  } else if (selectedItem?.case_id) {
    workbench = (
      <BatchPatientDiagnosis
        key={`${selectedItem.case_id}:${diagnosisVersion}`}
        caseId={selectedItem.case_id}
        jobId={data.job_id}
        onDirtyChange={setJudgmentDirty}
        onSavedAndNext={saveAndSelectNext}
      >
        {({ center, right }) => (
          <ClinicalWorkbench
            left={queue}
            center={center}
            right={(
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Link
                    to={`/case/${selectedItem.case_id}`}
                    className="text-[11px] font-medium text-accent transition-colors hover:text-accent-hover"
                  >
                    打开完整详情
                  </Link>
                </div>
                {right}
              </div>
            )}
          />
        )}
      </BatchPatientDiagnosis>
    )
  } else {
    workbench = (
      <ClinicalWorkbench
        left={queue}
        center={(
          <div className={`${stablePanelClass} text-xs text-text-tertiary`}>
            请从患者队列中选择病例
          </div>
        )}
        right={(
          <div className={`${stablePanelClass} text-xs text-text-tertiary`}>
            选择病例后可查看 AI 建议并提交医生判断
          </div>
        )}
      />
    )
  }

  return (
    <WorkspaceContainer>
      <BatchNav />
      {/* 顶部 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          aria-label="返回批量任务历史"
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
        <div
          role="status"
          aria-label="批量诊断进度"
          aria-live="polite"
          className="shrink-0 rounded-md border border-border bg-bg-primary px-3 py-1.5 text-[11px] tabular-nums text-text-secondary"
        >
          已诊断 {diagnosedCount} / 可诊断 {diagnosableResults.length}
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

      {visibleCompletionMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 rounded-md border border-success-border bg-success-bg p-3 text-xs text-success-text"
        >
          {visibleCompletionMessage}
        </div>
      )}

      {workbench}
    </WorkspaceContainer>
  )
}
