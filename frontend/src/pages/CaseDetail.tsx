import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { getCaseDetail, postJudgment, getReportUrl, getCaseImageUrl } from '@/api/client'
import PredictionResult from '@/components/PredictionResult'
import GradCAMViewer from '@/components/GradCAMViewer'
import JudgmentForm from '@/components/JudgmentForm'
import { formatDateTime } from '@/lib/utils'
import type { JudgmentRequest } from '@/lib/types'

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCaseDetail(caseId!),
    enabled: !!caseId,
  })

  const judgment = useMutation({
    mutationFn: (body: JudgmentRequest) => postJudgment(caseId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-text-secondary">
        加载中...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
          {(error as Error).message}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/history')}
          className="p-1.5 rounded-md border border-border-secondary bg-bg-primary text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <h1 className="text-text-primary">病例详情</h1>
        <span className="text-xs font-mono tabular-nums text-text-secondary">
          {data.case_id}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-3">
            <h2 className="text-xs font-medium text-text-secondary">基本信息</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[11px] text-text-tertiary">患者编号</div>
                <div className="text-text-primary tabular-nums">{data.patient_no}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-tertiary">创建时间</div>
                <div className="text-text-primary tabular-nums">{formatDateTime(data.created_at)}</div>
              </div>
              {data.clinical_text && (
                <div className="col-span-2">
                  <div className="text-[11px] mb-1 text-text-tertiary">临床描述</div>
                  <div className="border-l-2 border-border-secondary pl-3 text-xs text-text-primary">
                    {data.clinical_text}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <GradCAMViewer
              originalUrl={getCaseImageUrl(data.case_id)}
              gradcamUrl={data.prediction?.gradcam_url ?? ''}
            />
          </div>
        </div>

        <div className="space-y-4">
          {data.prediction && (
            <div className="rounded-lg border border-border bg-bg-primary p-4">
              <PredictionResult prediction={data.prediction} />
            </div>
          )}

          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <JudgmentForm
              initialClass={data.judgment?.final_class ?? data.prediction?.predicted_class ?? 'normal'}
              initialRecommendation={data.judgment?.recommendation ?? ''}
              initialNote={data.judgment?.note ?? ''}
              onSubmit={(d) => judgment.mutate(d)}
              loading={judgment.isPending}
              reportUrl={getReportUrl(data.case_id)}
            />
            {judgment.isSuccess && (
              <div className="mt-3 rounded-md border border-info-border bg-info-bg p-2.5 text-xs text-info-text">
                判断已更新
              </div>
            )}
            {judgment.isError && (
              <div className="mt-3 rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
                {judgment.error.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
