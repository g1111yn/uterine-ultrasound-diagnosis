# Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将中文、英文、前端、后端、部署和运维文档更新为与当前医院超声辅助诊断系统一致的分层说明体系。

**Architecture:** 根目录中英文 README 负责完整产品、临床和科研概览，前后端 README 负责开发细节，部署与运维文档负责生产操作。所有文档共享同一组代码事实，但避免大段复制，并通过可重复的检索命令检查旧模型、旧路径、错误限制和失效链接。

**Tech Stack:** Markdown、FastAPI、React/Vite、SQLite、systemd、Nginx、Git。

---

## 文件边界

- `README.md`：中文总入口。
- `README_EN.md`：英文总入口，与中文事实一致。
- `backend/README.md`：后端开发、API、数据与并发语义。
- `frontend/README.md`：前端开发、页面、组件与测试。
- `docs/deployment.md`：生产部署、环境变量、备份与升级。
- `docs/runbook.md`：值班排障和恢复操作。

### Task 1: 更新根目录中英文 README

**Files:**
- Modify: `README.md`
- Modify: `README_EN.md`

- [ ] **Step 1: 建立中英文事实清单**

在修改前用以下命令核对代码事实：

```bash
rg -n "MODEL_CKPT_PATH|BERT_PATH|MAX_IMAGES_PER_CASE|MAX_IMAGE_BYTES" \
  backend/app/config.py backend/app/api/predict.py
rg -n "BATCH_MAX_UNCOMPRESSED_BYTES|BATCH_MAX_IMAGES_PER_PATIENT|MAX_ACTIVE_BATCHES_PER_USER|MAX_PENDING_BATCHES_GLOBAL" \
  backend/app/services/batch_pipeline.py
rg -n "CLASS_ZH|VALID_JUDGMENT_CLASSES|JUDGMENT_CONFLICT|PREDICTION_REQUIRED" \
  backend/app/models/schemas.py backend/app/api/cases.py
```

Expected facts:

```text
模型分类：normal / polyp / endometrial_cancer
医生判断：上述三类 + indeterminate
单例上限：30 张/病例，50 MB/图
批量上限：30 张/患者，ZIP 解压总量 500 MB
默认聚合：mean
模型：EfficientNet-B3 + 医学 BERT
```

- [ ] **Step 2: 重写中文 README 的信息结构**

按以下章节顺序更新 `README.md`：

```markdown
# 子宫超声辅助诊断系统
## 系统定位
## 临床工作流
### 单例诊断工作台
### 批量推理与连续诊断
### 医生判断与责任边界
## 模型与推理
## 功能概览
## 技术架构
## 快速开始
## 批量 ZIP 格式
## 测试与质量检查
## API 概览
## 部署与运维入口
## 数据、安全与医院接入边界
## 项目结构
## License
```

必须明确：

```text
批量 ZIP 根目录包含 manifest.csv；列为 patient_no、clinical_text，可选 check_project。
患者目录名与 patient_no 完全一致。
AI 为三分类辅助建议；医生必须主动选择四分类最终判断。
批量页支持全部/未诊断/已诊断/推理失败筛选和保存并下一位。
待推理或推理失败病例不可保存医生判断。
当前已登录医生共享查看病例和批量任务；正式医院接入时再收紧科室/所有者权限。
判断更新使用时间戳版本冲突保护，冲突时刷新后重试。
```

- [ ] **Step 3: 同步英文 README**

让 `README_EN.md` 使用与中文 README 相同的章节层级和事实。核心术语固定为：

```text
Clinical workbench
AI-assisted suggestion
Physician final judgment
Indeterminate / further examination required
Save and next patient
Optimistic concurrency control
Pending inference / inference failed
```

所有命令、路径、接口、数字限制和环境变量必须与中文一致。

- [ ] **Step 4: 检查中英文结构与旧事实**

Run:

```bash
rg '^#{1,3} ' README.md README_EN.md
rg -n "ResNet18|bert-base_fold1_best|tiansz/bert-base-chinese|最多 10|最多 20|up to 10|up to 20" README.md README_EN.md
git diff --check -- README.md README_EN.md
```

