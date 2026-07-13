# Batch Inline Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将批量任务详情页升级为可在推理进行中连续阅片、保存医生判断并跳转下一位未诊断患者的三栏临床工作台。

**Architecture:** 批量状态接口为每位患者返回 `has_judgment`，并用空错误区分“仍在推理”和“推理失败”。前端保持批量摘要轮询，只为当前患者懒加载完整病例；患者队列、正式影像阅片与医生判断分别使用小型组件组合，诊断表单通过可选次级提交动作支持“保存并下一位”。

**Tech Stack:** FastAPI、SQLAlchemy、Pydantic、React 19、TypeScript、TanStack Query、React Router、Vitest、Testing Library、Tailwind CSS。

---

## 文件结构

- 修改 `backend/app/models/schemas.py`：扩展批量患者摘要契约。
- 修改 `backend/app/api/batch.py`：一次查询返回预测与医生判断状态，正确区分等待和失败。
- 修改 `backend/tests/test_clinical_workflow.py`：覆盖患者摘要的判断、等待和失败状态。
- 修改 `frontend/src/lib/types.ts`：同步 `has_judgment` 类型。
- 修改 `frontend/src/components/JudgmentForm.tsx`：增加可选次级提交动作与 dirty 状态回调。
- 修改 `frontend/src/components/JudgmentForm.test.tsx`：覆盖双保存动作和 dirty 生命周期。
- 新建 `frontend/src/components/BatchPatientQueue.tsx`：筛选、诊断进度、患者状态和选择入口。
- 新建 `frontend/src/components/BatchPatientQueue.test.tsx`：覆盖四种筛选和状态呈现。
- 新建 `frontend/src/components/BatchPatientDiagnosis.tsx`：当前批量患者的病例查询、影像阅片、AI 建议和诊断提交。
- 新建 `frontend/src/components/BatchPatientDiagnosis.test.tsx`：覆盖运行中诊断、保存、保存并下一位、失败保留输入。
- 修改 `frontend/src/pages/BatchDetail.tsx`：组合三栏工作台、默认选中、未保存切换保护与全部完成提示。
- 修改 `frontend/src/pages/BatchDetail.test.tsx`：覆盖批量页连续工作流、轮询稳定性和布局。

### Task 1: 扩展批量患者摘要契约

**Files:**
- Modify: `backend/app/models/schemas.py`
- Modify: `backend/app/api/batch.py`
- Test: `backend/tests/test_clinical_workflow.py`
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: 写失败的后端契约测试**

在 `ClinicalWorkflowTests` 中增加三个测试：

```python
def test_batch_status_marks_patient_with_saved_judgment(self):
    # 创建 BatchJob、Case、Prediction 和 Judgment。
    response = self.client.get(f"/api/batch/{job.job_id}")
    self.assertEqual(response.status_code, 200)
    self.assertTrue(response.json()["results"][0]["has_judgment"])

def test_batch_status_keeps_running_patient_pending_without_fake_error(self):
    # running job 中创建尚无 Prediction、也无 batch_error 的 Case。
    response = self.client.get(f"/api/batch/{job.job_id}")
    item = response.json()["results"][0]
    self.assertIsNone(item["predicted_class"])
    self.assertIsNone(item["error"])
    self.assertFalse(item["has_judgment"])

def test_batch_status_exposes_real_patient_failure(self):
    # 创建 batch_error="DICOM 图像无法生成可用预览" 的 Case。
    response = self.client.get(f"/api/batch/{job.job_id}")
    item = response.json()["results"][0]
    self.assertEqual(item["error"], "DICOM 图像无法生成可用预览")
```

- [ ] **Step 2: 运行聚焦测试并确认红灯**

Run:

```bash
cd backend
PATH=/opt/miniconda3/bin:$PATH python3 -m unittest \
  tests.test_clinical_workflow.ClinicalWorkflowTests.test_batch_status_marks_patient_with_saved_judgment \
  tests.test_clinical_workflow.ClinicalWorkflowTests.test_batch_status_keeps_running_patient_pending_without_fake_error \
  tests.test_clinical_workflow.ClinicalWorkflowTests.test_batch_status_exposes_real_patient_failure -v
```

Expected: 前两个测试因响应缺少 `has_judgment` 或等待患者返回“推理未完成”而失败。

- [ ] **Step 3: 实现最小后端契约**

在 `BatchResultItem` 增加：

```python
has_judgment: bool = False
```

在批量详情查询中加入 `Judgment` 外连接，并为每一项赋值：

