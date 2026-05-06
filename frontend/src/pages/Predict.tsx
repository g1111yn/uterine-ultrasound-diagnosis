import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, Loader2, RotateCcw } from 'lucide-react'
import ImageUploader from '@/components/ImageUploader'
import PredictionResult from '@/components/PredictionResult'
import JudgmentForm from '@/components/JudgmentForm'
import { postPredict, postJudgment } from '@/api/client'
import type { PredictResponse, JudgmentRequest } from '@/lib/types'

const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

export default function Predict() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('')
  const [clinicalText, setClinicalText] = useState('')
  const [patientNo, setPatientNo] = useState('')

  const predict = useMutation({
    mutationFn: () => postPredict(imageFile!, clinicalText, patientNo || undefined),
  })

  const judgment = useMutation({
    mutationFn: (data: JudgmentRequest & { caseId: string }) =>
      postJudgment(data.caseId, {
        final_class: data.final_class,
        recommendation: data.recommendation,
        note: data.note,
      }),
  })

  const handleFileSelect = useCallback((file: File) => {
    setImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
  }, [])

  const handleAnalyze = () => {
    if (!imageFile) return
    predict.mutate()
  }

  const handleClear = () => {
    setImageFile(null)
    setImagePreviewUrl('')
    setClinicalText('')
    setPatientNo('')
    predict.reset()
    judgment.reset()
  }

  const result: PredictResponse | undefined = predict.data

  const handleJudgment = (data: JudgmentRequest) => {
    if (!result) return
    judgment.mutate({ ...data, caseId: result.case_id })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left panel - Input */}
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
            />
          </div>

          <ImageUploader onFileSelect={handleFileSelect} />

          <div className="space-y-1.5">
            <label className="text-xs text-text-secondary">临床描述（来自超声报告）</label>
            <textarea
              value={clinicalText}
              onChange={(e) => setClinicalText(e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="请输入临床描述信息，如：绝经后阴道出血，子宫内膜增厚..."
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyze}
              disabled={!imageFile || predict.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {predict.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  分析中...
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
              分析失败：{predict.error.message}
            </div>
          )}
        </div>

        {/* Right panel - Results */}
        <div className="space-y-4">
          {predict.isPending && (
            <div className="rounded-lg border border-border bg-bg-primary p-12 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-text-tertiary" />
              <p className="text-xs text-text-secondary">正在分析超声图像，请稍候...</p>
            </div>
          )}

          {!predict.isPending && result && (
            <>
              <div className="rounded-lg border border-border bg-bg-primary p-4">
                <PredictionResult
                  prediction={result.prediction}
                  gradcamUrl={imagePreviewUrl || result.prediction.gradcam_url}
                />
              </div>
              <div className="rounded-lg border border-border bg-bg-primary p-4">
                <JudgmentForm
                  initialClass={result.prediction.predicted_class}
                  onSubmit={handleJudgment}
                  loading={judgment.isPending}
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

          {!predict.isPending && !result && (
            <div className="rounded-lg border border-dashed border-border-secondary p-12 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-text-secondary">
                上传超声图像并点击"开始分析"后，预测结果将在此处显示
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
