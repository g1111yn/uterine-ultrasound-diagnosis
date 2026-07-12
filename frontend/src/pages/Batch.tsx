import { useCallback, useMemo, useState, type ChangeEvent, type DragEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Upload,
  FileUp,
  Loader2,
  Archive,
  Download,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { postBatchPredict } from '@/api/client'
import type {
  AggregationStrategy,
  BatchDiagnostic,
} from '@/lib/types'
import BatchNav from '@/components/BatchNav'
import WorkspaceContainer from '@/components/WorkspaceContainer'

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
  const [archive, setArchive] = useState<File | null>(null)
  const [strategy, setStrategy] = useState<AggregationStrategy>('mean')
  const [dragging, setDragging] = useState(false)

  const submit = useMutation({
    mutationFn: () => postBatchPredict(archive!, strategy),
    onSuccess: (data) => {
      navigate(`/batch/${data.job_id}`)
    },
  })

  const submitErrorDetails = useMemo<BatchDiagnostic[]>(() => {
    const e = submit.error as (Error & { details?: BatchDiagnostic[] }) | null
    return e?.details ?? []
  }, [submit.error])

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

  return (
    <WorkspaceContainer className="pb-12">
      <BatchNav />
      <div className="mb-4">
        <h1 className="text-text-primary text-base font-medium">批量推理</h1>
        <p className="text-[11px] text-text-tertiary mt-1 leading-relaxed">
          一次提交多个病人，系统在后台逐个推理。
        </p>
      </div>

          <div className="flex flex-col gap-4">
            <details className="order-2 rounded-lg border border-border bg-bg-primary">
              <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-text-secondary hover:bg-bg-tertiary transition-colors">
                上传文件准备说明
              </summary>
              <div className="space-y-3 px-4 pb-4">
              {/* Step 1 — 准备 manifest.csv */}
              <section className="p-3">
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
              <section className="border-t border-border p-3 pt-4">
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
            </details>

            <div className="order-1">
              <section className="rounded-lg border border-border bg-bg-primary p-5">
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
    </WorkspaceContainer>
  )
}
