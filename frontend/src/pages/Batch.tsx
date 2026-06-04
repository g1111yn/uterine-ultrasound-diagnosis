import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  FileUp,
  Loader2,
  Ban,
  Archive,
  Download,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { postBatchPredict, getBatchStatus, cancelBatch } from '@/api/client'
import MetricCard from '@/components/MetricCard'
import ClassBadge, { classFromLabel } from '@/components/ClassBadge'
import type {
  AggregationStrategy,
  BatchDiagnostic,
  BatchStatusResponse,
} from '@/lib/types'

const tableClass =
  'w-full text-xs border-collapse ' +
  '[&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:font-medium [&_th]:text-text-secondary [&_th]:text-[11px] [&_th]:border-b [&_th]:border-border ' +
  '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-border ' +
  '[&_tr:last-child_td]:border-b-0'

const strategyOptions: { value: AggregationStrategy; label: string; hint: string }[] = [
  { value: 'mean', label: '平均（mean）', hint: '推荐，对多张图概率取均值，结果稳健' },
  { value: 'max_severity', label: '最严重优先（max_severity）', hint: '任一图癌概率超阈值即判癌，更激进' },
  { value: 'majority_vote', label: '多数投票（majority_vote）', hint: '按预测类别投票，图像质量差异大时使用' },
]

const MANIFEST_TEMPLATE = `patient_no,clinical_text,check_project
20260520-001,内膜厚约 5mm 回声均匀,经阴道三维超声
20260520-002,,经腹超声
20260520-003,可见息肉样回声,经阴道三维超声
`

function formatRemaining(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
}