Expected: 中英文拥有对应章节；旧模型、旧路径和旧数量检索无结果；diff check 通过。

- [ ] **Step 5: 提交根 README 更新**

```bash
git add README.md README_EN.md
git commit -m "docs: 更新中英文项目总览"
```

### Task 2: 更新前后端 README

**Files:**
- Modify: `backend/README.md`
- Modify: `frontend/README.md`

- [ ] **Step 1: 重写后端 README**

按以下结构更新 `backend/README.md`：

```markdown
# 后端服务
## 职责
## 环境与模型文件
## 开发启动
## 生产启动
## 数据目录
## 推理与任务状态
## 医生判断一致性
## API 概览
## 测试与检查
## 部署入口
```

开发命令必须使用仓库现有入口：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -m compileall -q app tests
```

API 表必须使用真实路由：`/api/predict`、`/api/tasks/{task_id}`、`/api/predict/batch`、`/api/batch`、`/api/batch/{job_id}`、`/api/batch/{job_id}/cancel`、`/api/cases`、`/api/cases/{case_id}`、`/api/cases/{case_id}/judgment`、`/api/images/{image_id}`、`/api/images/{image_id}/original`、`/api/images/{image_id}/gradcam`、`/api/cases/{case_id}/report.pdf`。

- [ ] **Step 2: 完全替换前端模板 README**

将 `frontend/README.md` 改为：

```markdown
# 前端应用
## 职责与页面
## 临床工作台
## 路由
## 状态与数据流
## 开发启动
## 测试、构建与 lint
## 目录结构
## 与后端联调
```

命令和代理事实：

```bash
cd frontend
npm install
npm run dev
npm test -- --run
npm run build
npm run lint
```

```text
开发服务器默认由 Vite 启动，/api 代理到 http://localhost:8000。
应用使用 React Router Data Router 保护未保存医生判断。
TanStack Query 管理病例、批量状态与判断版本刷新。
```

- [ ] **Step 3: 检查模板残留和接口准确性**

Run:

```bash
rg -n "This template provides|React Compiler|eslint-plugin-react-x|eslint-plugin-react-dom" frontend/README.md
rg -n "/api/cases/\{case_id\}/image|/api/cases/\{case_id\}/gradcam" backend/README.md
rg -n "npm test -- --run|python3 -m unittest discover" frontend/README.md backend/README.md
git diff --check -- frontend/README.md backend/README.md
```

Expected: 模板和旧错误接口检索无结果；真实测试命令存在；diff check 通过。

- [ ] **Step 4: 提交子项目 README 更新**

```bash
git add backend/README.md frontend/README.md
git commit -m "docs: 重写前后端开发说明"
```

### Task 3: 更新部署与运维文档

**Files:**
- Modify: `docs/deployment.md`
- Modify: `docs/runbook.md`

- [ ] **Step 1: 修正部署文档的模型与限制**

在 `docs/deployment.md` 中统一使用：

```text
/opt/ultrasound/backend/checkpoints/best_single_fold3.pth
/opt/ultrasound/backend/models/nlp_corom_sentence-embedding_chinese-base-medical/
MODEL_CKPT_PATH
BERT_PATH
EfficientNet-B3 + 医学 BERT
MAX_IMAGES_PER_CASE=30
BATCH_MAX_IMAGES_PER_PATIENT=30
MAX_IMAGE_BYTES=52428800
BATCH_MAX_UNCOMPRESSED_BYTES=524288000
```

安装顺序必须先安装前后端依赖和构建前端，再启动 systemd。升级流程明确：停止服务、备份、更新代码、安装依赖、构建前端、启动、健康检查、登录抽样和批量任务抽样。

- [ ] **Step 2: 扩展运维手册**

在 `docs/runbook.md` 增加可执行章节：

```markdown
### 批量任务停滞或终态异常
### 医生判断冲突
### 模型加载失败
### 批量 ZIP 校验失败
### 判断和批量统计不同步
```

判断冲突说明必须包含：

```text
JUDGMENT_CONFLICT 表示判断版本已被其他医生或标签页更新。
先刷新病例，核对最新判断，再重新录入；不要直接修改数据库绕过冲突。
```

ZIP 排查必须检查根目录 `manifest.csv`、UTF-8 编码、必需列和患者目录对应关系。

- [ ] **Step 3: 检查部署命令和危险操作提示**

Run:

```bash
rg -n "ResNet18|bert-base_fold1_best|tiansz/bert-base-chinese|MAX_IMAGES_PER_CASE.*10|BATCH_MAX_IMAGES_PER_PATIENT.*20" docs/deployment.md docs/runbook.md
rg -n "best_single_fold3.pth|nlp_corom_sentence-embedding_chinese-base-medical|JUDGMENT_CONFLICT|manifest.csv" docs/deployment.md docs/runbook.md
rg -n "备份|恢复演练|不要直接修改数据库" docs/deployment.md docs/runbook.md
git diff --check -- docs/deployment.md docs/runbook.md
```

Expected: 旧事实无结果；新模型、冲突、ZIP 和备份说明存在；diff check 通过。

- [ ] **Step 4: 提交部署运维更新**

```bash
git add docs/deployment.md docs/runbook.md
git commit -m "docs: 更新部署与运维手册"
```

### Task 4: 全文一致性与链接验收

**Files:**
- Modify only the six documentation files above if verification exposes a mismatch.

- [ ] **Step 1: 检索所有过时事实**

Run:

```bash
rg -n "ResNet18|bert-base_fold1_best|tiansz/bert-base-chinese|Zustand|最多 10 张|最多 20 张|up to 10 images|up to 20 images" \
  README.md README_EN.md backend/README.md frontend/README.md docs/deployment.md docs/runbook.md
