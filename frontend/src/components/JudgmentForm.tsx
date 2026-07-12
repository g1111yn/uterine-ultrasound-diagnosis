import { useState } from 'react'
import { Download, Save } from 'lucide-react'
import type { JudgmentClass, JudgmentRequest } from '@/lib/types'
import { JUDGMENT_LABELS_ZH } from '@/lib/classification'
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning'

interface Props {
  initialClass?: JudgmentClass | null
  initialRecommendation?: string
  initialNote?: string
  onSubmit: (data: JudgmentRequest) => void
  loading?: boolean
  caseId?: string
  reportUrl?: string
}

const classOptions: JudgmentClass[] = [
  'normal',
  'polyp',
  'endometrial_cancer',
  'indeterminate',
]

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
  initialClass = null,
  initialRecommendation = '',
  initialNote = '',
  onSubmit,
  loading = false,
  reportUrl,
}: Props) {
  const [finalClass, setFinalClass] = useState<JudgmentClass | null>(initialClass)
  const [recommendation, setRecommendation] = useState(initialRecommendation)
  const [note, setNote] = useState(initialNote)
  const dirty =
    finalClass !== initialClass ||
    recommendation !== initialRecommendation ||
    note !== initialNote

  useUnsavedChangesWarning(dirty)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!finalClass) return
    onSubmit({ final_class: finalClass, recommendation, note })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <h3 className="text-xs font-medium text-text-secondary">医生最终判断</h3>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] text-text-tertiary">诊断分类</legend>
        <div className="grid grid-cols-2 gap-2">
          {classOptions.map((option) => (
            <label
              key={option}
              className={`flex min-h-10 cursor-pointer items-center rounded-md border px-3 py-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-info-border ${
                finalClass === option
                  ? 'border-info-border bg-info-bg text-info-text'
                  : 'border-border-secondary bg-bg-primary text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              <input
                type="radio"
                name="final-class"
                value={option}
                checked={finalClass === option}
                onChange={() => setFinalClass(option)}
                className="mr-2 accent-info-text"
              />
              <span>{JUDGMENT_LABELS_ZH[option]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="judgment-recommendation" className="text-[11px] text-text-tertiary">
          处置建议
        </label>
        <select
          id="judgment-recommendation"
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          className={inputClass}
        >
          <option value="">请选择</option>
          {recommendations.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="judgment-note" className="text-[11px] text-text-tertiary">备注</label>
        <textarea
          id="judgment-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
          placeholder="可选备注信息..."
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || finalClass === null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-info-text px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {loading ? '提交中...' : '保存判断'}
        </button>
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            <Download className="h-3.5 w-3.5" />
            导出 PDF 报告
          </a>
        )}
      </div>
    </form>
  )
}
