# 子宫超声辅助诊断系统

> AI-powered uterine ultrasound diagnosis assistant for clinical use.

[English Version](README_EN.md)

---

## 1. 项目介绍

### 1.1 概述

子宫超声辅助诊断系统是一个面向医院妇科超声检查的 AI 辅助诊断工具。系统接收超声图像（支持 JPEG / PNG / BMP / TIFF / DICOM），通过深度学习模型（ResNet18 + BERT-Chinese 多模态融合）进行推理，输出三类预测概率：**正常、子宫内膜癌、息肉**。

系统支持**单例推理**（医生上传一到多张图像，系统逐图推理后聚合为一个患者级别诊断结果）和**批量推理**（通过 ZIP 上传数十到数百个患者，异步执行，自动排队）。

### 1.2 核心特性

| 特性 | 说明 |
|------|------|
| **患者维度推理** | 一个患者可上传多张超声图像，每张独立推理后通过可插拔聚合策略（均值 / 最大严重度 / 多数投票）生成患者级诊断 |
| **优先级推理队列** | 单例任务（priority=0）优先于批量任务（priority=5），医生单例操作不被批量阻塞 |
| **异步任务模型** | 提交后立即返回 202 + task_id，前端轮询任务状态，避免请求超时 |
| **幂等提交** | `idempotency_key` 保证重复提交不会产生重复病例 |
| **bcrypt 认证 + 会话管理** | 基于 bcrypt 的密码哈希，HttpOnly + SameSite 会话 cookie，连续失败锁，支持强制改密 |
| **审计日志** | 登录 / 登出 / 创建病例 / 用户管理等操作全量记录，支持 CSV 导出 |
| **管理员角色** | 用户管理、审计日志查询、系统统计，支持基于角色的访问控制 |
| **DICOM 支持** | 自动检测 DICOM 文件，窗宽窗位调整后转为 RGB 预览 |
| **MIME 嗅探** | 上传时检查文件实际类型（magic bytes），拒绝伪装扩展名的文件 |
| **Grad-CAM 可视化** | 对 ResNet18 最后一层生成 Grad-CAM 热力图，辅助医生理解模型关注区域 |
| **结构化日志** | structlog JSON 输出 + request_id 全链路穿透，生产环境可直接接 ELK |
| **PDF 报告** | 使用 reportlab 生成中文 PDF 诊断报告，支持 STSong-Light 字体 |
| **ErrorBoundary** | 前端全局错误捕获，渲染崩溃时提供复制错误信息和重新加载按钮 |

### 1.3 技术栈

**后端**
- Python 3.10 + FastAPI + Uvicorn
- SQLAlchemy 2.x + SQLite（WAL 模式）
- PyTorch（CPU 推理） + torchvision + Transformers
- bcrypt + structlog + reportlab + pydicom

**前端**
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4 + lucide-react
- React Router 6 + React Query (TanStack) + Zustand
- Axios

**部署**
- Linux: systemd 服务 + Nginx 反代（可选 HTTPS）
- Windows: NSSM 服务管理
- 支持 Docker（自行构建）

