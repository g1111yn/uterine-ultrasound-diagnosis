import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { CaseImage } from '@/lib/types'
import { getImageUrl, getGradcamUrl } from '@/api/client'
import ProbabilityBars from './ProbabilityBars'
import ClassBadge from './ClassBadge'

const classTypeMap: Record<string, 'normal' | 'endometrial_cancer' | 'polyp'> = {
  normal: 'normal',
  endometrial_cancer: 'endometrial_cancer',
  polyp: 'polyp',
}

interface Props {
  image: CaseImage
  defaultOpen?: boolean
}

export default function PerImagePredictionCard({ image, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const pred = image.per_image_prediction

  return (
    <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-tertiary transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
        )}
        <span className="text-xs font-medium text-text-primary">
          图 {image.sequence + 1}
        </span>
        <span className="text-[11px] text-text-tertiary truncate flex-1">
          {image.original_filename}
        </span>
        {pred && (
          <ClassBadge
            type={classTypeMap[pred.predicted_class]}
            label={pred.predicted_class_zh}
            confidence={pred.confidence}
          />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1.2fr] gap-3">
          <div>
            <div className="text-[11px] mb-1 text-text-tertiary">原图</div>
            <img
              src={getImageUrl(image.image_id)}
              alt={`原图 ${image.sequence + 1}`}
              className="w-full aspect-[4/3] object-contain rounded-md border border-border bg-[#0e0e10]"
            />
          </div>
          <div>
            <div className="text-[11px] mb-1 text-text-tertiary">Grad-CAM</div>
            {pred ? (
              <img
                src={getGradcamUrl(image.image_id)}
                alt={`Grad-CAM ${image.sequence + 1}`}
                className="w-full aspect-[4/3] object-contain rounded-md border border-border bg-[#0e0e10]"
              />
            ) : (
              <div className="w-full aspect-[4/3] rounded-md border border-border bg-bg-tertiary flex items-center justify-center text-[11px] text-text-tertiary">
                暂无热图
              </div>
            )}
          </div>
          <div>
            {pred ? (
              <div className="space-y-2">
                <div>
                  <div className="text-[11px] text-text-tertiary mb-0.5">预测类别</div>
                  <div className="text-sm font-medium text-text-primary">
                    {pred.predicted_class_zh}
                    <span className="ml-2 text-[11px] font-normal text-text-secondary tabular-nums">
                      {(pred.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <ProbabilityBars probabilities={pred.probabilities} />
                <div className="text-[10px] text-text-tertiary tabular-nums">
                  {pred.model_version} · 推理 {(pred.inference_ms / 1000).toFixed(2)} s
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-text-tertiary">暂无预测</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
