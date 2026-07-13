import type { BatchJobStatus, BatchStatusResponse } from './types'

export function getBatchStatusPollingInterval(status?: BatchJobStatus): number {
  return status === 'running' || status === 'queued' ? 3000 : 10000
}

export function getBatchCompletionMessage(batch: BatchStatusResponse): string {
  const active = batch.status === 'running' || batch.status === 'queued'
  if (active) {
    return '当前已完成患者均已诊断，等待其余患者推理完成'
  }
  const hasPendingPrediction = batch.results.some(
    (item) => !item.predicted_class && !item.error,
  )
  if (hasPendingPrediction) {
    return '当前可诊断患者均已完成，任务已结束，仍有患者未生成推理结果'
  }
  if (batch.results.some((item) => Boolean(item.error))) {
    return '当前可诊断患者均已完成，仍有患者推理失败'
  }
  return '本批次已全部诊断'
}
