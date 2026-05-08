import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ChevronLeft, ChevronRight, Download, Filter } from 'lucide-react'
import { adminGetAuditLogs, buildAuditLogCsvUrl } from '@/api/client'
import type { AuditLogParams } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

const inputClass =
  'rounded-md border border-border-secondary bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-info-border transition-colors'

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

export default function AdminAuditLogs() {
  const [filters, setFilters] = useState<AuditLogParams>({
    page: 1,
    page_size: 50,
  })
  const [pendingFilters, setPendingFilters] = useState<AuditLogParams>(filters)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-audit-logs', filters],
    queryFn: () => adminGetAuditLogs(filters),
  })

  const totalPages = data ? Math.ceil(data.total / (filters.page_size ?? 50)) : 0
  const page = filters.page ?? 1

  const applyFilters = () => {
    setFilters({ ...pendingFilters, page: 1 })
  }

  const resetFilters = () => {
    const reset: AuditLogParams = { page: 1, page_size: 50 }
    setPendingFilters(reset)
    setFilters(reset)
  }

  const setPending = <K extends keyof AuditLogParams>(k: K, v: AuditLogParams[K]) => {
    setPendingFilters({ ...pendingFilters, [k]: v })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-text-primary">审计日志</h1>
          <p className="text-[11px] text-text-tertiary mt-0.5 tabular-nums">
            共 {data?.total ?? 0} 条
          </p>
        </div>
        <a
          href={buildAuditLogCsvUrl(filters)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          导出 CSV
        </a>
      </div>

      <div className="rounded-lg border border-border bg-bg-primary p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-text-tertiary" />
          <input
            type="text"
            placeholder="用户名"
            value={pendingFilters.user_id ?? ''}
            onChange={(e) => setPending('user_id', e.target.value || undefined)}
            className={`${inputClass} w-32 tabular-nums`}
          />
          <input
            type="text"
            placeholder="action（如 login）"
            value={pendingFilters.action ?? ''}
            onChange={(e) => setPending('action', e.target.value || undefined)}
            className={`${inputClass} w-44`}
          />
          <select
            value={
              pendingFilters.success === undefined
                ? ''
                : pendingFilters.success
                ? 'true'
                : 'false'
            }
            onChange={(e) =>
              setPending(
                'success',
                e.target.value === '' ? undefined : e.target.value === 'true',
              )
            }
            className={inputClass}
          >
            <option value="">全部结果</option>
            <option value="true">成功</option>
            <option value="false">失败</option>
          </select>
          <input
            type="date"
            value={pendingFilters.date_from ?? ''}
            onChange={(e) => setPending('date_from', e.target.value || undefined)}
            className={`${inputClass} tabular-nums`}
          />
          <span className="text-[11px] text-text-tertiary">→</span>
          <input
            type="date"
            value={pendingFilters.date_to ?? ''}
            onChange={(e) => setPending('date_to', e.target.value || undefined)}
            className={`${inputClass} tabular-nums`}
          />
          <button
            onClick={applyFilters}
            className="rounded-md px-3 py-1.5 text-xs font-medium bg-info-text text-white hover:opacity-90 transition-opacity"
          >
            筛选
          </button>
          <button
            onClick={resetFilters}
            className="rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary transition-colors"
          >
            重置
          </button>
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
              <th>时间</th>
              <th>用户</th>
              <th>动作</th>
              <th>资源</th>
              <th>IP</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-tertiary" />
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((log) => (
                <tr key={log.id}>
                  <td className="text-[11px] text-text-secondary tabular-nums">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td>
                    <div className="text-[11px] font-mono tabular-nums text-text-primary">
                      {log.user_id ?? '—'}
                    </div>
                    {log.display_name && (
                      <div className="text-[10px] text-text-tertiary">{log.display_name}</div>
                    )}
                  </td>
                  <td className="text-[11px] font-mono text-text-primary">{log.action}</td>
                  <td className="text-[11px] text-text-secondary">
                    {log.resource_type && (
                      <span className="text-text-tertiary">{log.resource_type}/</span>
                    )}
                    {log.resource_id ?? '—'}
                  </td>
                  <td className="text-[11px] font-mono tabular-nums text-text-secondary">
                    {log.ip_address ?? '—'}
                  </td>
                  <td>
                    {log.success ? (
                      <span className="text-[10px] text-success-text">成功</span>
                    ) : (
                      <span className="text-[10px] text-danger-text">失败</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-secondary">
                  暂无日志
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-text-secondary tabular-nums">
            第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilters({ ...filters, page: Math.max(1, page - 1) })}
              disabled={page <= 1}
              className="p-1 rounded-md border border-border-secondary bg-bg-primary text-text-primary disabled:opacity-30 hover:bg-bg-tertiary transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFilters({ ...filters, page: Math.min(totalPages, page + 1) })}
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
