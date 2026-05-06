import type { Prediction } from '@/lib/types'
import ProbabilityBars from './ProbabilityBars'

const classColorMap: Record<string, 'danger' | 'warning' | 'success'> = {
  endometrial_cancer: 'danger',
  polyp: 'warning',
  normal: 'success',
}

const colorTextMap = {
  danger: 'text-danger-text',
  warning: 'text-warning-text',
  success: 'text-success-text',
}

interface Props {
  prediction: Prediction
  gradcamUrl?: string
}

export default function PredictionResult({ prediction, gradcamUrl }: Props) {
  const predictedColor = classColorMap[prediction.predicted_class] ?? 'success'
  const colorClass = colorTextMap[predictedColor]

  return (
    <div>
      <div className="text-[11px] font-medium text-text-secondary mb-1.5">
        模型判读结果
      </div>

      <div className="flex items-baseline gap-2.5 mb-3.5 flex-wrap">
        <span className={`text-[17px] font-medium ${colorClass}`}>
          {prediction.predicted_class_zh}
        </span>
        <span className="text-xs text-text-secondary tabular-nums">
          置信度 {(prediction.confidence * 100).toFixed(0)}% · {prediction.model_version} · 推理 {(prediction.inference_ms / 1000).toFixed(1)} s
        </span>
      </div>

      <ProbabilityBars probabilities={prediction.probabilities} />

      {gradcamUrl && (
        <>
          <div className="h-px bg-border my-3.5" />
          <div className="flex justify-between text-[11px] text-text-secondary mb-1.5">
            <span>注意力热图（Grad-CAM）</span>
            <span className="font-mono">高 ← → 低</span>
          </div>
          <img
            src={gradcamUrl}
            alt="Grad-CAM heatmap"
            className="w-full aspect-[4/3] object-cover rounded-md border border-border bg-[#0e0e10]"
          />
        </>
      )}
    </div>
  )
}
