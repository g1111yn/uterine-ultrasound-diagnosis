import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, Inbox } from 'lucide-react'
import { getCases } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import ClassBadge, { classFromLabel } from '@/components/ClassBadge'
import type { PredictedClass, CaseListParams } from '@/lib/types'

const classOptions: { value: string; label: string }[] = [
  { value: '', label: '所有类别' },
  { value: 'normal', label: '子宫正常大' },
  { value: 'endometrial_cancer', label: '子宫内膜癌' },
  { value: 'polyp', label: '息肉' },
]

const dateRangeOptions = [
  { value: '', label: '全部时间' },
  { value: '7', label: '近7天' },
  { value: '30', label: '近30天' },
  { value: '90', label: '近90天' },
]

const selectClass =
  'rounded-md border border-border-secondary bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

export default function History() {
  const navigate = useNavigate()
  const [classFilter, setClassFilter] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const dateFrom = dateRange
    ? new Date(Date.now() - Number(dateRange) * 86400000).toISOString().slice(0, 10)
    : ''

  const params: CaseListParams = {
    page,
    page_size: pageSize,
    ...(classFilter && { class: classFilter as PredictedClass }),
    ...(dateFrom && { date_from: dateFrom }),
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cases', params],
    queryFn: () => getCases(params),
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0
  const agreeCount = data?.items.filter((i) => i.agreement === true).length ?? 0
  const judgedCount = data?.items.filter((i) => i.agreement !== null).length ?? 0
  const agreePct = judgedCount > 0 ? Math.round((agreeCount / judgedCount) * 100) : 0

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => { setDateRange(e.target.value); setPage(1) }}
            className={selectClass}
          >
            {dateRangeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1) }}
            className={selectClass}
          >
            {classOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-text-secondary tabular-nums">
          共 {data?.total ?? 0} 条{judgedCount > 0 && ` · ${agreePct}% 医生采纳`}
        </div>
      </div>

      {isError && (
        <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text mb-4">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        <table className={tableClass}>
          <thead>
            <tr>
              {['病例编号', '日期', '模型预测', '医生判断', '一致', '医生', '操作'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin mb-2 text-text-tertiary" />
                    <span className="text-text-secondary">加载中...</span>
                  </div>
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((item) => {
                const predClass = classFromLabel(item.predicted_class_zh)
                const judgeClass = classFromLabel(item.doctor_judgment_zh)
                return (
                  <tr key={item.case_id}>
                    <td className="font-mono text-[11px] tabular-nums text-text-primary">
                      {item.patient_no || item.case_id}
                    </td>
                    <td className="text-[11px] text-text-secondary tabular-nums">
                      {formatDateTime(item.created_at)}
                    </td>
                    <td>
                      <ClassBadge
                        type={predClass}
                        label={item.predicted_class_zh}
                        confidence={item.confidence}
                      />
                    </td>
                    <td>
                      {item.doctor_judgment_zh ? (
                        <ClassBadge type={judgeClass} label={item.doctor_judgment_zh} />
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td>
                      {item.agreement === null ? (
                        <span className="text-text-tertiary">—</span>
                      ) : item.agreement ? (
                        <span className="text-[11px] font-medium text-text-primary">是</span>
                      ) : (
                        <span className="text-[11px] font-medium text-text-secondary">否</span>
                      )}
                    </td>
                    <td className="text-[11px] text-text-secondary">
                      {item.doctor_name ?? '—'}
                    </td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/case/${item.case_id}`) }}
                        className="text-[11px] font-medium text-info-text hover:opacity-80 transition-opacity"
                      >
                        查看 · PDF
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Inbox className="w-6 h-6 mb-2 text-text-tertiary" />
                    <span className="text-text-secondary">暂无数据</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-text-secondary tabular-nums">
            共 {data?.total} 条记录，第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded-md border border-border-secondary bg-bg-primary text-text-primary disabled:opacity-30 hover:bg-bg-tertiary transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded-md border border-border-secondary bg-bg-primary text-text-primary disabled:opacity-30 hover:bg-bg-tertiary transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
