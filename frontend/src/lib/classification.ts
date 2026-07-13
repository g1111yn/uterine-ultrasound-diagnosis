import type { JudgmentClass } from './types'

export type ClassificationClass = JudgmentClass

export const PREDICTION_LABELS_ZH = {
  normal: '子宫正常大',
  endometrial_cancer: '子宫内膜癌',
  polyp: '息肉',
} as const

export const JUDGMENT_LABELS_ZH = {
  ...PREDICTION_LABELS_ZH,
  normal: '正常',
  endometrial_cancer: '疑似子宫内膜癌',
  indeterminate: '无法判断 / 需进一步检查',
} as const

export function classFromLabel(label: string | null | undefined): ClassificationClass | null {
  if (!label) return null
  if (label.includes('无法判断') || label.includes('需进一步检查')) return 'indeterminate'
  if (label.includes('内膜癌')) return 'endometrial_cancer'
  if (label.includes('息肉')) return 'polyp'
  if (label.includes('正常')) return 'normal'
  return null
}
