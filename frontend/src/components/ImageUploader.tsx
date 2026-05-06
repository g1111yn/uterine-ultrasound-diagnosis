import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react'
import { Upload, X, FileText } from 'lucide-react'

interface Props {
  onFileSelect: (file: File) => void
  accept?: string
}

function isDicomFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImageUploader({
  onFileSelect,
  accept = 'image/jpeg,image/png,.dcm,application/dicom',
}: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [fileSize, setFileSize] = useState<number>(0)
  const [isDicom, setIsDicom] = useState<boolean>(false)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      const dicom = isDicomFile(file)
      setFileName(file.name)
      setFileSize(file.size)
      setIsDicom(dicom)
      if (dicom) {
        setPreview(null)
      } else {
        setPreview(URL.createObjectURL(file))
      }
      onFileSelect(file)
    },
    [onFileSelect],
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const clear = useCallback(() => {
    setPreview(null)
    setFileName('')
    setFileSize(0)
    setIsDicom(false)
  }, [])

  const hasSelection = preview !== null || isDicom

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-text-secondary">超声图像</label>
      {hasSelection ? (
        <div className="relative rounded-md overflow-hidden border border-border">
          {isDicom ? (
            <div className="w-full h-56 flex flex-col items-center justify-center bg-[#0e0e10] text-text-secondary px-4">
              <FileText className="w-6 h-6 mb-2 text-text-tertiary" />
              <p className="text-xs text-text-primary">已选择 DICOM 文件</p>
              <p className="text-[11px] mt-1 text-text-tertiary truncate max-w-full">
                {fileName}（{formatSize(fileSize)}）
              </p>
              <p className="text-[11px] mt-2 text-text-tertiary">分析后将显示解码图像</p>
            </div>
          ) : (
            <img src={preview!} alt="预览" className="w-full h-56 object-contain bg-[#0e0e10]" />
          )}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-bg-primary">
            <span className="text-xs text-text-secondary truncate">{fileName}</span>
            <button
              onClick={clear}
              className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              aria-label="移除图像"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center h-56 rounded-md border border-dashed cursor-pointer transition-colors ${
            dragging
              ? 'border-info-border bg-info-bg'
              : 'border-border-secondary bg-bg-primary hover:bg-bg-tertiary'
          }`}
        >
          <Upload className="w-6 h-6 mb-2 text-text-tertiary" />
          <p className="text-xs text-text-secondary">拖拽图像到此处，或点击选择文件</p>
          <p className="text-[11px] mt-1 text-text-tertiary">支持 JPG / PNG / DICOM 格式</p>
          <input
            type="file"
            accept={accept}
            onChange={onChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </div>
      )}
    </div>
  )
}
