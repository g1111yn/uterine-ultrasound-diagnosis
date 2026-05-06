interface Props {
  originalUrl: string
  gradcamUrl: string
}

export default function GradCAMViewer({ originalUrl, gradcamUrl }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-text-secondary">
          注意力热图（Grad-CAM）
        </h3>
        <span className="text-[11px] font-mono text-text-tertiary">高 ← → 低</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] mb-1 text-text-tertiary">原图</div>
          <div className="rounded-md overflow-hidden border border-border">
            <img
              src={originalUrl}
              alt="原始超声图像"
              className="w-full h-48 object-contain bg-[#0e0e10]"
            />
          </div>
        </div>
        <div>
          <div className="text-[11px] mb-1 text-text-tertiary">Grad-CAM</div>
          <div className="rounded-md overflow-hidden border border-border">
            <img
              src={gradcamUrl}
              alt="Grad-CAM 热图"
              className="w-full h-48 object-contain bg-[#0e0e10]"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