```python
rows = (
    db.query(Case, Prediction, Judgment.id)
    .outerjoin(Prediction, Case.case_id == Prediction.case_id)
    .outerjoin(Judgment, Case.case_id == Judgment.case_id)
    .filter(Case.batch_job_id == job_id)
    .order_by(Case.created_at.asc())
    .all()
)

has_judgment = judgment_id is not None
```

没有预测时只返回已持久化的真实失败原因：

```python
error=case.batch_error or None,
has_judgment=has_judgment,
```

前端 `BatchResultItem` 同步增加：

```ts
has_judgment: boolean
```

- [ ] **Step 4: 运行聚焦测试和后端全量测试**

Run:

```bash
cd backend
PATH=/opt/miniconda3/bin:$PATH python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Expected: 全部通过，等待患者的 `error` 为 `null`，真实失败原因仍保留。

- [ ] **Step 5: 提交患者摘要契约**

```bash
git add backend/app/models/schemas.py backend/app/api/batch.py \
  backend/tests/test_clinical_workflow.py frontend/src/lib/types.ts
git commit -m "feat: 补充批量患者诊断状态"
```

### Task 2: 为诊断表单增加双保存动作和 dirty 回调

**Files:**
- Modify: `frontend/src/components/JudgmentForm.tsx`
- Test: `frontend/src/components/JudgmentForm.test.tsx`

- [ ] **Step 1: 写失败的表单交互测试**

增加以下行为测试：

```tsx
it('submits through the secondary save action', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onSecondarySubmit = vi.fn().mockResolvedValue(undefined)
  renderWithRouter(
    <JudgmentForm
      initialClass="polyp"
      onSubmit={onSubmit}
      secondarySubmitLabel="保存并下一位"
      onSecondarySubmit={onSecondarySubmit}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: '保存并下一位' }))
  expect(onSecondarySubmit).toHaveBeenCalledWith({
    final_class: 'polyp', recommendation: '', note: '',
  })
  expect(onSubmit).not.toHaveBeenCalled()
})

it('reports dirty state and resets it after either save succeeds', async () => {
  const onDirtyChange = vi.fn()
  renderWithRouter(
    <JudgmentForm
      initialClass={null}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onDirtyChange={onDirtyChange}
    />,
  )
  await userEvent.click(screen.getByLabelText('息肉'))
  expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  await userEvent.click(screen.getByRole('button', { name: '保存判断' }))
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
})
```

再增加次级提交失败时输入保持 dirty、两个按钮在提交中同时禁用的测试。

- [ ] **Step 2: 运行表单测试并确认红灯**

Run:

```bash
cd frontend
npm test -- --run src/components/JudgmentForm.test.tsx
```

Expected: 新 props 不存在或找不到“保存并下一位”按钮。

- [ ] **Step 3: 实现兼容现有页面的可选 props**

扩展 Props：

```ts
secondarySubmitLabel?: string
onSecondarySubmit?: (data: JudgmentRequest) => Promise<unknown>
onDirtyChange?: (dirty: boolean) => void
```

使用 `useEffect` 报告 dirty 状态：

```ts
useEffect(() => {
  onDirtyChange?.(dirty)
}, [dirty, onDirtyChange])
```

把提交逻辑收敛为一个接收 handler 的函数，只有 handler 成功才更新 `savedValues`。当 `secondarySubmitLabel` 与 `onSecondarySubmit` 同时存在时，在主按钮旁渲染第二个按钮。两个按钮共享 `submittingRef` 和 `submitting`，防止重复提交。现有单病例调用不传新 props，界面和行为保持不变。

- [ ] **Step 4: 运行组件测试和前端全量测试**

Run:

```bash
cd frontend
npm test -- --run src/components/JudgmentForm.test.tsx
npm test -- --run
```

Expected: 表单测试与现有前端测试全部通过。

- [ ] **Step 5: 提交诊断表单能力**

```bash
git add frontend/src/components/JudgmentForm.tsx \
  frontend/src/components/JudgmentForm.test.tsx
git commit -m "feat: 支持保存并进入下一位患者"
```

### Task 3: 实现批量患者筛选队列

**Files:**
- Create: `frontend/src/components/BatchPatientQueue.tsx`
- Create: `frontend/src/components/BatchPatientQueue.test.tsx`

- [ ] **Step 1: 写失败的队列组件测试**

使用四条固定数据：未诊断成功患者、已诊断患者、真实失败患者、仍在推理患者。覆盖：

```tsx
it('defaults to unjudged patients and exposes all four filters', async () => {
  render(<BatchPatientQueue {...props} filter="unjudged" />)
  expect(screen.getByRole('button', { name: /未诊断 1/ })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: /患者 P001/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /患者 P002/ })).not.toBeInTheDocument()
})

