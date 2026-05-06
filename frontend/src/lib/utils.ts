import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const CLASS_LABELS_ZH: Record<string, string> = {
  normal: '子宫正常大',
  endometrial_cancer: '子宫内膜癌',
  polyp: '息肉',
}

export function formatConfidence(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
