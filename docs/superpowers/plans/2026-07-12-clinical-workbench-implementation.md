# Clinical Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前构建、临床判断和批量任务问题，并在保留现有视觉样式的前提下，将核心前端改造成高利用率的医院超声诊断工作台。

**Architecture:** 后端继续使用现有 FastAPI、SQLAlchemy 和异步推理队列，只扩展医生判断枚举、审计更新与批量失败状态。前端增加少量有明确职责的工作台组件，复用现有 React Query 数据流，并将导航从整行点击改为语义化链接。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Tailwind CSS 4、TanStack Query、Vitest、Testing Library、FastAPI、SQLAlchemy、Python unittest。

---

## File Structure

**Create:**

- `frontend/src/test/setup.ts`：Vitest DOM 与清理配置。
- `frontend/src/lib/classification.ts`：预测类别与医生判断类别的标签和映射。
- `frontend/src/components/WorkspaceContainer.tsx`：统一 1600 px 工作区宽度。
- `frontend/src/components/ClinicalWorkbench.tsx`：三栏响应式布局骨架。
- `frontend/src/components/ImageReviewPanel.tsx`：原图、热图、缩略图与逐图预测。
- `frontend/src/components/AiSuggestionPanel.tsx`：只读 AI 辅助建议。
- `frontend/src/components/BatchNav.tsx`：新建、运行中、历史三个批量标签。
- `frontend/src/hooks/useUnsavedChangesWarning.ts`：判断表单离页提醒。
- `frontend/src/components/JudgmentForm.test.tsx`：医生判断交互测试。
- `frontend/src/pages/History.test.tsx`：病例表格语义链接测试。
- `backend/tests/test_clinical_workflow.py`：医生判断和批量空工作项回归测试。

**Modify:**

- `frontend/package.json`、`frontend/package-lock.json`、`frontend/vite.config.ts`：测试工具链。
- `frontend/src/lib/types.ts`、`frontend/src/lib/utils.ts`：分离预测和医生判断类型。
- `frontend/src/components/ClassBadge.tsx`、`frontend/src/components/MultiImageUploader.tsx`：修复 lint 并复用分类模块。
- `frontend/src/components/JudgmentForm.tsx`：强制主动判断并支持无法判断。
- `frontend/src/components/Layout.tsx`：批量任务入口与紧凑导航。
- `frontend/src/pages/Predict.tsx`、`frontend/src/pages/CaseDetail.tsx`：共享三栏工作台。
- `frontend/src/pages/History.tsx`、`frontend/src/pages/Batch.tsx`、`frontend/src/pages/BatchHistory.tsx`、`frontend/src/pages/BatchDetail.tsx`：宽屏、标签导航、取消和真实链接。
- `frontend/src/App.tsx`、`frontend/src/api/client.ts`：运行中批量路由和状态筛选。
- `frontend/src/pages/Settings.tsx`、`frontend/src/lib/store.ts`：删除无效阈值。
- `backend/app/models/schemas.py`、`backend/app/api/cases.py`：判断枚举、时间和审计。
- `backend/app/services/batch_pipeline.py`、`backend/app/api/batch.py`：空任务、超时和失败原因。

### Task 1: Establish a Green Build and Test Harness

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/lib/classification.ts`
- Modify: `frontend/src/components/ClassBadge.tsx`
- Modify: `frontend/src/components/MultiImageUploader.tsx`
- Modify: `frontend/src/pages/Batch.tsx`
- Modify: `frontend/src/pages/BatchDetail.tsx`

- [ ] **Step 1: Add the failing classification test**

Create `frontend/src/lib/classification.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classFromLabel, JUDGMENT_LABELS_ZH } from './classification'

describe('classification helpers', () => {
  it('recognizes the indeterminate physician judgment', () => {
    expect(classFromLabel('无法判断 / 需进一步检查')).toBe('indeterminate')
    expect(JUDGMENT_LABELS_ZH.indeterminate).toContain('无法判断')
  })
})
```

- [ ] **Step 2: Install and configure the test runner, then verify RED**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm test -- --run src/lib/classification.test.ts
```

Expected: FAIL because `classification.ts` does not exist.

