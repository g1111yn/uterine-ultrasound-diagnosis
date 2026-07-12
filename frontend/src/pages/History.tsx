import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Inbox,
  Search,
  X,
} from 'lucide-react'
import { getCases } from '@/api/client'
import { formatDateTime } from '@/lib/utils'
import ClassBadge from '@/components/ClassBadge'
import { classFromLabel } from '@/lib/classification'
import type { PredictedClass, CaseListParams } from '@/lib/types'

const classOptions: { value: string; label: string }[] = [
  { value: '', label: '所有类别' },
  { value: 'normal', label: '子宫正常大' },
  { value: 'endometrial_cancer', label: '子宫内膜癌' },
  { value: 'polyp', label: '息肉' },
]

const sourceOptions: { value: string; label: string }[] = [
  { value: '', label: '全部来源' },
  { value: 'single', label: '单例推理' },
  { value: 'batch', label: '批量推理' },
]

const inputClass =
  'rounded-md border border-border-secondary bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors'

const selectClass =
  'rounded-md border border-border-secondary bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors'

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

export default function History() {
  const navigate = useNavigate()

  const [keyword, setKeyword] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const hasFilters = !!(keyword || classFilter || sourceFilter || dateFrom || dateTo)

  const params: CaseListParams = {
    page,
    page_size: pageSize,
    ...(keyword && { keyword }),
    ...(classFilter && { class: classFilter as PredictedClass }),
    ...(sourceFilter && { source: sourceFilter as 'single' | 'batch' }),
    ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }),
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cases', params],
    queryFn: () => getCases(params),
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0
  const agreeCount = data?.items.filter((i) => i.agreement === true).length ?? 0
  const judgedCount = data?.items.filter((i) => i.agreement !== null).length ?? 0
  const agreePct = judgedCount > 0 ? Math.round((agreeCount / judgedCount) * 100) : 0

  const clearFilters = () => {
    setKeyword('')
    setClassFilter('')
    setSourceFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* 筛选栏 */}
      <div className="rounded-lg border border-border bg-bg-primary p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* 关键词搜索 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-text-tertiary mb-1">搜索</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-tertiary" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                placeholder="病例编号 / 患者编号 / 检查所见..."
                className={`${inputClass} pl-7 w-full`}
              />
            </div>
          </div>

          {/* 日期范围 */}
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1">开始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1">结束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className={inputClass}
            />
          </div>

          {/* 预测类别 */}
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1">预测类别</label>
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

          {/* 来源 */}
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1">来源</label>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }}
              className={selectClass}
            >
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 清除按钮 */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-md border border-border-secondary bg-bg-primary px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-bg-tertiary transition-colors"
            >
              <X className="w-3 h-3" />
              清除
            </button>
          )}
        </div>
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-text-secondary tabular-nums">
          共 {data?.total ?? 0} 条记录
          {judgedCount > 0 && ` · 本页 ${agreePct}% 医生采纳`}
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
              {['病例编号', '日期', '图像', '模型预测', '医生判断', '一致', '医生', '操作'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
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
                  <tr key={item.case_id} className="hover:bg-bg-secondary transition-colors cursor-pointer" onClick={() => navigate(`/case/${item.case_id}`)}>
                    <td className="font-mono text-[11px] tabular-nums text-text-primary">
                      {item.patient_no || item.case_id.slice(0, 12)}
                    </td>
                    <td className="text-[11px] text-text-secondary tabular-nums">
                      {formatDateTime(item.created_at)}
                    </td>
                    <td className="text-[11px] text-text-secondary tabular-nums">
                      {item.image_count ?? 1}
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
                        <span className="text-[11px] font-medium text-success-text">是</span>
                      ) : (
                        <span className="text-[11px] font-medium text-danger-text">否</span>
                      )}
                    </td>
                    <td className="text-[11px] text-text-secondary">
                      {item.doctor_name ?? '—'}
                    </td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/case/${item.case_id}`) }}
                        className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Inbox className="w-6 h-6 mb-2 text-text-tertiary" />
                    <span className="text-text-secondary">
                      {hasFilters ? '没有匹配的记录，试试调整筛选条件' : '暂无数据'}
                    </span>
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
            共 {data?.total} 条，第 {page} / {totalPages} 页
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
