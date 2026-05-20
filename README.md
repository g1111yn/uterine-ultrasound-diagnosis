# 子宫超声辅助诊断系统

> AI-powered uterine ultrasound diagnosis assistant for clinical use.

[English Version](README_EN.md)

---

## 1. 项目介绍

### 1.1 概述

子宫超声辅助诊断系统是一个面向医院妇科超声检查的 AI 辅助诊断工具。系统接收超声图像（支持 JPEG / PNG / BMP / TIFF / DICOM），通过深度学习模型进行推理，输出三类预测概率：**正常、子宫内膜癌、息肉**。

**V2 模型架构**（当前版本）：
- **图像编码器**：EfficientNet-B3（1536 维特征，输入 300x300 + ImageNet 归一化）
- **文本编码器**：阿里达摩院医学 BERT（`nlp_corom_sentence-embedding_chinese-base-medical`，768 维 CLS 向量）
- **融合方式**：图像主导门控融合（ImageDominantGatedFusion，256 维隐层）
- **分类器**：512 → 256 → 3（softmax）
- **训练数据**：10,587 例患者 / 196,255 张图像，5 折交叉验证
- **推理权重**：EMA 权重（Fold 3，pat_acc=0.8600）

系统支持**单例推理**（医生上传 1~30 张图像，逐图推理后聚合为患者级诊断）和**批量推理**（ZIP 上传数十到数百个患者，异步执行，自动排队）。

### 1.2 核心特性

| 特性 | 说明 |
|------|------|
| **多模态融合推理** | 图像 + 文本通过门控融合生成联合特征；文本输入为「检查方式 + 检查所见」拼接后整段喂 BERT |
| **患者维度推理** | 一个患者可上传多张超声图像（最多 30 张），每张独立推理后通过可插拔聚合策略生成患者级诊断 |
| **优先级推理队列** | 单例任务（priority=0）优先于批量任务（priority=5），医生操作不被批量阻塞 |
| **异步任务模型** | 提交后立即返回 202 + task_id，前端轮询任务状态，避免请求超时 |
| **幂等提交** | `idempotency_key` 保证重复提交不会产生重复病例 |
| **文本预处理** | 与训练管线一致的 `clean_check_seen` / `clean_check_project` 清洗规则 |
| **bcrypt 认证** | HttpOnly + SameSite 会话 cookie，连续失败锁定，支持强制改密 |
| **审计日志** | 登录 / 登出 / 创建病例 / 用户管理等操作全量记录，支持 CSV 导出 |
| **DICOM 支持** | 自动检测 DICOM 文件，窗宽窗位调整后转为 RGB 预览 |
| **Grad-CAM** | 对 EfficientNet-B3 最后卷积层生成热力图，辅助医生理解模型关注区域 |
| **PDF 报告** | 使用 reportlab 生成中文 PDF 诊断报告 |
| **结构化日志** | structlog JSON 输出 + request_id 全链路穿透 |

### 1.3 技术栈

**后端**
- Python 3.10 + FastAPI + Uvicorn
- SQLAlchemy 2.x + SQLite（WAL 模式）
- PyTorch（CPU 推理）+ torchvision + Transformers（BERT）
- bcrypt + structlog + reportlab + pydicom

**前端**
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4 + lucide-react
- React Router 6 + React Query (TanStack) + Zustand
- Axios

**部署**
- Linux: systemd 服务 + Nginx 反代（可选 HTTPS）
- Windows: NSSM 服务管理

### 1.4 推理管线

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────────────┐
│  PIL RGB 图像 │────▶│ Resize(300x300)  │────▶│ ToTensor + ImageNet Norm  │
└──────────────┘     └──────────────────┘     └─────────────┬─────────────┘
                                                            │ (1, 3, 300, 300)
┌──────────────┐     ┌──────────────────┐                   ▼
│  检查方式     │────▶│ clean_check_     │     ┌───────────────────────────┐
│  检查所见     │     │ project/seen     │────▶│  BERT CLS (1, 768)        │
└──────────────┘     │ → 拼接 → BERT    │     └─────────────┬─────────────┘
                     └──────────────────┘                   │
                                                            ▼
                     ┌──────────────────────────────────────────────────────┐
                     │  EfficientNet-B3 ──┐                                 │
                     │                    ├─▶ ImageDominantGatedFusion(256) │
                     │  BERT CLS ─────────┘          │                      │
                     │                               ▼                      │
                     │               Classifier (512→256→3) → softmax       │
                     └──────────────────────────────────────────────────────┘