- [ ] **Step 3: Add the minimal classification module and test setup**

Add scripts to `package.json`:

```json
"test": "vitest",
"test:run": "vitest run"
```

Configure Vite with `test.environment = 'jsdom'`, `setupFiles = ['./src/test/setup.ts']`, and create setup:

```ts
import '@testing-library/jest-dom/vitest'
```

Create `classification.ts` with distinct model and judgment labels:

```ts
import type { JudgmentClass, PredictedClass } from '@/lib/types'

export const PREDICTION_LABELS_ZH: Record<PredictedClass, string> = {
  normal: '子宫正常大',
  endometrial_cancer: '子宫内膜癌',
  polyp: '息肉',
}

export const JUDGMENT_LABELS_ZH: Record<JudgmentClass, string> = {
  ...PREDICTION_LABELS_ZH,
  endometrial_cancer: '疑似子宫内膜癌',
  indeterminate: '无法判断 / 需进一步检查',
}

export function classFromLabel(label?: string | null): JudgmentClass | null {
  if (!label) return null
  if (label.includes('无法判断') || label.includes('需进一步检查')) return 'indeterminate'
  if (label.includes('内膜癌')) return 'endometrial_cancer'
  if (label.includes('息肉')) return 'polyp'
  if (label.includes('正常')) return 'normal'
  return null
}
```

- [ ] **Step 4: Clear the existing compiler and lint failures**

Move `classFromLabel` out of `ClassBadge.tsx`, remove stale imports/functions from `Batch.tsx` and `BatchDetail.tsx`, and replace the synchronous DICOM `setPreview(null)` effect with a memoized object URL plus cleanup-only effect.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- --run src/lib/classification.test.ts
npm run build
npm run lint
```

Expected: classification test passes; build and lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "test: 建立前端测试与构建基线"
```

### Task 2: Fix Physician Judgment and Batch Reliability

**Files:**
- Create: `backend/tests/test_clinical_workflow.py`
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/api/cases.py`
- Modify: `backend/app/services/batch_pipeline.py`
- Modify: `backend/app/api/batch.py`

- [ ] **Step 1: Write failing backend tests**

Use standard-library `unittest` so the suite does not depend on a missing pytest installation:

```python
import unittest
from app.models.schemas import JUDGMENT_CLASS_ZH, VALID_JUDGMENT_CLASSES
from app.services.batch_pipeline import _batch_without_work_error


class ClinicalWorkflowTests(unittest.TestCase):
    def test_indeterminate_is_valid_physician_judgment_only(self):
        self.assertIn("indeterminate", VALID_JUDGMENT_CLASSES)
        self.assertEqual(JUDGMENT_CLASS_ZH["endometrial_cancer"], "疑似子宫内膜癌")
        self.assertEqual(JUDGMENT_CLASS_ZH["indeterminate"], "无法判断 / 需进一步检查")

    def test_empty_patient_work_has_actionable_error(self):
        code, message = _batch_without_work_error([])
        self.assertEqual(code, "NO_VALID_IMAGES")
        self.assertIn("有效图像", message)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Verify RED**

Run:

```bash
python3 -m unittest tests.test_clinical_workflow -v
```

Expected: FAIL because the constant and helper do not exist.

- [ ] **Step 3: Implement judgment validity and audit-safe updates**

Define:

```python
MODEL_CLASSES = {"normal", "endometrial_cancer", "polyp"}
VALID_JUDGMENT_CLASSES = MODEL_CLASSES | {"indeterminate"}
JUDGMENT_CLASS_ZH = {
    **CLASS_ZH,
    "endometrial_cancer": "疑似子宫内膜癌",
    "indeterminate": "无法判断 / 需进一步检查",
}
```

Use `VALID_JUDGMENT_CLASSES` in the judgment endpoint and `JUDGMENT_CLASS_ZH` only when serializing physician judgments; model predictions continue using `CLASS_ZH`. Before updating an existing row, capture old values; set `judged_at = datetime.now(timezone.utc)`; include `before` and `after` objects in the audit detail.

- [ ] **Step 4: Implement empty-work and timeout handling**

Add the pure helper:

