import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { getCaseDetail, getReportUrl, postJudgment } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import type { CaseDetail, JudgmentRequest } from '@/lib/types'
import AiSuggestionPanel from './AiSuggestionPanel'
import ImageReviewPanel from './ImageReviewPanel'
import JudgmentForm from './JudgmentForm'

interface Props {
  caseId: string
  jobId: string
  onDirtyChange: (dirty: boolean) => void
  onSavedAndNext: (caseId: string) => void
  children: (content: { center: ReactNode; right: ReactNode }) => ReactNode
}

const stablePanelClass =
  'flex min-h-[420px] items-center justify-center rounded-md border border-border bg-bg-primary p-4'

export default function BatchPatientDiagnosis({
  caseId,
  ...props
}: Props) {
  return <CaseScopedDiagnosis key={caseId} caseId={caseId} {...props} />
}

function CaseScopedDiagnosis({
  caseId,
  jobId,
  onDirtyChange,
  onSavedAndNext,
  children,
}: Props) {
  const queryClient = useQueryClient()
  const onDirtyChangeRef = useRef(onDirtyChange)

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  }, [onDirtyChange])

  useEffect(() => () => {
    onDirtyChangeRef.current(false)
  }, [])

  const detail = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCaseDetail(caseId),
    enabled: Boolean(caseId),
  })
  const judgment = useMutation({
    mutationFn: (body: JudgmentRequest) => postJudgment(caseId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['case', caseId] }),
        queryClient.invalidateQueries({ queryKey: ['batch-status', jobId] }),
      ])
    },
  })

  if (detail.isLoading) {
    const loadingPanel = (
      <div className={stablePanelClass} aria-busy="true">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载病例...
        </div>
      </div>
    )
    return children({ center: loadingPanel, right: loadingPanel })
  }

  if (detail.isError && !detail.data) {
    const center = (
      <div className={`${stablePanelClass} text-xs text-text-tertiary`}>
        病例影像暂不可用
      </div>
    )
    const right = (
      <div className={`${stablePanelClass} flex-col gap-4`}>
        <div role="alert" className="text-xs text-danger-text">
          病例加载失败：{detail.error.message}
        </div>
        <button
          type="button"
          onClick={() => void detail.refetch()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          重新加载病例
        </button>
      </div>
    )
    return children({ center, right })
  }

  if (!detail.data) {
    return children({
      center: <div className={stablePanelClass}>病例影像暂不可用</div>,
      right: <div className={stablePanelClass}>病例详情暂不可用</div>,
    })
  }

  const data = detail.data
  const saveJudgment = (body: JudgmentRequest) => judgment.mutateAsync(body)
  const saveAndNext = async (body: JudgmentRequest) => {
    await saveJudgment(body)
    onDirtyChangeRef.current(false)
    onSavedAndNext(caseId)
  }

  return (
    <LoadedCaseDiagnosis
      data={data}
      onDirtyChange={onDirtyChange}
      saveJudgment={saveJudgment}
      saveAndNext={saveAndNext}
      saving={judgment.isPending}
      saveSucceeded={judgment.isSuccess}
      saveError={judgment.error}
    >
      {children}
    </LoadedCaseDiagnosis>
  )
}

interface LoadedCaseDiagnosisProps {
  data: CaseDetail
  onDirtyChange: (dirty: boolean) => void
  saveJudgment: (body: JudgmentRequest) => Promise<unknown>
  saveAndNext: (body: JudgmentRequest) => Promise<unknown>
  saving: boolean
  saveSucceeded: boolean
  saveError: Error | null
  children: Props['children']
}

function LoadedCaseDiagnosis({
  data,
  onDirtyChange,
  saveJudgment,
  saveAndNext,
  saving,
  saveSucceeded,
  saveError,
  children,
}: LoadedCaseDiagnosisProps) {
  const liveFormVersion = data.judgment?.judged_at ?? 'new'
  const [editingFormVersion, setEditingFormVersion] = useState<string | null>(null)
  const acceptedFormVersion = editingFormVersion ?? liveFormVersion
  const handleDirtyChange = useCallback((nextDirty: boolean) => {
    setEditingFormVersion((currentVersion) => (
      nextDirty ? (currentVersion ?? liveFormVersion) : null
    ))
    onDirtyChange(nextDirty)
  }, [liveFormVersion, onDirtyChange])

  const prediction = data.prediction

  const right = (
    <div className="min-h-[420px] space-y-4">
      {prediction ? (
        <AiSuggestionPanel
          predictedClass={prediction.predicted_class}
          predictedClassZh={prediction.predicted_class_zh}
          confidence={prediction.confidence}
          probabilities={prediction.probabilities}
          detail={`聚合策略 ${prediction.aggregation_strategy} · ${prediction.image_count} 张 · ${prediction.model_version}`}
        />
      ) : (
        <div className="rounded-md border border-border bg-bg-primary p-4 text-xs text-text-tertiary">
          暂无 AI 辅助建议
        </div>
      )}

      <div className="rounded-md border border-border bg-bg-primary p-4">
        {data.judgment && (
          <div className="mb-3 border-b border-border pb-3 text-[11px] text-text-tertiary">
            已保存判断 · 医生 {data.judgment.doctor_id} ·{' '}
            <span className="tabular-nums">
              {formatDateTime(data.judgment.judged_at)}
            </span>
          </div>
        )}
        <JudgmentForm
          key={`${data.case_id}-${acceptedFormVersion}`}
          initialClass={data.judgment?.final_class ?? null}
          initialRecommendation={data.judgment?.recommendation ?? ''}
          initialNote={data.judgment?.note ?? ''}
          onSubmit={saveJudgment}
          secondarySubmitLabel="保存并下一位"
          onSecondarySubmit={saveAndNext}
          onDirtyChange={handleDirtyChange}
          loading={saving}
          reportUrl={getReportUrl(data.case_id)}
        />
        {saveSucceeded && (
          <div
            role="status"
            className="mt-3 rounded-md border border-success-border bg-success-bg p-2.5 text-xs text-success-text"
          >
            判断已保存
          </div>
        )}
        {saveError && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text"
          >
            {saveError.message}
          </div>
        )}
      </div>
    </div>
  )

  return children({ center: <ImageReviewPanel images={data.images} />, right })
}