```

- **空文本模式**：不填检查所见时，文本向量为 768 维零向量，仅靠图像推理
- **检查方式**可选：经阴道三维超声（默认）/ 经阴道超声 / 经腹三维超声 / 经腹超声 / 经会阴三维超声

### 1.5 项目结构

```
.
├── backend/
│   ├── app/
│   │   ├── api/              # API 路由
│   │   │   ├── predict.py    # POST /api/predict（单例推理）
│   │   │   ├── batch.py      # POST /api/predict/batch（批量推理）
│   │   │   ├── tasks.py      # GET  /api/tasks/{id}
│   │   │   ├── cases.py      # 病历查询 + 图片服务
│   │   │   ├── auth.py       # 登录 / 登出 / 改密
│   │   │   ├── admin.py      # 用户管理 + 审计日志 + CSV 导出
│   │   │   ├── health.py     # 健康检查
│   │   │   └── reports.py    # PDF 报告生成
│   │   ├── models/
│   │   │   ├── db.py         # SQLAlchemy 模型
│   │   │   └── schemas.py    # Pydantic 请求/响应模型
│   │   ├── services/
│   │   │   ├── inference.py        # V2 模型推理（EfficientNet-B3 + BERT）
│   │   │   ├── inference_queue.py  # 优先级推理队列
│   │   │   ├── aggregation.py      # 聚合策略
│   │   │   ├── batch_pipeline.py   # 批量任务流水线
│   │   │   ├── gradcam.py          # Grad-CAM 生成
│   │   │   └── report_pdf.py       # PDF 报告
│   │   ├── utils/
│   │   │   ├── text.py       # 文本清洗（clean_check_seen/project + build_clinical_text）
│   │   │   ├── image.py      # 图像加载 + DICOM 解码
│   │   │   └── ids.py        # ID 生成
│   │   ├── config.py         # 环境变量配置
│   │   └── main.py           # FastAPI 应用入口
│   ├── checkpoints/           # 模型权重（.gitignore）
│   ├── models/                # BERT 权重目录（.gitignore）
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts     # API 客户端
│   │   ├── pages/
│   │   │   ├── Predict.tsx   # 单例推理页（含检查方式下拉）
│   │   │   ├── Batch.tsx     # 批量推理页
│   │   │   ├── History.tsx   # 历史记录
│   │   │   └── CaseDetail.tsx # 病历详情（多图 + Grad-CAM）
│   │   └── lib/types.ts      # TypeScript 类型定义
│   └── package.json
└── README.md
```

---

## 2. 操作手册

### 2.1 首次部署

#### 环境准备

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 4 核 | 8 核+ |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 50 GB SSD | 200 GB SSD |

> EfficientNet-B3 + BERT 首次加载约需 2 GB 内存；CPU 推理约 1.2 秒/图。

#### 安装步骤（Linux）

```bash
# 1. 安装系统依赖
sudo apt update && sudo apt install -y python3.10 python3.10-venv sqlite3

# 2. 后端
cd backend
python3.10 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 3. 放置模型权重
#    - checkpoints/best_single_fold3.pth（EfficientNet-B3 + 融合层 + 分类器 EMA 权重）
#    - models/nlp_corom_sentence-embedding_chinese-base-medical/（阿里医学 BERT）

# 4. 初始化数据库 + 管理员
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password "YourSecurePassword"

# 5. 构建前端
cd ../frontend && npm install && npm run build

# 6. 启动
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODEL_CKPT_PATH` | `checkpoints/best_single_fold3.pth` | V2 模型权重路径 |
| `BERT_PATH` | `models/nlp_corom_sentence-embedding_chinese-base-medical` | 阿里医学 BERT 路径 |
| `MAX_IMAGES_PER_CASE` | `30` | 单例最多图像数 |
| `AGGREGATION_STRATEGY` | `mean` | 聚合策略：`mean` / `max_severity` / `majority_vote` |
| `LOG_FORMAT` | `console` | 日志格式：`json`（生产）/ `console` |
| `COOKIE_SECURE` | `false` | HTTPS 时改为 `true` |
| `SESSION_LIFETIME_HOURS` | `8` | 会话有效期 |

### 2.2 日常使用

#### 单例推理

1. 在「单例推理」页面选择**检查方式**（下拉，默认「经阴道三维超声」）
2. 上传 1~30 张超声图像
3. （可选）填写病历号和检查所见文本
4. 点击「提交」
5. 等待推理完成（约 1.2 秒/图），查看：
   - 患者级聚合诊断（概率分布 + 最终分类）
   - 逐图预测 + Grad-CAM 热力图

#### 批量推理

上传 ZIP，内含 `manifest.csv`（列：`patient_no, clinical_text`，可选列 `check_project`）和以 `patient_no` 命名的子目录。

### 2.3 API 速览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/predict` | 单例推理（Form: images, clinical_text, check_project, patient_no） |
| POST | `/api/predict/batch` | 批量推理（ZIP） |
| GET | `/api/tasks/{task_id}` | 查询任务状态 |
| GET | `/api/cases` | 病历列表 |
| GET | `/api/cases/{case_id}` | 病历详情 |
| GET | `/api/cases/{case_id}/report.pdf` | PDF 报告 |
| GET | `/api/health` | 健康检查 |

---

## 3. 运行与运维

### 3.1 服务管理

```bash
sudo systemctl status ultrasound
sudo systemctl restart ultrasound
journalctl -u ultrasound -f
curl -sS http://127.0.0.1:8000/api/health | jq
```

### 3.2 备份

```bash
# 每天凌晨 3 点自动备份（cron）
0 3 * * * /opt/ultrasound/backend/scripts/backup.sh
```

备份内容：SQLite 热备（`.backup` 命令） + uploads 目录增量 rsync，保留 30 天。

### 3.3 故障排查

| 现象 | 排查 |
|------|------|
| `model_loaded: false` | 检查 `MODEL_CKPT_PATH` / `BERT_PATH` 文件是否存在且可读 |
| 推理结果异常 | 确认使用 EMA 权重、图像通道 RGB、BERT CLS 不做 L2 norm |
| 推理慢 / P95 飙升 | 查看是否有批量任务占用队列、CPU 是否满载 |
| SQLite 锁 | 重启服务释放锁；正常 WAL + busy_timeout=5000 已处理并发 |

### 3.4 升级流程

```bash
sudo systemctl stop ultrasound
/opt/ultrasound/backend/scripts/backup.sh
cd /opt/ultrasound && git pull
cd backend && source venv/bin/activate && pip install -r requirements.txt
cd ../frontend && npm install && npm run build
sudo systemctl start ultrasound
```

数据库 schema 变更由 `init_schema()` 中的 `_ensure_legacy_columns()` 自动处理，无需手动迁移。

---

## 许可证

本项目仅供医院内部使用，请勿用于商业用途。模型预测结果仅供参考，不构成临床诊断，最终诊断应由执业医师作出。
