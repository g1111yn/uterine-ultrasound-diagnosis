import { create } from 'zustand'

interface AppState {
  confidenceThreshold: number
  setConfidenceThreshold: (value: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  confidenceThreshold: Number(localStorage.getItem('confidenceThreshold') ?? '0.5'),
  setConfidenceThreshold: (value: number) => {
    localStorage.setItem('confidenceThreshold', String(value))
    set({ confidenceThreshold: value })
  },
}))
