import { useState } from 'react'
import { Download, Save } from 'lucide-react'
import type { PredictedClass, JudgmentRequest } from '@/lib/types'
import { CLASS_LABELS_ZH } from '@/lib/utils'

interface Props {
  initialClass?: PredictedClass
  initialRecommendation?: string
  initialNote?: string
  onSubmit: (data: JudgmentRequest) => void
  loading?: boolean
  caseId?: string
  reportUrl?: string
}

const classOptions: PredictedClass[] = ['normal', 'endometrial_cancer', 'polyp']

const recommendations = [
  { value: 'none', label: '无' },
  { value: 'followup', label: '随访观察' },
  { value: 'biopsy', label: '建议进一步病理检查' },
  { value: 'surgery', label: '建议手术' },
  { value: 'other', label: '其他' },
]

const inputClass =
  'w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

export default function JudgmentForm({
  initialClass,
  initialRecommendation = '',
  initialNote = '',
  onSubmit,
  loading = false,
  reportUrl,
}: Props) {
  const [finalClass, setFinalClass] = useState<PredictedClass>(initialClass ?? 'normal')
  const [recommendation, setRecommendation] = useState(initialRecommendation)
  const [note, setNote] = useState(initialNote)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ final_class: finalClass, recommendation, note })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <h3 className="text-xs font-medium text-text-secondary">医生最终判断</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] text-text-tertiary">诊断分类</label>
          <select
            value={finalClass}
            onChange={(e) => setFinalClass(e.target.value as PredictedClass)}
            className={inputClass}
          >
            {classOptions.map((cls) => (
              <option key={cls} value={cls}>
                {cls === initialClass
                  ? `${CLASS_LABELS_ZH[cls]}（同意模型）`
                  : CLASS_LABELS_ZH[cls]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] text-text-tertiary">处置建议</label>
          <select
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value)}
            className={inputClass}
          >
            <option value="">请选择</option>
            {recommendations.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-text-tertiary">备注</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
          placeholder="可选备注信息..."
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Save className="w-3.5 h-3.5" />
          {loading ? '提交中...' : '存到历史'}
        </button>
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3.5 py-2 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            导出 PDF 报告
          </a>
        )}
      </div>
    </form>
  )
}
