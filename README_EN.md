# Uterine Ultrasound AI-Assisted Diagnosis System

> AI-powered uterine ultrasound diagnosis assistant for clinical use.

[中文版本](README.md)

---

## 1. Project Introduction

### 1.1 Overview

The Uterine Ultrasound AI-Assisted Diagnosis System is an AI-powered clinical decision support tool for gynecological ultrasound examinations. The system accepts ultrasound images (JPEG / PNG / BMP / TIFF / DICOM), runs inference through a deep learning model, and outputs prediction probabilities for three categories: **Normal, Endometrial Cancer, and Polyp**.

**V2 Model Architecture** (current version):
- **Image Encoder**: EfficientNet-B3 (1536-dim features, input 300x300 + ImageNet normalization)
- **Text Encoder**: Alibaba DAMO Medical BERT (`nlp_corom_sentence-embedding_chinese-base-medical`, 768-dim CLS vector)
- **Fusion**: Image-Dominant Gated Fusion (ImageDominantGatedFusion, 256-dim hidden)
- **Classifier**: 512 → 256 → 3 (softmax)
- **Training Data**: 10,587 patients / 196,255 images, 5-fold cross-validation
- **Inference Weights**: EMA weights (Fold 3, pat_acc=0.8600)

The system supports **single-case inference** (doctor uploads 1~30 images; per-image inference aggregated into patient-level diagnosis) and **batch inference** (upload dozens to hundreds of patients via ZIP; async execution with automatic queuing).

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| **Multimodal Fusion** | Image + text fused via gated mechanism; text input is "exam method + findings" concatenated and fed to BERT as one segment |
| **Patient-level Inference** | Up to 30 images per patient, independently inferred then aggregated via pluggable strategies |
| **Priority Queue** | Single-case tasks (priority=0) preempt batch tasks (priority=5) |
| **Async Task Model** | Returns 202 + task_id immediately; frontend polls until completion |
| **Idempotent Submission** | `idempotency_key` prevents duplicate cases |
| **Text Preprocessing** | Training-consistent `clean_check_seen` / `clean_check_project` cleaning rules |
| **bcrypt Auth** | HttpOnly + SameSite session cookies, consecutive failure lockout, forced password change |
| **Audit Logging** | Full recording of all operations with CSV export |
| **DICOM Support** | Auto-detection with window width/level adjustment and RGB preview |
| **Grad-CAM** | Heatmaps from EfficientNet-B3's last conv layer |
| **PDF Reports** | Chinese PDF diagnosis reports via reportlab |
| **Structured Logging** | structlog JSON output with request_id tracing |

### 1.3 Tech Stack

**Backend**
- Python 3.10 + FastAPI + Uvicorn
- SQLAlchemy 2.x + SQLite (WAL mode)
- PyTorch (CPU inference) + torchvision + Transformers (BERT)
- bcrypt + structlog + reportlab + pydicom

**Frontend**
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4 + lucide-react
- React Router 6 + React Query (TanStack) + Zustand
- Axios

**Deployment**
- Linux: systemd service + Nginx reverse proxy (optional HTTPS)
- Windows: NSSM service management

### 1.4 Inference Pipeline

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────────────┐
│  PIL RGB img │────▶│ Resize(300x300)  │────▶│ ToTensor + ImageNet Norm  │
└──────────────┘     └──────────────────┘     └─────────────┬─────────────┘
                                                            │ (1, 3, 300, 300)
┌──────────────┐     ┌──────────────────┐                   ▼
│ Exam method  │────▶│ clean_check_     │     ┌───────────────────────────┐
│ Findings     │     │ project/seen     │────▶│  BERT CLS (1, 768)        │
└──────────────┘     │ → concat → BERT  │     └─────────────┬─────────────┘
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

- **No-text mode**: When findings are empty, text vector is a 768-dim zero vector (image-only inference)
- **Exam method** options: Transvaginal 3D US (default) / Transvaginal US / Transabdominal 3D US / Transabdominal US / Transperineal 3D US

