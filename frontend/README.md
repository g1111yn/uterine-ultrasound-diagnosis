# 前端应用

## 职责与页面

前端是面向妇科超声医生的 React 19 + TypeScript 临床工作界面，通过会话 cookie 调用 FastAPI `/api`。界面把 AI 三分类结果作为辅助建议展示，医生必须主动选择并保存四分类最终判断；不会自动接受模型结果。

当前页面包括：

| 页面 | 路径 | 用途 |
| --- | --- | --- |
| 登录 | `/login` | 建立用户会话 |
| 修改密码 | `/change-password` | 修改当前账号密码 |
| 单例推理 | `/` | 录入检查信息、上传多图、轮询推理并在结果区诊断 |
| 批量创建 | `/batch` | 上传规范 ZIP 并选择患者级聚合策略 |
| 运行中批次 | `/batch/running` | 查看活动批量任务 |
| 批量历史 | `/batch/history` | 分页查看全部批量任务 |
| 批量详情 | `/batch/:jobId` | 查看进度、筛选患者并连续诊断 |
| 历史病例 | `/history` | 按关键词、日期、类别、医生和来源检索病例 |
| 病例详情 | `/case/:caseId` | 复核完整病例、保存判断和导出报告 |
| 设置 | `/settings` | 查看服务状态、模型版本与模型加载状态 |
| 管理页面 | `/admin/users`、`/admin/audit-logs`、`/admin/stats` | 管理员维护账号、查审计和看运行统计 |

普通业务页面要求登录，管理页面还要求 `admin` 角色。当前任一已登录医生都能查看系统内病例和批量任务，并可为任意已完成患者级推理的病例创建或更新医生判断；批量任务仅允许创建者取消。科室或病例所有者隔离尚未实现，将在医院正式对接时按院方权限模型收紧。

## 临床工作台

`ClinicalWorkbench` 统一单例结果、病例详情和批量诊断的三栏布局：

- 左栏放病例/检查信息或批量患者队列。
- 中栏由 `ImageReviewPanel` 提供文件名展示、多图选择、浏览图与 Grad-CAM 对照及逐图概率。
- 右栏展示 `AiSuggestionPanel` 与 `JudgmentForm`，明确分开 AI 辅助建议和医生最终判断。

医生判断支持 `normal`、`polyp`、`endometrial_cancer`、`indeterminate`，并可填写处置建议和备注。编辑已有判断时，表单把当前 `judged_at` 作为 `expected_judged_at` 提交；后端返回 `JUDGMENT_CONFLICT` 时错误会显示且未保存输入保留，用户应刷新并复核最新版本。

批量详情页默认定位未诊断患者，左栏支持“全部 / 未诊断 / 已诊断 / 推理失败”筛选。可诊断病例直接在同页使用三栏工作台，支持“保存判断”和“保存并下一位”；后者保存成功后切换到下一位未诊断患者。等待推理或推理失败的患者显示明确状态，不开放医生判断。活动批次每 3 秒轮询一次，终态降低轮询频率，页面同时显示患者/图像进度、分类统计和取消操作。

## 路由

应用在 `src/App.tsx` 使用 React Router Data Router：`createBrowserRouter` + `RouterProvider`。`ProtectedRoute` 处理登录和管理员访问，根布局承载主导航与子路由；旧的 `/predict` 会重定向到 `/`，未知路径也回到首页。

`JudgmentForm` 通过 `useUnsavedChangesWarning` 调用 Data Router 的 `useBlocker`，阻止带未保存判断的站内跳转；浏览器刷新或关闭标签页时另用 `beforeunload` 提示。批量页切换患者或筛选器时也会先确认未保存内容。该保护只覆盖前端交互，不能替代后端基于 `expected_judged_at` 的乐观并发控制。

## 状态与数据流

TanStack Query 管理服务端状态，Axios 客户端集中在 `src/api/client.ts`：

- 单例页提交 `/api/predict` 后轮询 `['task', taskId]`，任务完成再读取 `['case', caseId]`。
- 批量历史使用 `['batch-jobs', mode, page]`，详情使用 `['batch-status', jobId]` 按状态轮询。
- 病例详情和批量诊断共用 `['case', caseId]`；保存判断后使病例与对应批次查询失效并刷新版本。
- 默认查询失败重试 1 次，并关闭窗口重新聚焦时的自动刷新。
- `AuthContext` 管理当前用户、登录和注销；请求携带会话 cookie，401 时 API 客户端触发会话过期事件。

页面本地状态只保存表单输入、当前患者、筛选和界面交互，不把服务端病例复制为独立全局状态。批量后台轮询发现其他医生更新判断时，会在当前表单无未保存编辑后刷新病例；有本地编辑时不会静默覆盖。

## 开发启动

需要 Node.js 与 npm。先在 `backend/` 启动 FastAPI，然后：

```bash
cd frontend
npm install
npm run dev
```

Vite 开发服务器通常位于 `http://localhost:5173`。`vite.config.ts` 将 `/api` 代理到 `http://localhost:8000`，前端代码保持使用同源 `/api` 路径，无需在组件中写死后端地址。

## 测试、构建与 lint

```bash
cd frontend
npm test -- --run
npm run build
npm run lint
```

- Vitest + Testing Library 使用 `jsdom`，测试文件与组件或页面相邻。
- `npm run build` 先执行 TypeScript 项目构建，再由 Vite 生成 `dist/`。
- `npm run lint` 使用仓库现有 ESLint 配置检查 `src/` 和配置文件。

重点测试覆盖批量筛选与连续诊断、保存过程隔离、并发冲突后输入保留、病例版本刷新、未保存离开保护、上传交互和工作台布局。管理员页面、真实 DICOM、医院终端分辨率和弱网行为仍需在目标环境验收。

## 目录结构

```text
frontend/
├── src/
│   ├── api/          # Axios API 客户端
│   ├── auth/         # 会话上下文与路由保护
│   ├── components/   # 三栏工作台、阅片、AI 建议、判断与批量组件
│   ├── hooks/        # 未保存内容保护等通用 Hook
│   ├── lib/          # 类型、分类映射、批量状态与格式化工具
│   ├── pages/        # 临床页面与 admin 管理页面
│   ├── test/         # Vitest 全局测试设置
│   ├── App.tsx       # Data Router 与 QueryClient
│   └── index.css     # Tailwind 主题变量和全局样式
├── vite.config.ts    # React、Tailwind、Vitest 与 /api 代理
├── package.json      # 开发、测试、构建和 lint 命令
└── dist/             # 生产构建产物
```

## 与后端联调

1. 确认 `GET http://localhost:8000/api/health` 返回服务状态，并检查 `model_loaded`；HTTP 正常不代表模型已加载。
2. 使用 `backend/scripts/init_admin.py` 创建开发管理员，登录后让浏览器通过 cookie 保持会话。
3. 在 Vite 页面执行单例或批量流程，浏览器请求应走 `http://localhost:5173/api/...` 并由代理转发。
4. 遇到 401 先检查会话是否过期；遇到 `JUDGMENT_CONFLICT` 刷新病例并复核，不要直接重试旧版本；遇到 `PREDICTION_REQUIRED` 等待推理成功后再诊断。

生产环境先运行 `npm run build`。后端检测到 `frontend/dist/` 后可提供静态站点；若由 Nginx 单独托管 `dist/`，仍需将 `/api` 反向代理到 FastAPI，并保留 cookie、HTTPS 和安全头配置。部署细节见 `../docs/deployment.md`，后端接口语义见 `../backend/README.md`。