### 1.4 项目结构

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
│   │   │   ├── metrics.py    # 系统指标
│   │   │   ├── health.py     # 健康检查
│   │   │   └── reports.py    # PDF 报告生成
│   │   ├── models/
│   │   │   ├── db.py         # SQLAlchemy 模型（11 张表）
│   │   │   └── schemas.py    # Pydantic 请求/响应模型
│   │   ├── services/
│   │   │   ├── inference.py        # 模型推理封装
│   │   │   ├── inference_queue.py  # 优先级推理队列
│   │   │   ├── aggregation.py      # 聚合策略（mean / max_severity / majority_vote）
│   │   │   ├── auth.py             # bcrypt + 会话管理
│   │   │   ├── audit.py            # 审计日志
│   │   │   ├── batch_pipeline.py   # 批量任务流水线
│   │   │   ├── gradcam.py          # Grad-CAM 生成
│   │   │   └── report_pdf.py       # PDF 报告
│   │   ├── middleware.py     # RequestId + Metrics 中间件
│   │   ├── errors.py         # 业务异常类
│   │   ├── config.py         # 环境变量配置
│   │   └── main.py           # FastAPI 应用入口
│   ├── scripts/
│   │   ├── init_db.py        # 数据库初始化
│   │   ├── init_admin.py     # 管理员创建/重置
│   │   └── backup.sh         # 备份脚本
│   ├── tests/
│   │   └── loadtest.py       # 压力测试
│   ├── deploy/
│   │   ├── ultrasound.service  # systemd 单元文件
│   │   └── nssm-install.md     # Windows NSSM 部署
│   ├── checkpoints/           # 模型权重（.gitignore）
│   ├── data/                  # 运行时数据（.gitignore）
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/              # API 客户端
│   │   ├── auth/             # AuthContext + ProtectedRoute
│   │   ├── components/       # 公共组件
│   │   ├── pages/            # 页面
│   │   │   ├── Login.tsx           # 登录页
│   │   │   ├── Predict.tsx         # 单例推理页
│   │   │   ├── Batch.tsx           # 批量推理页
│   │   │   ├── History.tsx         # 历史记录
│   │   │   ├── CaseDetail.tsx      # 病历详情（多图切换）
│   │   │   ├── ChangePassword.tsx  # 修改密码
│   │   │   ├── Settings.tsx        # 设置
│   │   │   └── admin/              # 管理员页面
│   │   │       ├── Users.tsx       # 用户管理
│   │   │       ├── AuditLogs.tsx   # 审计日志
│   │   │       └── Stats.tsx       # 系统统计
│   │   └── main.tsx
│   └── package.json
├── docs/
│   ├── deployment.md         # 部署文档
│   └── runbook.md            # 运维手册
└── README.md
```

---

## 2. 操作手册

### 2.1 首次部署

#### 2.1.1 环境准备

**硬件要求**

| 场景 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 4 核 | 8 核+ |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 50 GB SSD | 200 GB SSD |
| 网络 | 100 Mbps | 1 Gbps |

> 推理使用 CPU，首次加载 BERT + ResNet18 约需 1.2 GB 内存。

**软件要求**
- Python 3.10+
- Node.js 18+（前端构建）
- SQLite 3.35+（WAL 模式）
- rsync（备份脚本）

#### 2.1.2 安装步骤（Linux）

```bash
# 1. 安装系统依赖
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3-pip \
  sqlite3 rsync libjpeg-dev libpng-dev

# 2. 创建系统用户
sudo useradd -r -s /bin/bash -m -d /opt/ultrasound ultrasound
sudo -u ultrasound mkdir -p /opt/ultrasound

# 3. 拉取代码（scp 或 git clone）
cd /opt/ultrasound
git clone <仓库地址> .
sudo chown -R ultrasound:ultrasound /opt/ultrasound

# 4. 创建 Python 虚拟环境并安装依赖
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  python3.10 -m venv venv
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
'

# 5. 放置模型权重
# 将 bert-base_fold1_best.pth 放到 backend/checkpoints/
# 将 bert-base-chinese 目录放到 backend/models/bert/
# 或通过环境变量 MODEL_CKPT_PATH / BERT_PATH 指定路径

# 6. 初始化数据库 + 创建管理员
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  source venv/bin/activate
  python scripts/init_db.py
  python scripts/init_admin.py --user-id admin --password "YourSecurePassword"
'

# 7. 构建前端
cd /opt/ultrasound/frontend
sudo -u ultrasound bash -lc 'npm install && npm run build'

# 8. 安装 systemd 服务
sudo cp /opt/ultrasound/backend/deploy/ultrasound.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ultrasound

# 9. 验证
sudo systemctl status ultrasound
curl -s http://127.0.0.1:8000/api/health | python3 -m json.tool
```

#### 2.1.3 安装步骤（Windows）

参见 `backend/deploy/nssm-install.md`，使用 NSSM 注册服务。

```cmd
REM 1. 创建 Python 虚拟环境
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

REM 2. 初始化数据库 + 管理员
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password "YourSecurePassword"

REM 3. 构建前端
cd ..\frontend
npm install
npm run build

