# 后端服务

## 职责

后端基于 FastAPI，负责账号会话、单例与批量推理、病例和图像管理、医生最终判断、PDF 报告、审计日志及运维指标。SQLAlchemy 将业务数据写入单机 SQLite，原始图像、DICOM 预览和 Grad-CAM 文件保存在本地目录。

推理模型提供 `normal`、`polyp`、`endometrial_cancer` 三分类辅助建议；医生最终判断额外支持 `indeterminate`。AI 结果不能替代医生诊断，服务端也不会自动把模型类别保存为医生判断。

除登录和健康检查外，业务接口要求有效会话。当前任一已登录医生都能查看系统内病例和批量任务，并可为任意已完成患者级推理的病例创建或更新医生判断；批量任务仅允许创建者取消。科室隔离、病例所有者授权等权限将在正式医院对接时按院方规则收紧，当前代码不应被描述为已经具备这些隔离能力。

## 环境与模型文件

建议使用 Python 3.10 或更高版本。依赖见 `requirements.txt`。仓库不分发模型权重和真实患者数据，运行前需准备：

```text
backend/checkpoints/best_single_fold3.pth
backend/models/nlp_corom_sentence-embedding_chinese-base-medical/
```

默认模型为 EfficientNet-B3 + 阿里中文医学 BERT，配置位于 `app/config.py`。可通过环境变量覆盖：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MODEL_CKPT_PATH` | `backend/checkpoints/best_single_fold3.pth` | 单折融合模型权重 |
| `BERT_PATH` | `backend/models/nlp_corom_sentence-embedding_chinese-base-medical/` | 本地医学 BERT 目录 |
| `MODEL_FOLD_PATHS` | 空 | 当前仅由配置模块解析，推理器尚未接入；设置该变量不会启用多折推理 |
| `AGGREGATION_STRATEGY` | `mean` | 患者级聚合，可选 `mean`、`max_severity`、`majority_vote` |

启动时会尝试加载模型。模型文件缺失时 Web 服务仍可启动，但 `/api/health` 的 `model_loaded` 为 `false`，推理任务会失败；不能只根据 HTTP 服务存活判断模型可用。

## 开发启动

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password 'ChangeMe#2026'
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

数据库表也会在应用导入时初始化；上述脚本用于显式初始化数据库和创建首个管理员。开发管理员首次登录后应立即修改初始化密码。

- 健康检查：`http://localhost:8000/api/health`
- OpenAPI 文档：`http://localhost:8000/docs`
- 默认前端开发地址：`http://localhost:5173`，已列入 CORS 配置

## 生产启动

后端会在 `frontend/dist/` 存在时把它挂载为前端静态站点，因此生产启动前应先完成前端构建：

