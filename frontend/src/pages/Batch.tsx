import { useCallback, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Upload, FileUp, Loader2, Ban, Archive } from 'lucide-react'
import { postBatchPredict, getBatchStatus, cancelBatch } from '@/api/client'
import MetricCard from '@/components/MetricCard'
import ClassBadge, { classFromLabel } from '@/components/ClassBadge'
import type { AggregationStrategy, BatchStatusResponse } from '@/lib/types'

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

const strategyOptions: { value: AggregationStrategy; label: string }[] = [
  { value: 'mean', label: '平均（mean）' },
  { value: 'max_severity', label: '最严重优先（max_severity）' },
  { value: 'majority_vote', label: '多数投票（majority_vote）' },
]

function formatRemaining(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
}

export default function Batch() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [archive, setArchive] = useState<File | null>(null)
  const [strategy, setStrategy] = useState<AggregationStrategy>('mean')
  const [dragging, setDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const submit = useMutation({
    mutationFn: () => postBatchPredict(archive!, strategy),
    onSuccess: (data) => setJobId(data.job_id),
  })

  const status = useQuery<BatchStatusResponse>({
    queryKey: ['batch-status', jobId],
    queryFn: () => getBatchStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' || s === 'queued' ? 2000 : false
    },
  })

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.toLowerCase().endsWith('.zip') || f.type === 'application/zip')) {
      setArchive(f)
    }
  }, [])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setArchive(f)
  }, [])

  const resetJob = useCallback(() => {
    setJobId(null)
    setArchive(null)
    submit.reset()
  }, [submit])

  const handleCancel = useCallback(async () => {
    if (!jobId) return
    if (!confirm('确定取消当前批量任务？已完成的结果会保留。')) return
    setCancelling(true)
    try {
      await cancelBatch(jobId)
      await queryClient.invalidateQueries({ queryKey: ['batch-status', jobId] })
    } catch {
      // 错误由 status 查询展示
    } finally {
      setCancelling(false)
    }
  }, [jobId, queryClient])

  const data = status.data
  const isRunning = data?.status === 'running' || data?.status === 'queued'
  const progressImages = data && data.total_images > 0
    ? (data.completed_images / data.total_images) * 100
    : 0
  const progressPatients = data && data.total_patients > 0
    ? (data.completed_patients / data.total_patients) * 100
    : 0

  // 从 results 临时统计
  const completedResults = data?.results.filter((r) => r.predicted_class_zh) ?? []
  const normalCount = completedResults.filter((r) => r.predicted_class === 'normal').length
  const polypCount = completedResults.filter((r) => r.predicted_class === 'polyp').length
  const cancerCount = completedResults.filter((r) => r.predicted_class === 'endometrial_cancer').length

  return (
    <div className="max-w-5xl mx-auto">
      {!jobId && (
        <div className="space-y-4">
          <h1 className="text-text-primary">批量推理</h1>

          <div className="rounded-lg border border-border bg-bg-primary p-5 space-y-4">
            <div>
              <div className="text-xs font-medium text-text-primary mb-2">
                Step 1 · 上传 ZIP 压缩包
              </div>
              <div className="text-[11px] text-text-tertiary leading-relaxed space-y-0.5">
                <p>ZIP 根目录需包含：</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    <span className="font-mono">manifest.csv</span>
                    ：列 <span className="font-mono">patient_no, clinical_text</span>
                    （每个病人一行，<span className="text-text-secondary">clinical_text 可留空，留空将以纯图像模式推理</span>）
                  </li>
                  <li>
                    为每个病人创建一个以 <span className="font-mono">patient_no</span> 命名的子目录，内含该病人的所有超声图像（jpg/png/bmp/tiff/dcm）
                  </li>
                </ul>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`relative flex flex-col items-center justify-center h-40 rounded-md border border-dashed cursor-pointer transition-colors ${
                dragging
                  ? 'border-info-border bg-info-bg'
                  : 'border-border-secondary bg-bg-secondary hover:bg-bg-tertiary'
              }`}
            >
              {archive ? (
                <>
                  <Archive className="w-6 h-6 mb-2 text-text-tertiary" />
                  <p className="text-xs text-text-primary">{archive.name}</p>
                  <p className="text-[11px] mt-1 text-text-tertiary tabular-nums">
                    {(archive.size / (1024 * 1024)).toFixed(1)} MB · 点击重新选择
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 mb-2 text-text-tertiary" />
                  <p className="text-xs text-text-secondary">拖拽一个 ZIP 文件到此处，或点击选择</p>
                  <p className="text-[11px] mt-1 text-text-tertiary">仅支持 .zip 压缩包</p>
                </>
              )}
              <input
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={onFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-primary">聚合策略</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as AggregationStrategy)}
                className="w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-info-border transition-colors"
              >
                {strategyOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-text-tertiary">
                多张图像聚合到病人级预测时使用的策略
              </p>
            </div>

            <button
              onClick={() => submit.mutate()}
              disabled={!archive || submit.isPending}
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

      {jobId && !data && status.isLoading && (
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

      {data && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-medium text-text-primary">
                Step 2 · 批量推理进度
              </div>
              <div className="text-[11px] text-text-tertiary tabular-nums mt-0.5">
                任务 {data.job_id.slice(0, 10)} · 聚合 {data.aggregation_strategy}
                {data.current_patient && ` · 当前：${data.current_patient}`}
                {isRunning && ` · 剩余 ${formatRemaining(data.estimated_remaining_ms)}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 transition-colors"
                >
                  <Ban className="w-3 h-3" />
                  {cancelling ? '取消中...' : '取消批量'}
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

          <div className="grid grid-cols-5 gap-3 mb-5">
            <div className="bg-bg-tertiary rounded-md px-3 py-2.5">
              <div className="text-[10px] text-text-secondary mb-1 tracking-wide">病人</div>
              <div className="text-lg font-medium tabular-nums text-text-primary">
                {data.completed_patients}
                <span className="text-xs font-normal text-text-tertiary">/{data.total_patients}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-border">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPatients}%`,
                    backgroundColor: 'var(--color-info-text)',
                  }}
                />
              </div>
            </div>
            <div className="bg-bg-tertiary rounded-md px-3 py-2.5">
              <div className="text-[10px] text-text-secondary mb-1 tracking-wide">图像</div>
              <div className="text-lg font-medium tabular-nums text-text-primary">
                {data.completed_images}
                <span className="text-xs font-normal text-text-tertiary">/{data.total_images}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-border">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressImages}%`,
                    backgroundColor: 'var(--color-info-text)',
                  }}
                />
              </div>
            </div>
            <MetricCard label="正常" value={normalCount} color="success" />
            <MetricCard label="息肉" value={polypCount} color="warning" />
            <MetricCard label="内膜癌" value={cancerCount} color="danger" />
          </div>

          {data.status === 'failed' && data.error && (
            <div className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-text mb-4">
              任务失败：{data.error}
            </div>
          )}

          {data.status === 'cancelled' && (
            <div className="rounded-md border border-warning-border bg-warning-bg p-2.5 text-xs text-warning-text mb-4">
              任务已取消
            </div>
          )}

          {data.results.length > 0 && (
            <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>病人编号</th>
                    <th>图像数</th>
                    <th>模型预测</th>
                    <th>置信度</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => {
                    const classType = r.predicted_class_zh
                      ? classFromLabel(r.predicted_class_zh)
                      : null
                    return (
                      <tr key={r.patient_no}>
                        <td className="font-mono text-[11px] tabular-nums text-text-primary">
                          {r.patient_no}
                        </td>
                        <td className="text-[11px] text-text-secondary tabular-nums">
                          {r.image_count}
                        </td>
                        <td>
                          {r.predicted_class_zh ? (
                            <ClassBadge type={classType} label={r.predicted_class_zh} showDot />
                          ) : r.error ? (
                            <span className="text-[11px] text-danger-text">{r.error}</span>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="tabular-nums text-text-primary">
                          {r.confidence !== null && r.confidence !== undefined
                            ? `${(r.confidence * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td>
                          {r.case_id ? (
                            <button
                              onClick={() => navigate(`/case/${r.case_id}`)}
                              className="text-[11px] font-medium text-info-text hover:opacity-80 transition-opacity"
                            >
                              查看
                            </button>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.status === 'completed' && data.results.length === 0 && (
            <div className="rounded-lg border border-border bg-bg-primary p-12 text-center">
              <p className="text-xs text-text-secondary">任务已完成，但没有结果数据</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
