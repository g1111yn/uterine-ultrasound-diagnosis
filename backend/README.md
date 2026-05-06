# 子宫超声辅助诊断系统 — 后端

基于 FastAPI 的后端服务，提供超声图像 AI 辅助诊断、病例管理、PDF 报告导出等功能。

## 技术栈

- Python 3.10+, FastAPI, Uvicorn, SQLAlchemy 2.x, SQLite, ReportLab

## 开发启动

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API 文档：http://localhost:8000/docs
- 数据库在首次启动时自动创建于 `data/app.db`

前端开发时单独启动（默认 5173 端口），后端已配置 CORS。

## 生产部署

### 1. 构建前端

```bash
cd frontend
npm install
npm run build    # 生成 frontend/dist/
```

### 2. 启动后端（含前端静态文件）

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

访问 http://localhost:8000 即可看到前端页面，API 在 /api/* 下。

### 3. Linux systemd 服务

```bash
# 将项目部署到 /opt/ultrasound/
sudo cp deploy/ultrasound.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ultrasound
sudo systemctl start ultrasound
```

根据实际路径修改 `deploy/ultrasound.service` 中的 `WorkingDirectory` 和 `ExecStart`。

### 4. Windows NSSM 服务

```bat
cd backend\deploy
install-windows.bat
```

需要先安装 [NSSM](https://nssm.cc/) 并加入 PATH。

## 目录结构

```
backend/
├── app/
│   ├── main.py           # FastAPI 入口 + 静态文件挂载
│   ├── config.py         # 配置
│   ├── api/              # 路由（health, predict, batch, cases, reports）
│   ├── models/           # SQLAlchemy 模型 + Pydantic schemas
│   ├── services/         # 推理、Grad-CAM、批量任务、PDF 生成
│   └── utils/            # 图像处理、ID 生成
├── data/                 # 上传图片 + Grad-CAM + SQLite 数据库
├── deploy/               # systemd / NSSM 部署配置
├── scripts/              # 数据库初始化脚本
└── requirements.txt
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/predict | 单张图像推理 |
| POST | /api/predict/batch | 批量推理 |
| GET | /api/batch/{job_id} | 批量任务状态 |
| GET | /api/cases | 病例列表（分页、筛选） |
| GET | /api/cases/{case_id} | 病例详情 |
| POST | /api/cases/{case_id}/judgment | 提交医生判断 |
| GET | /api/cases/{case_id}/image | 原始超声图像 |
| GET | /api/cases/{case_id}/gradcam.png | Grad-CAM 热图 |
| GET | /api/cases/{case_id}/report.pdf | PDF 诊断报告 |
