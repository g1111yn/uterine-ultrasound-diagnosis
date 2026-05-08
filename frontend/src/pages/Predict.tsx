import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Loader2, RotateCcw } from 'lucide-react'
import MultiImageUploader from '@/components/MultiImageUploader'
import PerImagePredictionCard from '@/components/PerImagePredictionCard'
import ProbabilityBars from '@/components/ProbabilityBars'
import ClassBadge from '@/components/ClassBadge'
import JudgmentForm from '@/components/JudgmentForm'
import {
  postPredict,
  getTaskStatus,
  getCaseDetail,
  postJudgment,
  getReportUrl,
} from '@/api/client'
import type { JudgmentRequest, PredictResponse, TaskStatusResponse } from '@/lib/types'

const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

const classTypeMap: Record<string, 'normal' | 'endometrial_cancer' | 'polyp'> = {
  normal: 'normal',
  endometrial_cancer: 'endometrial_cancer',
  polyp: 'polyp',
}

function formatWaitMs(ms: number): string {
  if (!ms || ms <= 0) return '—'
  if (ms < 1000) return '< 1 秒'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
}

export default function Predict() {
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [clinicalText, setClinicalText] = useState('')
  const [patientNo, setPatientNo] = useState('')
  const [submission, setSubmission] = useState<PredictResponse | null>(null)
  const idempKeyRef = useRef<string | null>(null)

  const predict = useMutation({
    mutationFn: async () => {
      if (!idempKeyRef.current) {
        idempKeyRef.current = crypto.randomUUID()
      }
      return postPredict({
        images: files,
        clinical_text: clinicalText,
        patient_no: patientNo,
        idempotency_key: idempKeyRef.current,
      })
    },
    onSuccess: (data) => {
      setSubmission(data)
    },
  })

  // 任务状态轮询
  const taskQuery = useQuery<TaskStatusResponse>({
    queryKey: ['task', submission?.task_id],
    queryFn: () => getTaskStatus(submission!.task_id),
    enabled: !!submission?.task_id,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      if (s === 'queued' || s === 'running') return 1000
      return false
    },
  })

  const caseId = taskQuery.data?.case_id ?? submission?.case_id ?? null
  const taskDone = taskQuery.data?.status === 'done'

  // 任务完成后拉取病例详情
  const caseQuery = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCaseDetail(caseId!),
    enabled: !!caseId && taskDone,
  })

  const judgment = useMutation({
    mutationFn: (body: JudgmentRequest) => postJudgment(caseId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case', caseId] })
    },
  })

  const handleSubmit = () => {
    if (!files.length || !patientNo.trim()) return
    idempKeyRef.current = crypto.randomUUID()
    predict.mutate()
  }

  const handleClear = useCallback(() => {
    setFiles([])
    setClinicalText('')
    setPatientNo('')
    setSubmission(null)
    idempKeyRef.current = null
    predict.reset()
    judgment.reset()
  }, [predict, judgment])

  const taskStatus = taskQuery.data?.status
  const waiting = submission && !taskDone && !taskQuery.error
  const failed = taskStatus === 'failed' || !!taskQuery.error

  // 不确定进度条动画（伪进度）
  const [progressTick, setProgressTick] = useState(0)
  useEffect(() => {
    if (!waiting) return
    const id = setInterval(() => setProgressTick((t) => (t + 1) % 100), 120)
    return () => clearInterval(id)
  }, [waiting])

  const detail = caseQuery.data
  const pred = detail?.prediction ?? null

  const waitingText = useMemo(() => {
    if (!taskQuery.data) return '提交中...'
    const { status, queue_position, estimated_wait_ms } = taskQuery.data
    if (status === 'queued') {
      const ahead = Math.max(0, queue_position - 1)
      return `队列中，前方还有 ${ahead} 个任务，预估 ${formatWaitMs(estimated_wait_ms)}`
    }
    if (status === 'running') {
      const n = submission?.image_count ?? files.length
      return `分析中，共 ${n} 张图像`
    }
    if (status === 'failed') {
      return `分析失败：${taskQuery.data.error ?? '未知错误'}`
    }
    return '处理中...'
  }, [taskQuery.data, submission, files.length])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左侧 - 输入 */}
        <div className="space-y-4">
          <h2 className="text-text-primary">输入</h2>

          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary">病例编号</label>
            <input
              type="text"
              value={patientNo}
              onChange={(e) => setPatientNo(e.target.value)}
              className={`${inputClass} tabular-nums`}
              placeholder="20260502-1138"
              disabled={!!submission}
            />
          </div>

          <MultiImageUploader files={files} onChange={setFiles} />

          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary">检查所见（临床描述）</label>
            <textarea
              value={clinicalText}
              onChange={(e) => setClinicalText(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="请输入检查所见，如：绝经后阴道出血，子宫内膜增厚..."
              disabled={!!submission}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={
                !files.length ||
                !patientNo.trim() ||
                predict.isPending ||
                !!submission
              }
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {predict.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  提交中...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  开始分析
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3.5 py-2 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              清空
            </button>
          </div>

          {predict.isError && (
            <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
              提交失败：{predict.error.message}
            </div>
          )}
        </div>

        {/* 右侧 - 结果 */}
        <div className="space-y-4">
          {waiting && (
            <div className="rounded-lg border border-border bg-bg-primary p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">{waitingText}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-border relative">
                <div
                  className="absolute h-full rounded-full transition-all"
                  style={{
                    width: '28%',
                    left: `${progressTick}%`,
                    backgroundColor: 'var(--color-info-text)',
                    opacity: 0.7,
                  }}
                />
              </div>
              <p className="text-[11px] text-text-tertiary">
                任务 {submission?.task_id.slice(0, 8)} · 请勿刷新页面
              </p>
            </div>
          )}

          {failed && (
            <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
              {taskQuery.data?.error ?? taskQuery.error?.message ?? '分析失败'}
            </div>
          )}

          {taskDone && caseQuery.isLoading && (
            <div className="rounded-lg border border-border bg-bg-primary p-6 flex flex-col items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin mb-2 text-text-tertiary" />
              <p className="text-xs text-text-secondary">加载结果...</p>
            </div>
          )}

          {detail && pred && (
            <>
              {/* 病人级预测卡 */}
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

              {/* 各图明细 */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-text-secondary">
                  各图明细（{detail.images.length} 张）
                </div>
                {detail.images.map((img, i) => (
                  <PerImagePredictionCard
                    key={img.image_id}
                    image={img}
                    defaultOpen={i === 0}
                  />
                ))}
              </div>

              {/* 医生判断表单 */}
              <div className="rounded-lg border border-border bg-bg-primary p-4">
                <JudgmentForm
                  initialClass={detail.judgment?.final_class ?? pred.predicted_class}
                  initialRecommendation={detail.judgment?.recommendation ?? ''}
                  initialNote={detail.judgment?.note ?? ''}
                  onSubmit={(body) => judgment.mutate(body)}
                  loading={judgment.isPending}
                  reportUrl={getReportUrl(detail.case_id)}
                />
                {judgment.isSuccess && (
                  <div className="mt-3 rounded-md border border-info-border bg-info-bg p-2.5 text-xs text-info-text">
                    判断已提交成功
                  </div>
                )}
                {judgment.isError && (
                  <div className="mt-3 rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
                    提交失败：{judgment.error.message}
                  </div>
                )}
              </div>
            </>
          )}

          {!submission && !predict.isPending && (
            <div className="rounded-lg border border-dashed border-border-secondary p-12 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-text-secondary">
                上传多张超声图像并点击"开始分析"，结果将在此处显示
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