REM 4. 使用 NSSM 注册服务（参见 nssm-install.md）
```

#### 2.1.4 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOST` | `0.0.0.0` | 监听地址 |
| `PORT` | `8000` | 监听端口 |
| `LOG_FORMAT` | `console` | 日志格式：`json`（生产推荐） / `console` |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `MODEL_CKPT_PATH` | `~/Documents/超声/checkpoints/...` | 模型权重路径 |
| `BERT_PATH` | `~/Documents/超声/models/...` | BERT 模型路径 |
| `AGGREGATION_STRATEGY` | `mean` | 聚合策略：`mean` / `max_severity` / `majority_vote` |
| `MAX_IMAGES_PER_CASE` | `10` | 单例最多图像数 |
| `MAX_IMAGE_BYTES` | `52428800` (50MB) | 单图大小上限 |
| `COOKIE_SECURE` | `false` | HTTPS 时改为 `true` |
| `COOKIE_SAMESITE` | `lax` | Cookie SameSite 策略 |
| `SESSION_LIFETIME_HOURS` | `8` | 会话有效期（小时） |
| `LOGIN_FAILURE_LIMIT` | `5` | 连续失败锁定阈值 |
| `LOGIN_LOCKOUT_MINUTES` | `15` | 锁定时长（分钟） |
| `PASSWORD_MIN_LENGTH` | `8` | 密码最短长度 |
| `HSTS_ENABLED` | `false` | HTTPS 时开启 |
| `FORCE_HTTPS_REDIRECT` | `false` | 强制 HTTP → HTTPS 跳转 |
| `BATCH_MAX_UNCOMPRESSED_BYTES` | `524288000` (500MB) | 批量 ZIP 解压上限 |
| `BATCH_MAX_IMAGES_PER_PATIENT` | `20` | 批量每个患者最多图像数 |
| `MAX_ACTIVE_BATCHES_PER_USER` | `1` | 每用户同时最多批量任务数 |
| `MAX_PENDING_BATCHES_GLOBAL` | `10` | 全局最多排队批量任务数 |

### 2.2 日常操作

#### 2.2.1 登录

1. 访问 `http://<服务器 IP>:8000/`
2. 输入工号和密码
3. 首次登录管理员账号后，请立即修改密码

#### 2.2.2 单例推理

1. 在「单例推理」页面上传一张或多张超声图像
2. （可选）填写病历号和临床描述
3. 点击「提交」，系统返回任务 ID 并自动轮询状态
4. 推理完成后展示：
   - **整体诊断**：聚合后的预测概率（正常 / 内膜癌 / 息肉）
   - **逐图分析**：每张图的独立预测 + Grad-CAM 热力图
   - 可在详情页切换查看各图的 Grad-CAM 可视化

#### 2.2.3 批量推理

1. 在「批量推理」页面上传 ZIP 文件
2. ZIP 结构：
   ```
   患者编号/
   ├── image1.jpg
   ├── image2.png
   └── ...
   另一个患者/
   └── scan.dcm
   ```
3. （可选）提供 `manifest.csv` 指定每位患者的临床描述
4. 提交后系统在后台逐患者推理，可随时查看进度或取消
5. 排队期间新的单例任务会插队优先执行

#### 2.2.4 历史记录与病历详情

1. 「历史记录」页面按时间倒序展示所有病历
2. 点击任意病历进入详情页
3. 详情页包含：
   - 患者信息（病历号、临床描述）
   - 聚合诊断结果
   - 多图切换器 + 逐图 Grad-CAM
   - 医生判定表单（可在详情页记录最终诊断意见）

#### 2.2.5 管理员功能

仅 `admin` 角色可见顶部「管理」菜单：

- **用户管理** (`/admin/users`)：创建 / 编辑 / 禁用用户，重置密码
- **审计日志** (`/admin/audit-logs`)：查看系统操作记录，支持导出 CSV
- **系统统计** (`/admin/stats`)：查看推理延迟、队列长度、错误率等指标

#### 2.2.6 修改密码

点击右上角用户名 → 「修改密码」，需要输入当前密码。

### 2.3 API 速览