function downloadManifestTemplate() {
  // BOM 让 Excel 直接识别 UTF-8
  const blob = new Blob(['﻿' + MANIFEST_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'manifest.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// --- 子组件：步骤卡片标题 ---
function StepHeader({ index, title, hint }: { index: number; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-bg-tertiary text-[11px] font-semibold tabular-nums text-text-primary">
        {index}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary leading-tight">{title}</div>
        {hint && <div className="text-[11px] text-text-tertiary mt-0.5">{hint}</div>}
      </div>
    </div>
  )
}

// --- 子组件：诊断信息分类显示 ---
function DiagnosticIcon({ kind }: { kind: BatchDiagnostic['kind'] }) {
  // 区分严重度：跳过型用 warning 色，提示型用 info 色
  const isSevere = kind === 'missing_directory' || kind === 'empty_patient_no'
  if (isSevere) return <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-warning-text" />
  return <Info className="w-3.5 h-3.5 shrink-0 text-info-text" />
}

function DiagnosticList({
  title,
  diagnostics,
  tone,
}: {
  title: string
  diagnostics: BatchDiagnostic[]
  tone: 'warning' | 'danger'
}) {
  const [open, setOpen] = useState(true)
  if (diagnostics.length === 0) return null
  const toneClass =
    tone === 'danger'
      ? 'border-danger-border bg-danger-bg'
      : 'border-warning-border bg-warning-bg'
  const titleClass = tone === 'danger' ? 'text-danger-text' : 'text-warning-text'
  const Icon = tone === 'danger' ? AlertCircle : AlertTriangle
  return (
    <div className={`rounded-md border ${toneClass}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium ${titleClass}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">
          {title}（{diagnostics.length} 条）
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <ul className="px-3 pb-2.5 space-y-1.5">
          {diagnostics.map((d, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[11px] leading-relaxed text-text-primary"
            >
              <DiagnosticIcon kind={d.kind} />
              <span className="flex-1">{d.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Batch() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [archive, setArchive] = useState<File | null>(null)
  const [strategy, setStrategy] = useState<AggregationStrategy>('mean')
  const [dragging, setDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<BatchDiagnostic[]>([])
  const [cancelling, setCancelling] = useState(false)

  const submit = useMutation({
    mutationFn: () => postBatchPredict(archive!, strategy),
    onSuccess: (data) => {
      if (data.warnings?.length) {
        setJobId(data.job_id)
        setWarnings(data.warnings)
      } else {
        navigate(`/batch/${data.job_id}`)
      }
    },
  })

  // 提取错误中的 details（来自 client.ts 的 axios interceptor）
  const submitErrorDetails = useMemo<BatchDiagnostic[]>(() => {
    const e = submit.error as (Error & { details?: BatchDiagnostic[] }) | null
    return e?.details ?? []
  }, [submit.error])

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
    setWarnings([])
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
  const progressImages =
    data && data.total_images > 0 ? (data.completed_images / data.total_images) * 100 : 0
  const progressPatients =
    data && data.total_patients > 0
      ? (data.completed_patients / data.total_patients) * 100
      : 0

  const completedResults = data?.results.filter((r) => r.predicted_class_zh) ?? []
  const normalCount = completedResults.filter((r) => r.predicted_class === 'normal').length
  const polypCount = completedResults.filter((r) => r.predicted_class === 'polyp').length
  const cancerCount = completedResults.filter((r) => r.predicted_class === 'endometrial_cancer').length

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {!jobId && (
        <>
          <div className="mb-6">
            <h1 className="text-text-primary text-base font-medium">批量推理</h1>
            <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
              一次提交多个病人，系统在后台逐个推理。左侧为操作说明，右侧直接上传提交。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,420px)] gap-5">
            {/* 左栏 — 操作说明 */}
            <div className="space-y-3 order-2 lg:order-1">
              {/* Step 1 — 准备 manifest.csv */}
              <section className="rounded-lg border border-border bg-bg-primary p-5">
                <div className="flex items-start justify-between gap-4">
                  <StepHeader
                    index={1}
                    title="准备 manifest.csv"
                    hint="一个表格，告诉系统每位病人的检查描述"
                  />
                  <button
                    onClick={downloadManifestTemplate}
                    className="shrink-0 flex items-center gap-1.5 rounded-md border border-border-secondary bg-bg-primary px-2.5 py-1.5 text-[11px] font-medium text-text-primary hover:bg-bg-tertiary transition-colors"
                    title="下载示例 manifest.csv"
                  >
                    <Download className="w-3 h-3" />
                    下载示例
                  </button>
                </div>

                <div className="ml-9 space-y-3">
                  {/* 列说明 */}
                  <div className="rounded-md border border-border bg-bg-secondary overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-3 py-1.5 font-medium text-text-secondary w-32">
                            列名
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium text-text-secondary w-16">
                            必填
                          </th>
                          <th className="text-left px-3 py-1.5 font-medium text-text-secondary">
                            说明
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="px-3 py-2 font-mono text-text-primary">patient_no</td>
                          <td className="px-3 py-2 text-danger-text">必填</td>
                          <td className="px-3 py-2 text-text-secondary leading-relaxed">
                            病人编号，需与 ZIP 中的子目录名 <span className="font-mono">完全一致</span>
                          </td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="px-3 py-2 font-mono text-text-primary">clinical_text</td>
                          <td className="px-3 py-2 text-danger-text">必填</td>
                          <td className="px-3 py-2 text-text-secondary leading-relaxed">
                            检查所见。<span className="text-text-tertiary">列必须存在；行内容可空，留空则按纯图像推理</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 font-mono text-text-primary">check_project</td>
                          <td className="px-3 py-2 text-text-tertiary">可选</td>
                          <td className="px-3 py-2 text-text-secondary leading-relaxed">
                            检查方式。缺省为 <span className="font-mono">经阴道三维超声</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 编码 + 注意事项 */}
                  <ul className="text-[11px] text-text-tertiary space-y-1 leading-relaxed list-disc pl-4">
                    <li>
                      保存为 <span className="font-mono text-text-secondary">UTF-8</span> 编码
                      。Excel 用户请选「另存为 → CSV UTF-8」
                    </li>
                    <li>列名大小写敏感，写错的列会被忽略</li>
                    <li>
                      <span className="font-mono text-text-secondary">patient_no</span>
                      需与图像目录名严格一致（含大小写、空格）
                    </li>
                  </ul>
                </div>
              </section>

              {/* Step 2 — 组织图像目录 */}
              <section className="rounded-lg border border-border bg-bg-primary p-5">
                <StepHeader
                  index={2}
                  title="组织图像目录"
                  hint="按病人编号建子目录，每个目录放该病人的所有图像"
                />

                <div className="ml-9">
                  <div className="rounded-md border border-border bg-bg-secondary p-3 font-mono text-[11px] leading-relaxed text-text-primary overflow-x-auto">
                    <div>
                      your_batch.zip<span className="text-text-tertiary">          ← 你要上传的压缩包</span>
                    </div>
                    <div>
                      ├── manifest.csv<span className="text-text-tertiary">         ← 必须放在 ZIP 根目录</span>
                    </div>
                    <div>
                      ├── 20260520-001/<span className="text-text-tertiary">        ← 病人编号 = manifest 中的 patient_no</span>
                    </div>
                    <div className="text-text-tertiary">│   ├── img1.jpg</div>
                    <div className="text-text-tertiary">│   ├── img2.png</div>
                    <div className="text-text-tertiary">│   └── scan.dcm</div>
                    <div>├── 20260520-002/</div>
                    <div className="text-text-tertiary">│   └── ...</div>
                    <div>└── 20260520-003/</div>
                    <div className="text-text-tertiary">    └── ...</div>
                  </div>

                  <ul className="mt-3 text-[11px] text-text-tertiary space-y-1 leading-relaxed list-disc pl-4">
                    <li>
                      支持的图像格式：
                      <span className="font-mono text-text-secondary">jpg / png / bmp / tiff / dcm</span>
                    </li>
                    <li>每位病人最多 30 张图像，超出会被截断</li>
                    <li>ZIP 解压后总大小不超过 500 MB</li>
                  </ul>
                </div>
              </section>
            </div>

            {/* 右栏 — 上传与提交（粘性定位，操作熟练后专注这里） */}
            <div className="order-1 lg:order-2">
              <section className="rounded-lg border border-border bg-bg-primary p-5 lg:sticky lg:top-4">
                <div className="flex items-baseline gap-2 mb-3">
                  <FileUp className="w-3.5 h-3.5 self-center text-accent" />
                  <h2 className="text-sm font-medium text-text-primary leading-tight">
                    上传压缩包
                  </h2>
                </div>

                <div className="space-y-3">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={`relative flex flex-col items-center justify-center h-40 rounded-md border border-dashed cursor-pointer transition-colors ${
                      dragging
                        ? 'border-accent bg-bg-secondary'
                        : 'border-border-secondary bg-bg-secondary hover:bg-bg-tertiary'
                    }`}
                  >
                    {archive ? (
                      <>
                        <Archive className="w-6 h-6 mb-2 text-text-tertiary" />
                        <p className="text-xs text-text-primary font-medium px-3 text-center break-all">{archive.name}</p>
                        <p className="text-[11px] mt-1 text-text-tertiary tabular-nums">
                          {(archive.size / (1024 * 1024)).toFixed(1)} MB · 点击重新选择
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 mb-2 text-text-tertiary" />
                        <p className="text-xs text-text-secondary">
                          拖拽 ZIP 文件到此处，或点击选择
                        </p>
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
                    <label className="text-[11px] font-medium text-text-secondary">
                      聚合策略
                    </label>
                    <select
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value as AggregationStrategy)}
                      className="w-full rounded-md border border-border-secondary bg-bg-primary px-3 py-2 text-xs text-text-primary outline-none focus:border-accent transition-colors"
                    >
                      {strategyOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-text-tertiary leading-relaxed">
                      {strategyOptions.find((o) => o.value === strategy)?.hint}
                    </p>
                  </div>

                  <button
                    onClick={() => submit.mutate()}
                    disabled={!archive || submit.isPending}
                    className="w-full flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent transition-colors"
                  >
                    {submit.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        正在校验并提交...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-3.5 h-3.5" />
                        开始批量分析
                      </>
                    )}
                  </button>

                  {submit.isError && (
                    <div className="space-y-2">
                      <div className="rounded-md border border-danger-border bg-danger-bg p-3 text-xs text-danger-text">
                        <div className="font-medium mb-0.5">提交失败</div>
                        <div className="text-[11px] leading-relaxed">{submit.error.message}</div>
                      </div>
                      {submitErrorDetails.length > 0 && (
                        <DiagnosticList
                          title="详细问题清单"
                          diagnostics={submitErrorDetails}
                          tone="danger"
                        />
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
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
          {/* 提交成功后的 warning 提示 */}
          {warnings.length > 0 && (
            <div className="mb-4">
              <DiagnosticList
                title="提交成功，但有 manifest 警告"
                diagnostics={warnings}
                tone="warning"
              />
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success-text" />
                <h1 className="text-text-primary text-base font-medium">批量推理进度</h1>
              </div>
              <div className="text-[11px] text-text-tertiary tabular-nums mt-1 ml-6">
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
                <span className="text-xs font-normal text-text-tertiary">
                  /{data.total_patients}
                </span>
              </div>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-border">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPatients}%`,
                    backgroundColor: 'var(--color-accent)',
                  }}
                />
              </div>
            </div>
            <div className="bg-bg-tertiary rounded-md px-3 py-2.5">
              <div className="text-[10px] text-text-secondary mb-1 tracking-wide">图像</div>
              <div className="text-lg font-medium tabular-nums text-text-primary">
                {data.completed_images}
                <span className="text-xs font-normal text-text-tertiary">
                  /{data.total_images}
                </span>
              </div>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-border">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressImages}%`,
                    backgroundColor: 'var(--color-accent)',
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
                              className="text-[11px] font-medium text-accent hover:text-accent-hover transition-colors"
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