```

Expected: 无结果。

- [ ] **Step 2: 核对引用文件和目录存在**

Run:

```bash
test -f backend/checkpoints/.gitkeep
test -f backend/scripts/init_db.py
test -f backend/scripts/init_admin.py
test -f backend/scripts/backup.sh
test -f backend/deploy/ultrasound.service
test -f docs/deployment.md
test -f docs/runbook.md
test -f frontend/vite.config.ts
```

Expected: 所有命令退出 0。

- [ ] **Step 3: 核对中英文关键事实**

Run:

```bash
rg -n "30|50 MB|500 MB|manifest.csv|indeterminate|JUDGMENT_CONFLICT|EfficientNet-B3" README.md README_EN.md
rg -n "MAX_IMAGES_PER_CASE|BATCH_MAX_IMAGES_PER_PATIENT|MODEL_CKPT_PATH|BERT_PATH" README.md README_EN.md docs/deployment.md
```

Expected: 中英文和部署文档都包含对应限制与路径。

- [ ] **Step 4: 运行最终格式和工作区检查**

Run:

```bash
git diff --check
git status --short
```

Expected: diff check 通过；只有预期文档改动，或在所有提交完成后工作区干净。

- [ ] **Step 5: 提交验收修正（仅在 Step 1-4 发现并修正文档时）**

```bash
git add README.md README_EN.md backend/README.md frontend/README.md docs/deployment.md docs/runbook.md
git commit -m "docs: 统一项目文档事实口径"
```

### Task 5: 最终文档审查

**Files:**
- Read-only review of `ea5615d..HEAD` unless findings require fixes.

- [ ] **Step 1: 规格审查**

逐条对照 `docs/superpowers/specs/2026-07-16-documentation-refresh-design.md`，确认六份文档各自边界清晰，中英文事实一致，没有宣称未实现的医院能力。

- [ ] **Step 2: 事实与可操作性审查**

逐项核对命令、路径、API、环境变量、模型名称、数量限制、ZIP 结构、判断类别、共享访问和并发冲突说明。发现错误时返回对应任务修正并复查。

- [ ] **Step 3: 完成后进入分支收尾**

所有检查通过后保留当前功能分支，等待用户决定再次推送或创建 PR；不自动重写远程历史。