```python
def _batch_without_work_error(patient_work: list) -> tuple[str, str]:
    if patient_work:
        return "", ""
    return "NO_VALID_IMAGES", "批量任务中没有可用于推理的有效图像。"
```

Before starting the worker, mark an empty-work job `failed`, set `finished_at` and `error_message`, commit, and do not start a thread. Check the boolean returned by `done_event.wait(timeout=300)`; timed-out images must not be treated as successful callbacks. Return `job.error_message` through `BatchStatusResponse.error`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
python3 -m unittest tests.test_clinical_workflow -v
python3 -m compileall -q app tests
```

Expected: 2 tests pass and compileall exits 0.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "fix: 完善医生判断与批量失败处理"
```

### Task 3: Make Physician Judgment Explicit

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/JudgmentForm.test.tsx`
- Modify: `frontend/src/components/JudgmentForm.tsx`
- Create: `frontend/src/components/AiSuggestionPanel.tsx`
- Create: `frontend/src/hooks/useUnsavedChangesWarning.ts`

- [ ] **Step 1: Write failing form tests**

Create the executable test with the new-form and saved-form behaviors:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import JudgmentForm from './JudgmentForm'

describe('JudgmentForm', () => {
  it('requires an explicit physician judgment', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<JudgmentForm initialClass={null} onSubmit={onSubmit} />)

    expect(screen.getByRole('button', { name: '保存判断' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('诊断分类'), 'indeterminate')
    expect(screen.getByRole('button', { name: '保存判断' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '保存判断' }))

    expect(onSubmit).toHaveBeenCalledWith({
      final_class: 'indeterminate', recommendation: '', note: '',
    })
  })

  it('loads an existing saved physician judgment', () => {
    render(
      <JudgmentForm
        initialClass="polyp"
        initialRecommendation="followup"
        initialNote="三个月复查"
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('诊断分类')).toHaveValue('polyp')
    expect(screen.getByLabelText('处置建议')).toHaveValue('followup')
    expect(screen.getByLabelText('备注')).toHaveValue('三个月复查')
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --run src/components/JudgmentForm.test.tsx
```

Expected: FAIL because the current form defaults to `normal` and has no indeterminate option.

- [ ] **Step 3: Separate prediction and judgment types**

Add:

```ts
export type JudgmentClass = PredictedClass | 'indeterminate'
```

Change `Judgment`, `JudgmentRequest`, and `CaseListItem.doctor_judgment` to use `JudgmentClass`; prediction types remain three-class only.

- [ ] **Step 4: Implement the explicit form and AI panel**

Use `JudgmentClass | ''` state. New forms start empty; existing forms load saved values. Disable submit when empty. Label the separate read-only panel `AI 辅助建议` and keep probability bars there.

Add `useUnsavedChangesWarning(dirty)` to register a `beforeunload` handler while physician inputs differ from their initial values. Reset the dirty baseline after a successful save by remounting the form with the refreshed judgment query.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- --run src/components/JudgmentForm.test.tsx
npm run build
npm run lint
```

Expected: form tests, build, and lint pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: 要求医生主动确认最终判断"
```

### Task 4: Build and Reuse the Three-Column Clinical Workbench

**Files:**
- Create: `frontend/src/components/WorkspaceContainer.tsx`
- Create: `frontend/src/components/ClinicalWorkbench.tsx`
- Create: `frontend/src/components/ImageReviewPanel.tsx`
- Create: `frontend/src/components/ClinicalWorkbench.test.tsx`
- Modify: `frontend/src/pages/Predict.tsx`
- Modify: `frontend/src/pages/CaseDetail.tsx`

- [ ] **Step 1: Write the failing workbench structure test**

Render `ClinicalWorkbench` with labeled left, center and right content. Assert all three regions exist and have accessible region labels `病例信息`, `影像阅片`, and `医生确认`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --run src/components/ClinicalWorkbench.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement stable layout primitives**

`WorkspaceContainer` uses `w-full max-w-[1600px] mx-auto`. `ClinicalWorkbench` uses one column by default and `xl:grid-cols-[240px_minmax(0,1fr)_360px]`; the right region is `xl:sticky xl:top-4 self-start`. Preserve existing tokens and card treatments.