### 1.5 Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── predict.py    # POST /api/predict (single-case)
│   │   │   ├── batch.py      # POST /api/predict/batch (batch)
│   │   │   ├── tasks.py      # GET  /api/tasks/{id}
│   │   │   ├── cases.py      # Case listing + image serving
│   │   │   ├── auth.py       # Login / Logout / Change password
│   │   │   ├── admin.py      # User management + audit logs
│   │   │   ├── health.py     # Health check
│   │   │   └── reports.py    # PDF report generation
│   │   ├── models/
│   │   │   ├── db.py         # SQLAlchemy models
│   │   │   └── schemas.py    # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── inference.py        # V2 model inference (EfficientNet-B3 + BERT)
│   │   │   ├── inference_queue.py  # Priority inference queue
│   │   │   ├── aggregation.py      # Aggregation strategies
│   │   │   ├── batch_pipeline.py   # Batch job pipeline
│   │   │   ├── gradcam.py          # Grad-CAM generation
│   │   │   └── report_pdf.py       # PDF reports
│   │   ├── utils/
│   │   │   ├── text.py       # Text cleaning (clean_check_seen/project)
│   │   │   ├── image.py      # Image loading + DICOM decode
│   │   │   └── ids.py        # ID generation
│   │   ├── config.py         # Environment configuration
│   │   └── main.py           # FastAPI entry point
│   ├── checkpoints/           # Model weights (.gitignore)
│   ├── models/                # BERT weights directory (.gitignore)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts     # API client
│   │   ├── pages/
│   │   │   ├── Predict.tsx   # Single-case (with exam method dropdown)
│   │   │   ├── Batch.tsx     # Batch inference
│   │   │   ├── History.tsx   # History records
│   │   │   └── CaseDetail.tsx # Case detail (multi-image + Grad-CAM)
│   │   └── lib/types.ts      # TypeScript type definitions
│   └── package.json
└── README_EN.md
```

---

## 2. User Manual

### 2.1 Initial Deployment

#### Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| CPU | 4 cores | 8 cores+ |
| RAM | 8 GB | 16 GB |
| Disk | 50 GB SSD | 200 GB SSD |

> EfficientNet-B3 + BERT loading requires ~2 GB RAM; CPU inference ~1.2s/image.

#### Installation (Linux)

```bash
# 1. Install system dependencies
sudo apt update && sudo apt install -y python3.10 python3.10-venv sqlite3

# 2. Backend
cd backend
python3.10 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 3. Place model weights
#    - checkpoints/best_single_fold3.pth (EfficientNet-B3 + fusion + classifier EMA)
#    - models/nlp_corom_sentence-embedding_chinese-base-medical/ (Alibaba Medical BERT)

# 4. Initialize database + admin
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password "YourSecurePassword"

# 5. Build frontend
cd ../frontend && npm install && npm run build

# 6. Start
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL_CKPT_PATH` | `checkpoints/best_single_fold3.pth` | V2 model weights path |
| `BERT_PATH` | `models/nlp_corom_sentence-embedding_chinese-base-medical` | Alibaba Medical BERT path |
| `MAX_IMAGES_PER_CASE` | `30` | Max images per single case |
| `AGGREGATION_STRATEGY` | `mean` | Strategy: `mean` / `max_severity` / `majority_vote` |
| `LOG_FORMAT` | `console` | Log format: `json` (production) / `console` |
| `COOKIE_SECURE` | `false` | Set `true` for HTTPS |
| `SESSION_LIFETIME_HOURS` | `8` | Session lifetime |

### 2.2 Daily Usage

#### Single-Case Inference

1. Select **Exam Method** from dropdown (default: Transvaginal 3D Ultrasound)
2. Upload 1~30 ultrasound images
3. (Optional) Enter patient number and clinical findings text
4. Click "Submit"
5. Wait for inference (~1.2s/image), then view:
   - Patient-level aggregated diagnosis (probability distribution + final class)
   - Per-image prediction + Grad-CAM heatmap

#### Batch Inference

Upload a ZIP containing `manifest.csv` (columns: `patient_no, clinical_text`, optional column `check_project`) and subdirectories named by `patient_no` with images inside.

### 2.3 API Quick Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/predict` | Single-case (Form: images, clinical_text, check_project, patient_no) |
| POST | `/api/predict/batch` | Batch inference (ZIP) |
| GET | `/api/tasks/{task_id}` | Query task status |
| GET | `/api/cases` | Case list |
| GET | `/api/cases/{case_id}` | Case detail |
| GET | `/api/cases/{case_id}/report.pdf` | PDF report |
| GET | `/api/health` | Health check |

---

## 3. Deployment & Operations

### 3.1 Service Management

```bash
sudo systemctl status ultrasound
sudo systemctl restart ultrasound
journalctl -u ultrasound -f
curl -sS http://127.0.0.1:8000/api/health | jq
```

### 3.2 Backup

```bash
# Daily at 3 AM (cron)
0 3 * * * /opt/ultrasound/backend/scripts/backup.sh
```

Backs up: SQLite hot backup (`.backup` command) + uploads incremental rsync, 30-day retention.

### 3.3 Troubleshooting

| Symptom | Action |
|---------|--------|
| `model_loaded: false` | Check `MODEL_CKPT_PATH` / `BERT_PATH` files exist and are readable |
| Abnormal predictions | Confirm EMA weights, RGB channel order, BERT CLS without L2 norm |
| Slow inference / P95 spike | Check if batch job is occupying queue, CPU saturation |
| SQLite lock | Restart service; WAL + busy_timeout=5000 handles normal concurrency |

### 3.4 Upgrade Procedure

```bash
sudo systemctl stop ultrasound
/opt/ultrasound/backend/scripts/backup.sh
cd /opt/ultrasound && git pull
cd backend && source venv/bin/activate && pip install -r requirements.txt
cd ../frontend && npm install && npm run build
sudo systemctl start ultrasound
```

Schema migrations are handled automatically by `init_schema()` via `_ensure_legacy_columns()`.

---

## License

This project is for internal hospital use only. Not for commercial use. Model predictions are for reference only and do not constitute clinical diagnosis. Final diagnosis should be made by a licensed physician.
