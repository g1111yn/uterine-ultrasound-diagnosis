import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  getCaseDetail,
  postJudgment,
  getReportUrl,
  getImageUrl,
} from '@/api/client'
import AiSuggestionPanel from '@/components/AiSuggestionPanel'
import ClinicalWorkbench from '@/components/ClinicalWorkbench'
import ImageReviewPanel from '@/components/ImageReviewPanel'
import JudgmentForm from '@/components/JudgmentForm'
import WorkspaceContainer from '@/components/WorkspaceContainer'
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
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        加载中...
      </div>
    )
  }

  if (isError) {
    return (
      <WorkspaceContainer className="max-w-4xl">
        <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
          {(error as Error).message}
        </div>
      </WorkspaceContainer>
    )
  }

  if (!data) return null

  const pred = data.prediction

  return (
    <WorkspaceContainer>
      <ClinicalWorkbench
        left={
          <div className="space-y-4 rounded-md border border-border bg-bg-primary p-4">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="shrink-0 rounded-md border border-border-secondary bg-bg-primary p-1.5 text-text-primary transition-colors hover:bg-bg-tertiary"
                aria-label="返回历史"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base text-text-primary">病例详情</h1>
                <div className="break-all font-mono text-[11px] tabular-nums text-text-tertiary">
                  {data.case_id}
                </div>
              </div>
            </div>

            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-[11px] text-text-tertiary">患者编号</dt>
                <dd className="tabular-nums text-text-primary">{data.patient_no}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-text-tertiary">检查方式</dt>
                <dd className="text-text-primary">{data.check_project || '未记录'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-text-tertiary">创建时间</dt>
                <dd className="tabular-nums text-text-primary">
                  {formatDateTime(data.created_at)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-text-tertiary">检查所见</dt>
                <dd className="whitespace-pre-wrap text-text-primary">
                  {data.clinical_text || '未填写'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-text-tertiary">图像数</dt>
                <dd className="tabular-nums text-text-primary">{data.images.length} 张</dd>
              </div>
            </dl>

            {data.images.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5" aria-label="影像缩略概览">
                {data.images.slice(0, 6).map((image, index) => (
                  <div
                    key={image.image_id}
                    className="aspect-square overflow-hidden rounded-md border border-border bg-bg-tertiary"
                  >
                    <img
                      src={getImageUrl(image.image_id)}
                      alt={`缩略图 ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        }
        center={<ImageReviewPanel images={data.images} />}
        right={
          pred ? (
            <div className="space-y-4">
              <AiSuggestionPanel
                predictedClass={pred.predicted_class}
                predictedClassZh={pred.predicted_class_zh}
                confidence={pred.confidence}
                probabilities={pred.probabilities}
                detail={`聚合策略 ${pred.aggregation_strategy} · ${pred.image_count} 张 · ${pred.model_version}`}
              />

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
                  key={`${data.case_id}-${data.judgment?.judged_at ?? 'new'}`}
                  initialClass={data.judgment?.final_class ?? null}
                  initialRecommendation={data.judgment?.recommendation ?? ''}
                  initialNote={data.judgment?.note ?? ''}
                  initialJudgedAt={data.judgment?.judged_at ?? null}
                  onSubmit={(body) => judgment.mutateAsync(body)}
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
          ) : (
            <div
              role="status"
              className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-md border border-border bg-bg-primary p-4 text-center"
            >
              <div className="text-xs font-medium text-text-primary">
                病例尚未完成推理，暂不能提交医生判断
              </div>
              <div className="text-[11px] text-text-tertiary">
                请等待 AI 结果完成，或检查推理失败原因
              </div>
            </div>
          )
        }
      />
    </WorkspaceContainer>
  )
}