```bash
cd frontend
npm install
npm run build

cd ../backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

正式环境应使用 systemd/NSSM 托管进程并通过 Nginx 或院内网关提供 HTTPS，不要直接把 Uvicorn 端口暴露到不受控网络。systemd 与 Windows 服务文件位于 `deploy/`；完整步骤见项目根目录的 `docs/deployment.md`。

## 数据目录

所有相对路径均以 `backend/` 为基准：

| 路径 | 内容 |
| --- | --- |
| `data/app.db` | 用户、会话、病例、预测、医生判断、批量任务和审计日志 |
| `data/uploads/` | 原始上传图像 |
| `data/previews/` | DICOM 浏览器预览图 |
| `data/gradcam/` | 逐图 Grad-CAM 结果 |
| `data/batch/{job_id}/` | 批量 ZIP 解压工作目录 |
| `checkpoints/` | 图像与融合模型权重 |
| `models/` | 本地文本模型目录 |

SQLite 已启用 WAL、外键、5 秒 busy timeout 和 `synchronous=NORMAL`。数据库与 `data/` 中的文件共同组成完整病例资料，备份或恢复时必须保持一致。不要提交运行时数据、模型权重、生产密码或密钥。

## 推理与任务状态

### 单例任务

`POST /api/predict` 接收 1 至 30 张图像，每个文件最大 50 MB，保存病例后返回 `202`、`case_id` 和聚合 `task_id`。客户端轮询 `/api/tasks/{task_id}`；任务状态为 `queued`、`running`、`done`、`failed`，队列内部还支持尚未运行任务的 `cancelled` 状态，但当前没有公开的单例取消接口。聚合任务完成后再通过 `/api/cases/{case_id}` 获取患者级结果。

推理队列只有一个模型工作线程，避免并发调用非线程安全模型。单例图像任务优先级为 0，批量图像任务优先级为 5，因此单例请求可在批量患者的图像之间优先执行。任务状态保存在进程内存中，服务重启后不能继续查询旧的单例队列记录。

### 批量任务

批量 ZIP 根目录必须含 UTF-8 `manifest.csv`，必需列为 `patient_no`、`clinical_text`，可选 `check_project`；患者目录名必须与 `patient_no` 完全一致。每位患者最多 30 张图像，ZIP 解压总量最多 500 MB。默认每位用户同时允许 1 个活动批次，全局最多 10 个活动批次，可分别通过 `MAX_ACTIVE_BATCHES_PER_USER` 和 `MAX_PENDING_BATCHES_GLOBAL` 调整。

批量任务对外状态为 `queued`、`running`、`completed`、`failed`、`cancelled`。后台按患者串行处理，并在每张图完成后更新进度。取消只对 `queued`/`running` 批次生效，已完成的病例结果会保留；正在执行的底层模型调用不会被强行中断，但取消后的结果不会再写入患者级聚合。

每张批量图像默认等待 300 秒，可由 `BATCH_IMAGE_TIMEOUT_SECONDS` 调整。超时会尝试取消尚未开始的队列任务，并把批次标记为 `failed`；已开始的模型调用不能安全中断，其迟到结果会被结果门控丢弃。服务启动时，数据库中遗留的 `pending`/`running` 批次会被标为失败并提示重新提交，不会自动续跑。

## 医生判断一致性

`POST /api/cases/{case_id}/judgment` 创建或更新医生最终判断。尚未生成患者级预测的病例返回 `409 PREDICTION_REQUIRED`，不能提前保存判断。

更新已有判断时，客户端必须把当前 `judged_at` 作为 `expected_judged_at` 提交。服务在 SQLite `BEGIN IMMEDIATE` 事务中比较版本；版本缺失或落后时返回 `409 JUDGMENT_CONFLICT`，避免其他医生或标签页的更新被静默覆盖。调用方应刷新 `/api/cases/{case_id}`、核对最新内容并重新提交，不能通过直接改库绕过冲突。

判断写入人记录为实际提交的当前用户。病例与批量列表目前没有按当前医生强制过滤，因此共享可见性也意味着同一病例可能被其他医生更新；前端和 API 客户端都必须保留版本字段。

## API 概览

完整请求与响应模型以运行中的 `/docs` 为准。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务、模型和队列健康状态 |
| `POST` | `/api/auth/login` | 登录并建立会话 |
| `POST` | `/api/auth/logout` | 注销会话 |
| `GET` | `/api/auth/me` | 获取当前用户 |
| `POST` | `/api/predict` | 提交单例多图异步推理 |
| `GET` | `/api/tasks/{task_id}` | 查询单例推理任务 |
| `POST` | `/api/predict/batch` | 上传批量 ZIP |
| `GET` | `/api/batch` | 分页查询批量任务，可按状态筛选 |
| `GET` | `/api/batch/{job_id}` | 获取批量进度和患者结果 |
| `POST` | `/api/batch/{job_id}/cancel` | 取消本人活动批次 |
| `GET` | `/api/cases` | 分页查询病例，可按关键词、类别、日期、医生和来源筛选 |
| `GET` | `/api/cases/{case_id}` | 获取病例、逐图预测、患者级预测与判断 |
| `POST` | `/api/cases/{case_id}/judgment` | 创建或并发安全地更新医生判断 |
| `GET` | `/api/images/{image_id}` | 获取浏览器可显示图像或 DICOM 预览 |
| `GET` | `/api/images/{image_id}/original` | 下载原始上传文件 |
| `GET` | `/api/images/{image_id}/gradcam` | 获取逐图 Grad-CAM |
| `GET` | `/api/cases/{case_id}/report.pdf` | 导出中文 PDF 报告 |

管理员接口还包括 `/api/admin/users`、`/api/admin/audit-logs`、`/api/admin/audit-logs.csv`；运行指标位于 `/api/metrics`，均受相应角色或会话校验保护。

## 测试与检查

```bash
cd backend
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -m compileall -q app tests
```

现有 `tests/test_clinical_workflow.py` 重点覆盖模型/判断类别边界、无预测时禁止判断、判断乐观并发、审计快照、批量处理、取消/超时、共享批量可见性和 PDF 标签。测试运行仍依赖 `requirements.txt` 中的 FastAPI、SQLAlchemy 等包；完整认证流程、模型效果、目标医院 DICOM 兼容性和实际硬件性能需要在获批环境另行验证。

## 部署入口

- 项目总览：`../README.md`
- 生产部署：`../docs/deployment.md`
- 值班与故障处理：`../docs/runbook.md`
- systemd / Windows 服务配置：`deploy/`
- 数据库初始化与备份脚本：`scripts/`
