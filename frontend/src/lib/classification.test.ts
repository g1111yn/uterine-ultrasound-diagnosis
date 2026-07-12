import { describe, expect, it } from 'vitest'
import { classFromLabel, JUDGMENT_LABELS_ZH } from './classification'

describe('classification helpers', () => {
  it('recognizes the indeterminate physician judgment', () => {
    expect(classFromLabel('无法判断 / 需进一步检查')).toBe('indeterminate')
    expect(classFromLabel('需进一步检查')).toBe('indeterminate')
    expect(JUDGMENT_LABELS_ZH.indeterminate).toContain('无法判断')
  })
})