it('separates failed patients from patients still running', async () => {
  render(<BatchPatientQueue {...props} filter="failed" />)
  expect(screen.getByRole('button', { name: /患者 P003/ })).toBeVisible()
  expect(screen.queryByRole('button', { name: /患者 P004/ })).not.toBeInTheDocument()
})

it('shows text status in addition to color and selects with a real button', async () => {
  render(<BatchPatientQueue {...props} filter="judged" />)
  await userEvent.click(screen.getByRole('button', { name: /患者 P002/ }))
  expect(props.onSelect).toHaveBeenCalledWith('case-2')
  expect(screen.getByText('已诊断')).toBeVisible()
})
```

- [ ] **Step 2: 运行新测试并确认红灯**

Run:

```bash
cd frontend
npm test -- --run src/components/BatchPatientQueue.test.tsx
```

Expected: 模块不存在。

- [ ] **Step 3: 实现筛选和状态规则**

导出明确类型与纯函数：

```ts
export type BatchPatientFilter = 'all' | 'unjudged' | 'judged' | 'failed'

export function matchesBatchPatientFilter(
  item: BatchResultItem,
  filter: BatchPatientFilter,
) {
  if (filter === 'unjudged') return !!item.predicted_class && !item.has_judgment
  if (filter === 'judged') return item.has_judgment
  if (filter === 'failed') return !!item.error
  return true
}
```

等待患者满足 `!predicted_class && !error`，显示“推理中”或“等待推理”，不得进入失败筛选。筛选区使用 `aria-pressed` 分段按钮并显示数量。桌面队列纵向滚动；移动端使用横向滚动患者项和可换行筛选区。患者状态同时显示文本/图标和现有语义色。

- [ ] **Step 4: 运行队列测试和前端 lint**

Run:

```bash
cd frontend
npm test -- --run src/components/BatchPatientQueue.test.tsx
npm run lint
```

Expected: 测试和 lint 通过。

- [ ] **Step 5: 提交患者队列**

```bash
git add frontend/src/components/BatchPatientQueue.tsx \
  frontend/src/components/BatchPatientQueue.test.tsx
git commit -m "feat: 增加批量患者诊断筛选队列"
```

### Task 4: 实现当前患者就地诊断组件

**Files:**
- Create: `frontend/src/components/BatchPatientDiagnosis.tsx`
- Create: `frontend/src/components/BatchPatientDiagnosis.test.tsx`

- [ ] **Step 1: 写失败的当前患者诊断测试**

Mock `getCaseDetail`、`postJudgment`，验证：

```tsx
it('renders formal image review, AI suggestion, and judgment while batch is running', async () => {
  renderDiagnosis({ caseId: 'case-1' })
  expect(await screen.findByRole('region', { name: '影像阅片' })).toBeVisible()
  expect(screen.getByText('AI 辅助建议')).toBeVisible()
  expect(screen.getByText('医生最终判断')).toBeVisible()
})

it('stays after save and advances only after save-and-next succeeds', async () => {
  renderDiagnosis({ caseId: 'case-1', onSavedAndNext })
  await userEvent.click(await screen.findByLabelText('息肉'))
  await userEvent.click(screen.getByRole('button', { name: '保存判断' }))
  expect(onSavedAndNext).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '保存并下一位' }))
  await waitFor(() => expect(onSavedAndNext).toHaveBeenCalledWith('case-1'))
})

