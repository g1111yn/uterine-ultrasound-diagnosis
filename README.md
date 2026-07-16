# 子宫超声辅助诊断系统

[English](README_EN.md)

## 系统定位

本项目是面向医院妇科超声场景的临床辅助诊断与研究原型。系统接收患者的多张超声图像和可选临床文本，生成患者级 AI 三分类建议、概率分布与 Grad-CAM 热图，并由医生在工作台中复核后主动保存最终判断。

系统不是自主诊断设备，也不替代医生阅片、鉴别诊断或医院既有诊疗流程。模型结果仅是辅助信息，最终判断及后续处置由执业医师负责。

## 临床工作流

### 单例诊断工作台

医生录入患者编号、检查方式和检查所见，可上传 1 至 30 张图像，单个文件最大 50 MB。提交后系统异步执行逐图推理和患者级聚合。病例详情采用三栏工作台：左侧为病例与检查信息，中间为原图/Grad-CAM 阅片区，右侧并列展示 AI 辅助建议和医生最终判断。

### 批量推理与连续诊断

医生上传包含多个患者的 ZIP 后，后台按患者串行处理，单例任务可在图像间优先进入推理队列。批量详情页把患者队列和病例工作台放在同一页面，支持“全部 / 未诊断 / 已诊断 / 推理失败”筛选，以及“保存判断”和“保存并下一位”。等待推理或推理失败的患者不属于可诊断病例，不能保存医生判断。

### 医生判断与责任边界

模型类别固定为 `normal`、`polyp`、`endometrial_cancer`。医生不能被动接受模型结果，必须主动选择并保存 `normal`、`polyp`、`endometrial_cancer` 或 `indeterminate`（无法判断 / 需进一步检查）之一，可同时记录处置建议和备注。

更新已有判断时，客户端提交 `expected_judged_at` 时间戳。若其他医生已先行修改，服务返回 `JUDGMENT_CONFLICT`；当前编辑内容会保留，医生应刷新最新判断、复核后再提交。这是基于时间戳的乐观并发控制，不是病例锁定。

## 模型与推理

- 图像编码器：EfficientNet-B3，输入缩放到 300 x 300 并使用 ImageNet 归一化。
- 文本编码器：阿里中文医学 BERT `nlp_corom_sentence-embedding_chinese-base-medical`，使用 CLS 向量；检查方式和检查所见按训练侧规则清洗后拼接。
- 多模态融合：图像主导门控融合（image-dominant gated fusion）；仅当检查方式和检查所见二者都为空时使用零文本向量。
- 患者级输出：先获得逐图三分类概率，再聚合为患者级建议；默认策略为 `mean`，还实现了 `max_severity` 和 `majority_vote`。
- 可解释性：为逐图预测生成 EfficientNet-B3 最后卷积层的 Grad-CAM 叠加图。
- 运行方式：当前推理器使用 CPU；模型检查点和 BERT 目录不随仓库分发，须由部署方提供。

模型输出只覆盖训练定义的三类，不表示对其他子宫或附件疾病的排除。研究评估应在目标医院人群上独立验证校准、分层表现、失败样本与分布漂移，不能仅以界面中的置信度代替临床性能评价。

## 功能概览

| 范围 | 当前能力 |
| --- | --- |
| 单例病例 | 多图上传、异步任务状态、患者级聚合、三栏诊断工作台 |
| 批量任务 | ZIP 校验、进度与历史、任务取消、患者队列、页面内连续诊断 |
| 医生复核 | 四类最终判断、处置建议、备注、保存/保存并下一位、未保存内容保护、判断冲突检测 |
| 阅片与输出 | 原图、DICOM 浏览器预览、逐图概率、Grad-CAM、中文 PDF 报告 |
| 检索 | 按关键词、日期、模型类别、医生和单例/批量来源查询病例 |
| 管理 | 医生/管理员账号、会话认证、登录锁定、审计日志与 CSV 导出、健康与指标接口 |

支持的图像格式为 JPG、JPEG、PNG、BMP、TIF、TIFF 和 DICOM（`.dcm`）。单例最多 30 张/病例、50 MB/图；批量最多 30 张/患者，ZIP 解压后总量最多 500 MB。

## 技术架构

```text
React 19 + TypeScript + Vite + TanStack Query
                    |
              /api (session cookie)
                    |
FastAPI + SQLAlchemy + priority inference queue
          |                         |
 SQLite (WAL)             PyTorch / Transformers
          |                         |
cases, judgments, audit     EfficientNet-B3 + medical BERT
          |
backend/data: uploads, previews, Grad-CAM, batch files
```

后端以 FastAPI 提供认证、病例、批量任务、判断、报告和运维接口；推理队列让单例图像任务优先于批量图像任务。SQLite 保存业务数据，上传文件和派生图像保存在本地数据目录。前端使用 React Router 和 TanStack Query 管理路由、服务端状态、轮询及判断版本刷新。

开发细节分别见 [后端说明](backend/README.md) 和 [前端说明](frontend/README.md)。

## 快速开始

需要 Python 3.10+、Node.js/npm，以及以下本地模型文件；也可通过 `MODEL_CKPT_PATH` 和 `BERT_PATH` 指向其他位置：

```text
backend/checkpoints/best_single_fold3.pth
backend/models/nlp_corom_sentence-embedding_chinese-base-medical/
```

启动后端并创建开发管理员：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password 'ChangeMe#2026'
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

在另一终端启动前端；Vite 默认把 `/api` 代理到 `http://localhost:8000`：

