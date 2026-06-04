import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  maxCount?: number
  maxSizeMB?: number
}

const ACCEPT = 'image/jpeg,image/png,image/bmp,image/tiff,.dcm,application/dicom'
const ACCEPTED_EXT = ['jpg', 'jpeg', 'png', 'bmp', 'tif', 'tiff', 'dcm']

function isAcceptedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ACCEPTED_EXT.includes(ext)
}

function isDicom(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MultiImageUploader({
  files,
  onChange,
  maxCount = 30,
  maxSizeMB = 50,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addFiles = useCallback(
    (incoming: File[]) => {
      const remaining = maxCount - files.length
      if (remaining <= 0) {
        setError(`最多上传 ${maxCount} 张图片`)
        return
      }
      const filtered: File[] = []
      const errors: string[] = []
      for (const f of incoming.slice(0, remaining)) {
        if (!isAcceptedFile(f)) {
          errors.push(`${f.name}：不支持的格式`)
          continue
        }
        if (f.size > maxSizeMB * 1024 * 1024) {
          errors.push(`${f.name}：超过 ${maxSizeMB} MB`)
          continue
        }
        filtered.push(f)
      }
      if (incoming.length > remaining) {
        errors.push(`仅保留前 ${remaining} 张，已达上限`)
      }
      setError(errors.length ? errors.join('；') : null)
      if (filtered.length) {
        onChange([...files, ...filtered])
      }
    },
    [files, maxCount, maxSizeMB, onChange],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles],
  )

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files))
      }
      e.target.value = ''
    },
    [addFiles],
  )

  const removeAt = useCallback(
    (idx: number) => {
      onChange(files.filter((_, i) => i !== idx))
      setError(null)
    },
    [files, onChange],
  )

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-text-secondary">
          超声图像
          <span className="ml-1 text-text-tertiary font-normal">
            （{files.length}/{maxCount}）
          </span>
        </label>
        {files.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange([])
              setError(null)
            }}
            className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors underline"
          >
            清空
          </button>
        )}
      </div>

      {files.length === 0 ? (
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
              : 'border-border-secondary bg-bg-primary hover:bg-bg-tertiary'
          }`}
        >
          <Upload className="w-6 h-6 mb-2 text-text-tertiary" />
          <p className="text-xs text-text-secondary">
            拖拽图像到此处，或点击选择文件（最多 {maxCount} 张）
          </p>
          <p className="text-[11px] mt-1 text-text-tertiary">
            支持 JPG / PNG / BMP / TIFF / DICOM，单张 ≤ {maxSizeMB} MB
          </p>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onInputChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {files.map((f, idx) => (
              <Thumbnail key={`${f.name}-${idx}`} file={f} onRemove={() => removeAt(idx)} />
            ))}
            {files.length < maxCount && (
              <label className="shrink-0 w-20 h-20 rounded-md border border-dashed border-border-secondary bg-bg-primary hover:bg-bg-tertiary flex items-center justify-center cursor-pointer transition-colors">
                <Upload className="w-4 h-4 text-text-tertiary" />
                <input
                  type="file"
                  accept={ACCEPT}
                  multiple
                  onChange={onInputChange}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-warning-border bg-warning-bg p-2 text-[11px] text-warning-text">
          {error}
        </div>
      )}
    </div>
  )
}

function Thumbnail({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (isDicom(file)) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    urlRef.current = url
    setPreview(url)
    return () => {
      URL.revokeObjectURL(url)
      urlRef.current = null
    }
  }, [file])

  return (
    <div className="relative shrink-0 w-20 h-20 rounded-md overflow-hidden border border-border bg-bg-tertiary group">
      {preview ? (
        <img src={preview} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary px-1">
          <ImageIcon className="w-4 h-4 mb-0.5" />
          <span className="text-[9px] text-center truncate w-full">{file.name}</span>
          <span className="text-[9px]">DICOM</span>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`移除 ${file.name}`}
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-bg-primary/90 text-text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-2.5 h-2.5" />
      </button>
      <div className="absolute bottom-0 inset-x-0 bg-bg-primary/80 text-[9px] px-1 py-px text-text-secondary truncate">
        {formatSize(file.size)}
      </div>
    </div>
  )
}