it('keeps form values after a failed save and shows a retryable error', async () => {
  vi.mocked(postJudgment).mockRejectedValue(new Error('保存失败'))
  renderDiagnosis({ caseId: 'case-1' })
  await userEvent.click(await screen.findByLabelText('息肉'))
  await userEvent.click(screen.getByRole('button', { name: '保存判断' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.getByLabelText('息肉')).toBeChecked()
})
```

- [ ] **Step 2: 运行新测试并确认红灯**

Run:

```bash
cd frontend
npm test -- --run src/components/BatchPatientDiagnosis.test.tsx
```

Expected: 模块不存在。

- [ ] **Step 3: 实现病例懒加载和诊断提交**

组件 props：

```ts
interface Props {
  caseId: string
  jobId: string
  onDirtyChange: (dirty: boolean) => void
  onSavedAndNext: (caseId: string) => void
  children: (content: { center: ReactNode; right: ReactNode }) => ReactNode
}
```

组件使用 render prop 返回唯一一份中心与右栏内容，使病例查询和判断 mutation 保持在同一个组件实例中。测试 helper 用 `children={({ center, right }) => <><section aria-label="影像阅片">{center}</section><section aria-label="医生确认">{right}</section></>}` 渲染内容。使用 `queryKey: ['case', caseId]` 获取完整病例；中心节点渲染 `ImageReviewPanel`，右栏节点渲染 `AiSuggestionPanel`、已保存医生/时间和 `JudgmentForm`。判断 mutation：

```ts
const saveJudgment = async (body: JudgmentRequest) => {
  await postJudgment(caseId, body)
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['case', caseId] }),
    queryClient.invalidateQueries({ queryKey: ['batch-status', jobId] }),
  ])
}
```

主提交仅调用 `saveJudgment`；次级提交等待 `saveJudgment` 成功后调用 `onSavedAndNext(caseId)`。失败时显示 `role="alert"`，不卸载表单。病例详情加载失败提供“重新加载病例”按钮。

- [ ] **Step 4: 运行组件测试和前端全量测试**

Run:

```bash
cd frontend
npm test -- --run src/components/BatchPatientDiagnosis.test.tsx
npm test -- --run
```

Expected: 新组件和现有测试全部通过。

- [ ] **Step 5: 提交当前患者诊断组件**

```bash
git add frontend/src/components/BatchPatientDiagnosis.tsx \
  frontend/src/components/BatchPatientDiagnosis.test.tsx
git commit -m "feat: 在批量任务中复用临床诊断工作台"
```

### Task 5: 集成批量三栏连续诊断工作流

**Files:**
- Modify: `frontend/src/pages/BatchDetail.tsx`
- Modify: `frontend/src/pages/BatchDetail.test.tsx`

- [ ] **Step 1: 写失败的页面工作流测试**

为批量页面增加以下场景：

```tsx
it('selects the first unjudged completed patient while the job is running', async () => {
  vi.mocked(getBatchStatus).mockResolvedValue(runningBatchWithMixedPatients)
  renderBatchDetail()
  expect(await screen.findByRole('button', { name: /患者 P001/ })).toHaveAttribute('aria-pressed', 'true')
  expect(getCaseDetail).toHaveBeenCalledWith('case-1')
})

it('asks before switching patients when the judgment is dirty', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderBatchDetail()
  await userEvent.click(await screen.findByLabelText('息肉'))
  await userEvent.click(screen.getByRole('button', { name: /患者 P002/ }))
  expect(window.confirm).toHaveBeenCalledWith('医生判断尚未保存，确定要切换患者吗？')
  expect(getCaseDetail).not.toHaveBeenCalledWith('case-2')
})

it('saves and advances to the next unjudged patient', async () => {
  renderBatchDetail()
  await userEvent.click(await screen.findByLabelText('息肉'))
  await userEvent.click(screen.getByRole('button', { name: '保存并下一位' }))
  await waitFor(() => expect(getCaseDetail).toHaveBeenCalledWith('case-2'))
})

it('announces completion after saving the last unjudged patient', async () => {
  renderBatchDetail({ results: [oneUnjudgedPatient] })
  await userEvent.click(await screen.findByLabelText('息肉'))
  await userEvent.click(screen.getByRole('button', { name: '保存并下一位' }))
  expect(await screen.findByText('本批次已全部诊断')).toBeVisible()
})
```

增加轮询数据更新后仍保留当前选择、四筛选切换、桌面三栏 DOM 顺序和移动端队列在影像前的结构测试。

- [ ] **Step 2: 运行页面测试并确认红灯**

Run:

```bash
cd frontend
npm test -- --run src/pages/BatchDetail.test.tsx
```

Expected: 当前页面仍为两栏简化详情，找不到诊断表单和筛选控件。

- [ ] **Step 3: 集成筛选、默认选择和切换保护**

页面状态：

```ts
const [filter, setFilter] = useState<BatchPatientFilter>('unjudged')
const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
const [judgmentDirty, setJudgmentDirty] = useState(false)
const [completionMessage, setCompletionMessage] = useState<string | null>(null)
```

默认选择只在当前选择为空或已不在响应中时执行，轮询不得覆盖有效选择。切换患者或筛选前使用：

```ts
function canDiscardJudgment() {
  return !judgmentDirty || window.confirm('医生判断尚未保存，确定要切换患者吗？')
}
```

“保存并下一位”按响应原顺序寻找除当前患者外的下一位 `predicted_class && !has_judgment` 患者；没有候选时保留当前患者并显示完成提示。

- [ ] **Step 4: 用三栏工作台替换简化详情**

保留顶部任务状态、取消、推理进度和分类汇总。主体改为 `ClinicalWorkbench`：

```tsx
<ClinicalWorkbench
  left={<BatchPatientQueue ... />}
  center={center}
  right={right}
