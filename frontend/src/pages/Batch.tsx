import { useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Upload, FileUp, Download, Loader2, Pause } from 'lucide-react'
import { postBatchPredict, getBatchStatus } from '@/api/client'
import MetricCard from '@/components/MetricCard'
import ClassBadge, { classFromLabel } from '@/components/ClassBadge'
import type { BatchStatusResponse, BatchResultItem } from '@/lib/types'

function exportCSV(results: BatchResultItem[]) {
  const header = '文件名,预测类别,置信度'
  const rows = results.map(
    (r) => `${r.filename},${r.predicted_class_zh},${(r.confidence * 100).toFixed(1)}%`,
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `batch-results-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

type StatusStyle = 'done' | 'review' | 'running' | 'queued'

function getStatusLabel(index: number, completed: number): { label: string; style: StatusStyle } {
  if (index < completed) {
    return index < completed - 2
      ? { label: '已分析', style: 'done' }
      : { label: '已分析·待复核', style: 'review' }
  }
  if (index === completed) return { label: '进行中', style: 'running' }
  return { label: '排队中', style: 'queued' }
}

const statusClass: Record<StatusStyle, string> = {
  done: 'bg-success-bg text-success-text',
  review: 'bg-warning-bg text-warning-text',
  running: 'bg-info-bg text-info-text',
  queued: 'bg-bg-tertiary text-text-secondary',
}

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

export default function Batch() {
  const [files, setFiles] = useState<File[]>([])
  const [manifest, setManifest] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => postBatchPredict(files, manifest ?? undefined),
    onSuccess: (data) => setJobId(data.job_id),
  })

  const status = useQuery<BatchStatusResponse>({
    queryKey: ['batch-status', jobId],
    queryFn: () => getBatchStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' || s === 'pending' ? 2000 : false
    },
  })

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/') ||
      f.type === 'application/dicom' ||
      f.name.toLowerCase().endsWith('.dcm'),
    )
    setFiles((prev) => [...prev, ...dropped])
  }, [])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }, [])

  const resetJob = useCallback(() => {
    setJobId(null)
    setFiles([])
    setManifest(null)
    submit.reset()
  }, [submit])

  const batchData = status.data
  const isRunning = batchData?.status === 'running' || batchData?.status === 'pending'
  const isCompleted = batchData?.status === 'completed'
  const progress = batchData ? (batchData.completed / batchData.total) * 100 : 0

  const normalCount = batchData?.results.filter((r) => r.predicted_class_zh.includes('正常')).length ?? 0
  const polypCount = batchData?.results.filter((r) => r.predicted_class_zh.includes('息肉')).length ?? 0
  const cancerCount = batchData?.results.filter((r) => r.predicted_class_zh.includes('内膜癌')).length ?? 0
  const totalCompleted = batchData?.completed ?? 0
  const totalItems = batchData?.total ?? 0

  const pct = (n: number) =>
    totalCompleted > 0 ? `${Math.round((n / totalCompleted) * 100)}%` : '—'

  return (
    <div className="max-w-5xl mx-auto">
      {!jobId && (
        <div className="space-y-4">
          <h1 className="text-text-primary">批量推理</h1>
          <div className="rounded-lg border border-border bg-bg-primary p-5 space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`relative flex flex-col items-center justify-center h-40 rounded-md border border-dashed cursor-pointer transition-colors ${
                dragging
                  ? 'border-info-border bg-info-bg'
                  : 'border-border-secondary bg-bg-secondary hover:bg-bg-tertiary'
              }`}
            >
              <Upload className="w-6 h-6 mb-2 text-text-tertiary" />
              <p className="text-xs text-text-secondary">
                拖拽多个超声图像到此处，或点击选择文件
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,.dcm,application/dicom"
                multiple
                onChange={onFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            {files.length > 0 && (
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="tabular-nums">已选择 {files.length} 个文件</span>
                <button
                  onClick={() => setFiles([])}
                  className="text-text-tertiary hover:text-text-primary transition-colors underline"
                >
                  清空
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-primary">
                CSV Manifest <span className="font-normal text-text-tertiary">（可选）</span>
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setManifest(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-bg-tertiary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text-primary hover:file:bg-border-secondary"
              />
            </div>

            <button
              onClick={() => submit.mutate()}
              disabled={files.length === 0 || submit.isPending}
              className="w-full flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium bg-info-text text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              <FileUp className="w-3.5 h-3.5" />
              {submit.isPending ? '提交中...' : '开始批量分析'}
            </button>

            {submit.isError && (
              <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text">
                {submit.error.message}
              </div>
            )}
          </div>
        </div>
      )}

      {jobId && !batchData && status.isLoading && (
        <div className="rounded-lg border border-border bg-bg-primary p-12 flex flex-col items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin mb-2 text-text-tertiary" />
          <p className="text-xs text-text-secondary">正在获取任务状态...</p>
        </div>
      )}

      {status.isError && (
        <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text mb-4">
          获取任务状态失败：{(status.error as Error).message}
        </div>
      )}

      {batchData && (
        <>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-bg-tertiary rounded-md px-3 py-2.5">
              <div className="text-[10px] text-text-secondary mb-1 tracking-wide">已处理</div>
              <div className="text-lg font-medium tabular-nums text-text-primary">
                {totalCompleted}
                <span className="text-xs font-normal text-text-tertiary">/{totalItems}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-border">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: 'var(--color-info-text)',
                  }}
                />
              </div>
            </div>
            <MetricCard label="正常" value={normalCount} sub={pct(normalCount)} color="success" />
            <MetricCard label="息肉疑似" value={polypCount} sub={pct(polypCount)} color="warning" />
            <MetricCard
              label="内膜癌疑似"
              value={cancerCount}
              sub={cancerCount > 0 ? `${pct(cancerCount)} · 需重点复核` : pct(cancerCount)}
              color="danger"
            />
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-text-primary">
              <span className="font-medium">当前任务</span>
              <span className="text-text-secondary"> · {new Date().toLocaleDateString('zh-CN')} 上午门诊</span>
            </div>
            <div className="flex items-center gap-2">
              {isRunning && (
                <button className="flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary transition-colors">
                  <Pause className="w-3 h-3" />
                  暂停
                </button>
              )}
              {isCompleted && batchData.results.length > 0 && (
                <button
                  onClick={() => exportCSV(batchData.results)}
                  className="flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                  <Download className="w-3 h-3" />
                  导出 CSV
                </button>
              )}
              <button
                onClick={resetJob}
                className="rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary transition-colors"
              >
                新建任务
              </button>
            </div>
          </div>

          {batchData.results.length > 0 && (
            <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>病例编号</th>
                    <th>图像</th>
                    <th>模型预测</th>
                    <th>置信度</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {batchData.results.map((r, i) => {
                    const classType = classFromLabel(r.predicted_class_zh)
                    const st = getStatusLabel(i, totalCompleted)
                    return (
                      <tr key={r.case_id}>
                        <td className="font-mono text-[11px] tabular-nums text-text-primary">
                          {r.case_id}
                        </td>
                        <td className="text-[11px] text-text-secondary">{r.filename}</td>
                        <td>
                          <ClassBadge type={classType} label={r.predicted_class_zh} showDot />
                        </td>
                        <td className="tabular-nums text-text-primary">
                          {(r.confidence * 100).toFixed(1)}%
                        </td>
                        <td>
                          <span
                            className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md font-medium ${statusClass[st.style]}`}
                          >
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {isCompleted && batchData.results.length === 0 && (
            <div className="rounded-lg border border-border bg-bg-primary p-12 text-center">
              <p className="text-xs text-text-secondary">任务已完成，但没有结果数据</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