- [ ] **Step 4: Implement reusable image review**

Move active-image selection, original/Grad-CAM comparison, thumbnails, and current-image prediction into `ImageReviewPanel`. Keep a fixed image aspect ratio and explicit unavailable states.

- [ ] **Step 5: Refactor Predict and CaseDetail**

Keep the initial Predict input/result two-column state. Once a case is available, render the shared three-column workbench. CaseDetail uses the same image and judgment components and shows saved judgment metadata.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- --run src/components/ClinicalWorkbench.test.tsx
npm run build
npm run lint
```

Expected: workbench test, build, and lint pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: 重构三栏超声诊断工作台"
```

### Task 5: Fix History, Batch Navigation, and Settings

**Files:**
- Create: `frontend/src/pages/History.test.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/components/BatchNav.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/pages/History.tsx`
- Modify: `frontend/src/pages/Batch.tsx`
- Modify: `frontend/src/pages/BatchHistory.tsx`
- Modify: `frontend/src/pages/BatchDetail.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Delete: `frontend/src/lib/store.ts`
- Modify: `backend/app/api/batch.py`

- [ ] **Step 1: Write the failing history navigation test**

Mock `getCases` with one item, render under `MemoryRouter` and `QueryClientProvider`, and assert the patient/case number is a link to `/case/<id>` while no clickable table row or duplicate “详情” button exists.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- --run src/pages/History.test.tsx
```

Expected: FAIL because the current row has `onClick` and a duplicate detail button.

- [ ] **Step 3: Implement semantic history navigation and full-width pages**

Wrap the page in `WorkspaceContainer`, replace row navigation with a `Link` in the identifier cell, remove the operation column, and add visible keyboard focus.

- [ ] **Step 4: Implement batch page tabs and cancellation**

Create `BatchNav` with exact links `/batch`, `/batch/running`, and `/batch/history`. Register `/batch/running` in `App.tsx` using `BatchHistory mode="running"`. Extend `GET /api/batch` and `getBatchJobs` with an optional `status` parameter; running mode sends `status=running`, while history excludes no statuses. In `BatchDetail`, show a cancel button only for queued/running jobs, confirm the action, call `cancelBatch`, and invalidate `['batch-status', jobId]` plus `['batch-jobs']`.

- [ ] **Step 5: Remove the ineffective threshold**

Delete the threshold card from Settings and remove `useAppStore`; delete `store.ts` after confirming no imports remain:

```bash
rg -n "useAppStore|confidenceThreshold" frontend/src
```

Expected: no matches.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- --run src/pages/History.test.tsx
npm test -- --run
npm run build
npm run lint
```

Expected: all frontend tests, build, and lint pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: 优化病例与批量任务操作路径"
```

### Task 6: Integration, Accessibility, and Visual Verification

**Files:**
- Review: all files changed by Tasks 1–5.
- Modify: only a file with a reproduced verification failure, accompanied by a failing regression test.

- [ ] **Step 1: Run the complete automated verification**

```bash
cd frontend && npm test -- --run && npm run build && npm run lint
cd ../backend && python3 -m unittest discover -s tests -p 'test_*.py' -v && python3 -m compileall -q app tests
```

Expected: all commands exit 0 with no test failures or lint errors.

- [ ] **Step 2: Start the application without changing production data**

Use the existing backend only if a legal test login is available. Otherwise start an isolated backend database and test account. Start Vite on a free port.

- [ ] **Step 3: Verify three viewports**

Capture and inspect 1920×1080, 1440×900, and 390×844 screenshots. Verify the three workbench regions, no text overlap, stable image sizing, visible doctor judgment, semantic history links, batch tabs, and cancel-state visibility.

- [ ] **Step 4: Check the final diff against the design**

Confirm every in-scope design requirement maps to code or a test. Confirm no new access restrictions, no visual theme replacement, and no uncalibrated confidence threshold were added.

- [ ] **Step 5: Commit reproduced verification fixes**

```bash
git add frontend backend
git commit -m "fix: 完成工作台集成与视觉验收"
```

When `git status --short` is empty, record that no integration-fix commit is required.