/>
```

具体组合为：选中患者时由 `BatchPatientDiagnosis` 的 `children` render prop 包裹 `ClinicalWorkbench`，未选中时直接给 `ClinicalWorkbench` 的 center/right 传入稳定尺寸的空状态。不得复制病例查询或判断 mutation。最终 DOM 必须保持左队列、中心影像、右侧 AI 与判断的顺序。

顶部新增独立诊断进度：

```text
已诊断 {judgedCount} / 可诊断 {diagnosableCount}
```

- [ ] **Step 5: 运行页面测试、前端全量验证和构建**

Run:

```bash
cd frontend
npm test -- --run src/pages/BatchDetail.test.tsx
npm test -- --run
npm run build
npm run lint
```

Expected: 所有测试、TypeScript 构建和 lint 通过。

- [ ] **Step 6: 提交批量工作流集成**

```bash
git add frontend/src/pages/BatchDetail.tsx frontend/src/pages/BatchDetail.test.tsx
git commit -m "feat: 完成批量患者连续诊断流程"
```

### Task 6: 集成验收与视觉复核

**Files:**
- Modify only if verification exposes a defect in files from Tasks 1-5.

- [ ] **Step 1: 运行完整自动化验证**

Run:

```bash
cd frontend
npm test -- --run
npm run build
npm run lint

cd ../backend
PATH=/opt/miniconda3/bin:$PATH python3 -m unittest discover -s tests -p 'test_*.py' -v
PATH=/opt/miniconda3/bin:$PATH python3 -m compileall -q app tests

cd ..
git diff --check
git status --short
```

Expected: 前后端测试、构建、lint、编译和 diff 检查全部通过，工作区干净。

- [ ] **Step 2: 使用真实批量任务进行浏览器验收**

使用隔离数据库或测试批量任务，验证：

- 运行中的任务可诊断已完成患者。
- 1920x1080 与 1440x900 下三栏无横向溢出，右侧判断首屏可见。
- 390x844 下顺序为患者队列、影像、AI、判断，按钮文字完整。
- 四种筛选数量与患者状态一致。
- 保存判断停留当前患者。
- 保存并下一位切换正确，最后一位显示完成提示。
- 有未保存输入时取消切换会留在当前患者。
- 浏览器控制台没有运行错误。

- [ ] **Step 3: 修复验收中发现的问题并复验**

每个缺陷先在对应测试文件增加失败用例，确认红灯后做最小修复，再重复 Step 1 和 Step 2。不得在此步骤加入新的功能范围。

- [ ] **Step 4: 提交验收修复（仅有改动时）**

```bash
git add backend/app/models/schemas.py backend/app/api/batch.py \
  backend/tests/test_clinical_workflow.py frontend/src/lib/types.ts \
  frontend/src/components/JudgmentForm.tsx \
  frontend/src/components/JudgmentForm.test.tsx \
  frontend/src/components/BatchPatientQueue.tsx \
  frontend/src/components/BatchPatientQueue.test.tsx \
  frontend/src/components/BatchPatientDiagnosis.tsx \
  frontend/src/components/BatchPatientDiagnosis.test.tsx \
  frontend/src/pages/BatchDetail.tsx frontend/src/pages/BatchDetail.test.tsx
git commit -m "fix: 完善批量诊断集成验收"
```

### Task 7: 最终规格与质量审查

**Files:**
- Read-only review of `4a54006..HEAD` unless findings require fixes.

- [ ] **Step 1: 规格审查**

逐条对照 `docs/superpowers/specs/2026-07-13-batch-inline-diagnosis-design.md`，确认没有缺失、额外高风险行为或权限变化。发现问题时交回对应实现子代理修复并重新审查。

- [ ] **Step 2: 代码质量审查**

规格审查通过后，再检查查询复杂度、轮询与表单状态竞态、重复提交、未保存保护、可访问性和测试真实性。Critical/Important 问题必须修复并复审；Minor 问题按是否影响临床工作流决定是否纳入。

- [ ] **Step 3: 最终验证后进入分支收尾流程**

重新运行 Task 6 Step 1 的完整命令。全部通过后使用 `finishing-a-development-branch` 提供本地合并、推送并创建 PR、保留分支、丢弃四个选项，不自动合并。