所有需要认证的接口均通过 session cookie 鉴权。

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 否 |
| POST | `/api/auth/logout` | 登出 | 是 |
| GET | `/api/auth/me` | 当前用户信息 | 是 |
| POST | `/api/auth/change-password` | 修改密码 | 是 |
| POST | `/api/predict` | 单例推理（多图） | 是 |
| POST | `/api/predict/batch` | 批量推理（ZIP） | 是 |
| GET | `/api/tasks/{task_id}` | 查询任务状态 | 是 |
| GET | `/api/cases` | 病历列表 | 是 |
| GET | `/api/cases/{case_id}` | 病历详情 | 是 |
| POST | `/api/cases/{case_id}/judgment` | 记录医生判定 | 是 |
| GET | `/api/images/{image_id}/original` | 原始图像 | 是 |
| GET | `/api/images/{image_id}/gradcam` | Grad-CAM 热力图 | 是 |
| GET | `/api/reports/{case_id}` | PDF 报告 | 是 |
| GET | `/api/health` | 健康检查 | 否 |
| GET | `/api/metrics` | 系统指标 | admin |
| GET | `/api/admin/users` | 用户列表 | admin |
| POST | `/api/admin/users` | 创建用户 | admin |
| PATCH | `/api/admin/users/{user_id}` | 编辑用户 | admin |
| DELETE | `/api/admin/users/{user_id}` | 删除用户 | admin |
| GET | `/api/admin/audit-logs` | 审计日志 | admin |
| GET | `/api/admin/audit-logs/export` | CSV 导出 | admin |

### 2.4 聚合策略

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| `mean`（默认） | 多图概率取均值 | 通用场景，结果稳健 |
| `max_severity` | 任一图癌概率 ≥ 阈值则判癌，否则回退均值 | 偏向宁可误判也不漏判 |
| `majority_vote` | 多图多数投票 | 图像质量差异较大时 |

通过环境变量 `AGGREGATION_STRATEGY` 或请求参数切换。

---

## 3. 运行与运维

### 3.1 服务管理

```bash
# 查看服务状态
systemctl status ultrasound

# 查看实时日志
journalctl -u ultrasound -f

# 重启服务
sudo systemctl restart ultrasound

# 停止服务
sudo systemctl stop ultrasound

# 健康检查
curl -sS http://127.0.0.1:8000/api/health | jq
```

### 3.2 日志

#### 3.2.1 日志格式

生产环境推荐 JSON 格式（`LOG_FORMAT=json`），每条日志包含：

```json
{
  "event": "response.5xx",
  "path": "/api/predict",
  "method": "POST",
  "request_id": "a1b2c3d4",
  "timestamp": "2026-05-12T10:30:00Z",
  "level": "error"
}
```

#### 3.2.2 日志事件类型

| 事件 | 说明 |
|------|------|
| `startup.model_loaded` | 模型正常加载 |
| `startup.model_load_failed` | 模型加载失败，服务可用但推理全部失败 |
| `response.5xx` | 5xx 响应（附 path / method / request_id） |
| `unhandled_exception` | 未预期异常（堆栈已落盘） |
| `audit.xxx` | 审计事件（登录/登出/创建用户等） |

所有日志都带 `request_id`，可用它穿透一次请求的全链路。

#### 3.2.3 查看日志

```bash
# 最近 200 行
journalctl -u ultrasound -n 200 --no-pager

# 按 request_id 过滤
journalctl -u ultrasound | grep '"request_id":"a1b2c3d4"'

# 只看错误
journalctl -u ultrasound -p err
```

### 3.3 备份

#### 3.3.1 自动备份

`backend/scripts/backup.sh` 执行：
- SQLite `.backup`（在线热备，不锁数据库）
- uploads 目录增量 rsync
- 保留最近 30 天

**设置 cron 定时任务**（每天凌晨 3 点）：

```bash
crontab -e
# 添加：
0 3 * * * /opt/ultrasound/backend/scripts/backup.sh >> /var/log/ultrasound-backup.log 2>&1
```

#### 3.3.2 恢复

```bash
# 从备份复制数据库
cp /mnt/nas/backups/ultrasound/app-20260501-030000.db /opt/ultrasound/backend/data/app.db

# 同步上传文件
rsync -a /mnt/nas/backups/ultrasound/uploads-latest/ /opt/ultrasound/backend/data/uploads/

# 重启服务
sudo systemctl restart ultrasound

# 验证：登录 + 查历史 + 查单个 case 详情
curl -sS http://127.0.0.1:8000/api/health
```

> **建议每月做一次恢复演练**，确保备份有效。

### 3.4 压测

