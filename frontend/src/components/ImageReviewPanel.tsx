import { useState } from 'react'
import { getGradcamUrl, getImageUrl } from '@/api/client'
import type { CaseImage } from '@/lib/types'
import ClassBadge from './ClassBadge'
import ProbabilityBars from './ProbabilityBars'

interface Props {
  images: CaseImage[]
}

interface StableImageProps {
  src: string
  alt: string
  errorText: string
}

function StableImage({ src, alt, errorText }: StableImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-bg-tertiary text-[11px] text-text-tertiary">
        {errorText}
      </div>
    )
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-[#0e0e10]">
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </div>
  )
}

function ImageReviewCollection({ images }: Props) {
  const [activeImageId, setActiveImageId] = useState<string | null>(
    images[0]?.image_id ?? null,
  )
  const activeIdx = images.findIndex((image) => image.image_id === activeImageId)
  const displayIdx = activeIdx >= 0 ? activeIdx : 0
  const activeImage = images[displayIdx]
  const imagePrediction = activeImage?.per_image_prediction ?? null

  if (!activeImage) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-bg-primary p-4">
        <h2 className="text-xs font-medium text-text-secondary">影像阅片</h2>
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-border-secondary bg-bg-tertiary text-xs text-text-tertiary">
          暂无影像
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-bg-primary p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium text-text-secondary">
          影像阅片（{images.length}）
        </h2>
        <span className="max-w-[50%] truncate text-[11px] text-text-tertiary">
          {activeImage.original_filename}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="text-[11px] text-text-tertiary">原图</div>
          <StableImage
            key={`original-${activeImage.image_id}`}
            src={getImageUrl(activeImage.image_id)}
            alt={`原图 ${displayIdx + 1}`}
            errorText="原图加载失败"
          />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] text-text-tertiary">Grad-CAM</div>
          {imagePrediction ? (
            <StableImage
              key={`gradcam-${activeImage.image_id}`}
              src={getGradcamUrl(activeImage.image_id)}
              alt={`Grad-CAM ${displayIdx + 1}`}
              errorText="热图加载失败"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-bg-tertiary text-[11px] text-text-tertiary">
              暂无热图
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pt-1">
        {images.map((image, index) => (
          <button
            key={image.image_id}
            type="button"
            onClick={() => setActiveImageId(image.image_id)}
            aria-label={`查看第 ${index + 1} 张图像`}
            aria-pressed={index === displayIdx}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border transition-colors ${
              index === displayIdx
                ? 'border-info-border'
                : 'border-border hover:border-border-secondary'
            }`}
          >
            <img
              src={getImageUrl(image.image_id)}
              alt=""
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-0 left-0 bg-bg-primary/80 px-1 py-px text-[9px] tabular-nums text-text-primary">
              {index + 1}
            </span>
          </button>
        ))}
      </div>

      {imagePrediction ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium text-text-secondary">本图预测</div>
            <ClassBadge
              type={imagePrediction.predicted_class}
              label={imagePrediction.predicted_class_zh}
              confidence={imagePrediction.confidence}
            />
          </div>
          <ProbabilityBars probabilities={imagePrediction.probabilities} />
          <div className="text-[10px] tabular-nums text-text-tertiary">
            {imagePrediction.model_version} · 推理{' '}
            {(imagePrediction.inference_ms / 1000).toFixed(2)} s
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-3 text-[11px] text-text-tertiary">
          暂无逐图预测
        </div>
      )}
    </div>
  )
}

export default function ImageReviewPanel({ images }: Props) {
  const collectionSignature = JSON.stringify(images.map((image) => image.image_id))

  return <ImageReviewCollection key={collectionSignature} images={images} />
}