```bash
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173`。首次登录后应立即修改初始化密码。FastAPI 交互文档位于 `http://localhost:8000/docs`；若模型文件缺失，服务仍可启动，但健康检查会显示模型未加载，推理任务不能成功。

## 批量 ZIP 格式

ZIP 根目录必须直接包含 UTF-8 编码的 `manifest.csv`，表头包含 `patient_no`、`clinical_text`，可选 `check_project`。每个患者目录必须是 ZIP 根目录的直接子目录，目录名与对应 `patient_no` **完全一致**。

```text
batch.zip
├── manifest.csv
├── P0001/
│   ├── image-01.jpg
│   └── image-02.dcm
└── P0002/
    └── image-01.png
```

```csv
patient_no,clinical_text,check_project
P0001,子宫前位，宫腔内见偏强回声,经阴道三维超声
P0002,内膜厚度约 0.8 cm,
```

不要把上述内容再包在一个额外的顶层目录中。例如 `batch/manifest.csv` 会使服务在 ZIP 根目录找不到清单。清单之外的患者目录、缺少同名目录的清单行以及不支持的文件会被跳过或报告为校验信息。每位患者最多处理 30 张支持格式的图像，全部解压内容合计不得超过 500 MB。

## 测试与质量检查

后端使用标准库 `unittest`，前端使用 Vitest；以下命令与仓库现有测试入口一致：

```bash
cd backend
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -m compileall -q app tests
```

```bash
cd frontend
npm test -- --run
npm run build
npm run lint
```

当前测试重点覆盖临床工作流、批量状态与筛选、判断并发冲突、未保存编辑保护、上传交互和 API 行为。涉及模型效果、DICOM 设备差异或医院网络环境的验证仍需使用获批数据和目标部署环境单独完成。

## API 概览

除登录和健康检查外，业务接口均要求有效会话。完整请求/响应模型以运行中的 `/docs` 和 [后端说明](backend/README.md) 为准。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | 登录并建立会话 |
| `GET` | `/api/health` | 服务、模型与队列健康状态 |
| `POST` | `/api/predict` | 提交单例多图推理 |
| `GET` | `/api/tasks/{task_id}` | 查询单例任务状态 |
| `POST` | `/api/predict/batch` | 上传批量 ZIP |
| `GET` | `/api/batch` | 查询批量历史 |
| `GET` | `/api/batch/{job_id}` | 查询批次进度和患者结果 |
| `POST` | `/api/batch/{job_id}/cancel` | 取消可取消的批次 |
| `GET` | `/api/cases` | 查询病例列表 |
| `GET` | `/api/cases/{case_id}` | 获取病例、图像、预测和判断 |
| `POST` | `/api/cases/{case_id}/judgment` | 创建或并发安全地更新医生判断 |
| `GET` | `/api/images/{image_id}` | 获取可浏览图像/预览 |
| `GET` | `/api/images/{image_id}/original` | 获取原始上传文件 |
| `GET` | `/api/images/{image_id}/gradcam` | 获取 Grad-CAM 图 |
| `GET` | `/api/cases/{case_id}/report.pdf` | 导出 PDF 报告 |

## 部署与运维入口

- [后端开发与服务说明](backend/README.md)
- [前端开发说明](frontend/README.md)
- [生产部署](docs/deployment.md)
- [值班与故障处理](docs/runbook.md)

生产环境应使用受控主机、HTTPS 反向代理、强密码、`COOKIE_SECURE=true`、备份与恢复演练，并在升级后执行健康检查、登录抽样和临床流程抽样。具体 systemd、Nginx、Windows NSSM、备份和恢复命令见上述文档。

## 数据、安全与医院接入边界

- 当前数据存储是单机 SQLite 与本地文件目录，不是面向多节点部署的共享数据库或对象存储。部署方负责磁盘加密、备份介质、保留期限、删除流程和访问审计。
- 系统使用账号密码、bcrypt 哈希、HttpOnly/SameSite 会话 cookie、失败锁定和审计日志；这些能力不能替代医院统一身份、终端管理、网络隔离或安全审查。
- **当前所有已登录医生共享病例和批量任务的可见性，并可为任意病例创建或更新医生判断（病例必须已完成推理）；批量任务仅可由创建者取消。** 科室隔离、病例所有者权限和更细粒度授权尚未实现，应在正式医院集成时结合组织、岗位与最小权限策略收紧。
- 当前仓库未实现 PACS、HIS、EMR、RIS 或医院 SSO 对接，也不声明已满足任何特定医疗器械注册、数据合规认证或互操作标准。接口映射、身份联邦、数据脱敏、知情/伦理审批和院内验收属于部署项目范围。
- 真实患者数据不得用于未获授权的开发或研究环境。日志、ZIP、原始图像、DICOM 元数据、PDF 和备份均可能包含敏感信息，应按同等级别保护。

## 项目结构

```text
.
├── backend/
│   ├── app/          # FastAPI 路由、数据模型、推理与业务服务
│   ├── tests/        # 后端临床工作流测试
│   ├── scripts/      # 初始化与备份脚本
│   ├── deploy/       # systemd / Windows 服务配置
│   └── data/         # 运行时数据库和文件（生产环境需独立保护）
├── frontend/
│   └── src/          # React 页面、临床组件、API 客户端和测试
├── docs/             # 部署、运维和设计/实施记录
├── README.md         # 中文总览
└── README_EN.md      # English overview
```

## License

仓库目前未提供独立的开源许可证文件。按项目现有约定，本项目仅供医院内部使用，不得商用；模型输出仅供辅助参考，不构成临床诊断，最终诊断由执业医师作出。