```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python tests/loadtest.py \
  --base-url http://127.0.0.1:8000 \
  --user-id admin --password 'YourPassword' \
  --concurrency 10 --total 30 \
  --image /path/to/sample.jpg
```

输出 P50 / P95 / P99 延迟和错误计数。期望 CPU 推理 P95 < 5 秒。

### 3.5 HTTPS 部署

建议用 Nginx 做 TLS 终止反代：

```nginx
server {
    listen 443 ssl http2;
    server_name diagnosis.hospital.internal;
    ssl_certificate     /etc/ssl/certs/hospital.crt;
    ssl_certificate_key /etc/ssl/private/hospital.key;

    client_max_body_size 600m;
    proxy_read_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

部署后修改环境变量：
```bash
COOKIE_SECURE=true
HSTS_ENABLED=true
FORCE_HTTPS_REDIRECT=true
```

### 3.6 故障排查

#### 服务挂了 / 无法访问首页

```bash
systemctl status ultrasound                    # 检查是否 active
journalctl -u ultrasound -n 200 --no-pager    # 查最近日志
curl http://127.0.0.1:8000/api/health          # 健康检查
```

- `model_loaded: false` → 检查 `MODEL_CKPT_PATH` / `BERT_PATH` 文件是否存在且可读
- 服务未启动 → `sudo systemctl restart ultrasound`

#### SQLite 锁死 / 写入缓慢

```bash
lsof backend/data/app.db    # 查看谁在持有数据库
```

- 长事务导致 WAL 膨胀 → 极端情况下重启服务释放锁
- 正常情况下 WAL + `busy_timeout=5000` 已自动处理并发

#### 磁盘满

```bash
du -sh /opt/ultrasound/backend/data/*
```

处理顺序：
1. 跑一次 `backup.sh` 归档旧数据
2. 删除 30 天以前的 `uploads/YYYY/MM/DD/` 子目录（**先确认备份**）
3. 用 `PRAGMA wal_checkpoint(TRUNCATE)` 压缩 WAL

#### 推理变慢 / P95 飙升

1. `curl http://127.0.0.1:8000/api/metrics`（admin cookie）查看延迟和队列长度
2. 正在跑批量任务？让它跑完再观察
3. CPU 占满？考虑限制并发（`MAX_PENDING_BATCHES_GLOBAL`）或升级硬件
4. BERT 缓存失效？首次加载后 avg 应在 80ms 左右，如果明显更慢说明模型被换出，查内存

#### 忘记管理员密码

有至少一个可用 admin：
```bash
# 用其他 admin 登录后通过管理页面重置
PATCH /api/admin/users/<user_id>  { "new_password": "..." }
```

全部 admin 丢失：
```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python scripts/init_admin.py --user-id admin --password 'NewAdminPass#2026' --reset
```

### 3.7 升级流程

```bash
# 1. 停服务
sudo systemctl stop ultrasound

# 2. 备份
/opt/ultrasound/backend/scripts/backup.sh

# 3. 更新代码
cd /opt/ultrasound
git pull

# 4. 更新依赖
cd backend
source venv/bin/activate
pip install -r requirements.txt

# 5. 有 schema 变更时手动执行迁移（V2 接入 Alembic）

# 6. 重建前端
cd ../frontend
npm install && npm run build

# 7. 启动服务
sudo systemctl start ultrasound
systemctl status ultrasound
journalctl -u ultrasound -f
```

### 3.8 数据库模型

系统使用 SQLite，共 11 张表：

| 表名 | 说明 |
|------|------|
| `users` | 用户（工号、姓名、部门、角色、密码哈希） |
| `sessions` | 会话 |
| `login_attempts` | 登录尝试（用于防暴力破解） |
| `audit_logs` | 审计日志 |
| `cases` | 病例（一个患者一个 case） |
| `case_images` | 病例图像（一个 case 可有多张图） |
| `per_image_predictions` | 逐图推理结果 |
| `predictions` | 聚合后的患者级诊断 |
| `judgments` | 医生判定 |
| `batch_jobs` | 批量任务 |
| `idempotency_records` | 幂等记录（24h 过期） |

---

## 许可证

本项目仅供医院内部使用，请勿用于商业用途。模型预测结果仅供参考，不构成临床诊断，最终诊断应由执业医师作出。

---

## 联系方式

如有问题，请联系信息科。
