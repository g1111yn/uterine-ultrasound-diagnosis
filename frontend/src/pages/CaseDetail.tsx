import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  getCaseDetail,
  postJudgment,
  getReportUrl,
  getImageUrl,
  getGradcamUrl,
} from '@/api/client'
import JudgmentForm from '@/components/JudgmentForm'
import ProbabilityBars from '@/components/ProbabilityBars'
import ClassBadge from '@/components/ClassBadge'
import { formatDateTime } from '@/lib/utils'
import type { JudgmentRequest, PredictedClass } from '@/lib/types'

const classTypeMap: Record<string, 'normal' | 'endometrial_cancer' | 'polyp'> = {
  normal: 'normal',
  endometrial_cancer: 'endometrial_cancer',
  polyp: 'polyp',
}

export default function CaseDetail() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeIdx, setActiveIdx] = useState(0)

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

  const activeImage = useMemo(() => data?.images[activeIdx], [data, activeIdx])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-text-secondary">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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

  const pred = data.prediction
  const imagePred = activeImage?.per_image_prediction ?? null

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/history')}
          className="p-1.5 rounded-md border border-border-secondary bg-bg-primary text-text-primary hover:bg-bg-tertiary transition-colors"
          aria-label="返回历史"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <h1 className="text-text-primary">病例详情</h1>
        <span className="text-xs font-mono tabular-nums text-text-secondary">
          {data.case_id}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5">
        {/* 左侧：多图切换器 */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-text-secondary">
                图像（{data.images.length}）
              </h2>
              {activeImage && (
                <span className="text-[11px] text-text-tertiary truncate max-w-[50%]">
                  {activeImage.original_filename}
                </span>
              )}
            </div>

            {data.images.length > 0 && activeImage ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] mb-1 text-text-tertiary">原图</div>
                    <img
                      src={getImageUrl(activeImage.image_id)}
                      alt={`原图 ${activeIdx + 1}`}
                      className="w-full aspect-[4/3] object-contain rounded-md border border-border bg-[#0e0e10]"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] mb-1 text-text-tertiary">Grad-CAM</div>
                    {imagePred ? (
                      <img
                        src={getGradcamUrl(activeImage.image_id)}
                        alt={`Grad-CAM ${activeIdx + 1}`}
                        className="w-full aspect-[4/3] object-contain rounded-md border border-border bg-[#0e0e10]"
                      />
                    ) : (
                      <div className="w-full aspect-[4/3] rounded-md border border-border bg-bg-tertiary flex items-center justify-center text-[11px] text-text-tertiary">
                        暂无热图
                      </div>
                    )}
                  </div>
                </div>

                {/* 缩略图条 */}
                <div className="flex gap-1.5 overflow-x-auto pt-1">
                  {data.images.map((img, i) => (
                    <button
                      key={img.image_id}
                      onClick={() => setActiveIdx(i)}
                      className={`shrink-0 relative w-16 h-16 rounded-md overflow-hidden border transition-colors ${
                        i === activeIdx
                          ? 'border-info-border'
                          : 'border-border hover:border-border-secondary'
                      }`}
                      aria-label={`图 ${i + 1}`}
                    >
                      <img
                        src={getImageUrl(img.image_id)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0 left-0 px-1 py-px text-[9px] tabular-nums text-text-primary bg-bg-primary/80">
                        {i + 1}
                      </span>
                    </button>
                  ))}
                </div>

                {/* 当前图像级预测 */}
                {imagePred && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-medium text-text-secondary">
                        本图预测
                      </div>
                      <ClassBadge
                        type={classTypeMap[imagePred.predicted_class]}
                        label={imagePred.predicted_class_zh}
                        confidence={imagePred.confidence}
                      />
                    </div>
                    <ProbabilityBars probabilities={imagePred.probabilities} />
                    <div className="text-[10px] text-text-tertiary tabular-nums">
                      {imagePred.model_version} · 推理 {(imagePred.inference_ms / 1000).toFixed(2)} s
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-[11px] text-text-tertiary">无图像</div>
            )}
          </div>
        </div>

        {/* 右侧：病人级预测 + 基本信息 + 医生判断 */}
        <div className="space-y-4">
          {pred && (
            <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-3">
              <div className="text-[11px] font-medium text-text-secondary">
                病人级预测结果
              </div>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="text-xl font-medium text-text-primary">
                  {pred.predicted_class_zh}
                </span>
                <ClassBadge
                  type={classTypeMap[pred.predicted_class]}
                  label={pred.predicted_class_zh}
                  confidence={pred.confidence}
                />
              </div>
              <ProbabilityBars probabilities={pred.probabilities} />
              <div className="text-[10px] text-text-tertiary tabular-nums">
                聚合策略 {pred.aggregation_strategy} · {pred.image_count} 张 · {pred.model_version}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-bg-primary p-4 space-y-2.5">
            <h2 className="text-xs font-medium text-text-secondary">基本信息</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[11px] text-text-tertiary">病人编号</div>
                <div className="text-text-primary tabular-nums">{data.patient_no}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-tertiary">创建时间</div>
                <div className="text-text-primary tabular-nums">{formatDateTime(data.created_at)}</div>
              </div>
            </div>
            {data.clinical_text && (
              <div>
                <div className="text-[11px] mb-1 text-text-tertiary">检查所见</div>
                <div className="border-l-2 border-border-secondary pl-3 text-xs text-text-primary whitespace-pre-wrap">
                  {data.clinical_text}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg-primary p-4">
            <JudgmentForm
              initialClass={
                (data.judgment?.final_class ?? pred?.predicted_class ?? 'normal') as PredictedClass
              }
              initialRecommendation={data.judgment?.recommendation ?? ''}
              initialNote={data.judgment?.note ?? ''}
              onSubmit={(body) => judgment.mutate(body)}
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
