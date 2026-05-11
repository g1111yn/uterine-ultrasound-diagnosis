# Uterine Ultrasound AI-Assisted Diagnosis System

> AI-powered uterine ultrasound diagnosis assistant for clinical use.

[中文版本](README.md)

---

## 1. Project Introduction

### 1.1 Overview

The Uterine Ultrasound AI-Assisted Diagnosis System is an AI-powered clinical decision support tool for gynecological ultrasound examinations. The system accepts ultrasound images (JPEG / PNG / BMP / TIFF / DICOM), runs inference through a deep learning model (ResNet18 + BERT-Chinese multimodal fusion), and outputs prediction probabilities for three categories: **Normal, Endometrial Cancer, and Polyp**.

The system supports **single-case inference** (a doctor uploads one or more images; the system runs per-image inference and aggregates them into a patient-level diagnosis) and **batch inference** (upload dozens to hundreds of patients via ZIP; asynchronous execution with automatic queuing).

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| **Patient-level Inference** | A single patient can have multiple ultrasound images. Each image is independently inferred, then aggregated via pluggable strategies (mean / max severity / majority vote) into a patient-level diagnosis. |
| **Priority Inference Queue** | Single-case tasks (priority=0) preempt batch tasks (priority=5). Doctor single-case operations are never blocked by batch jobs. |
| **Async Task Model** | Returns 202 + task_id immediately after submission. Frontend polls task status until completion. |
| **Idempotent Submission** | `idempotency_key` ensures duplicate submissions do not create duplicate cases. |
| **bcrypt Auth + Session Management** | bcrypt password hashing, HttpOnly + SameSite session cookies, consecutive failure lockout, forced password change. |
| **Audit Logging** | Full recording of login/logout/case creation/user management operations with CSV export support. |
| **Admin Role** | User management, audit log querying, system statistics with role-based access control. |
| **DICOM Support** | Auto-detection of DICOM files with window width/level adjustment and RGB preview conversion. |
| **MIME Sniffing** | Upload-time file type checking via magic bytes. Rejects files with mismatched extensions. |
| **Grad-CAM Visualization** | Generates Grad-CAM heatmaps from the last ResNet18 layer to help doctors understand model focus areas. |
| **Structured Logging** | structlog JSON output with request_id end-to-end tracing. Ready for ELK integration in production. |
| **PDF Reports** | Chinese PDF diagnosis reports generated with reportlab using STSong-Light font. |
| **ErrorBoundary** | Frontend global error capture with copy-error-info and reload buttons on render crashes. |

### 1.3 Tech Stack

**Backend**
- Python 3.10 + FastAPI + Uvicorn
- SQLAlchemy 2.x + SQLite (WAL mode)
- PyTorch (CPU inference) + torchvision + Transformers
- bcrypt + structlog + reportlab + pydicom

**Frontend**
- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4 + lucide-react
- React Router 6 + React Query (TanStack) + Zustand
- Axios

**Deployment**
- Linux: systemd service + Nginx reverse proxy (optional HTTPS)
- Windows: NSSM service management
- Docker supported (build your own)

### 1.4 Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── predict.py    # POST /api/predict (single-case inference)
│   │   │   ├── batch.py      # POST /api/predict/batch (batch inference)
│   │   │   ├── tasks.py      # GET  /api/tasks/{id}
│   │   │   ├── cases.py      # Case listing + image serving
│   │   │   ├── auth.py       # Login / Logout / Change password
│   │   │   ├── admin.py      # User management + audit logs + CSV export
│   │   │   ├── metrics.py    # System metrics
│   │   │   ├── health.py     # Health check
│   │   │   └── reports.py    # PDF report generation
│   │   ├── models/
│   │   │   ├── db.py         # SQLAlchemy models (11 tables)
│   │   │   └── schemas.py    # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── inference.py        # Model inference wrapper
│   │   │   ├── inference_queue.py  # Priority inference queue
│   │   │   ├── aggregation.py      # Aggregation strategies
│   │   │   ├── auth.py             # bcrypt + session management
│   │   │   ├── audit.py            # Audit logging
│   │   │   ├── batch_pipeline.py   # Batch job pipeline
│   │   │   ├── gradcam.py          # Grad-CAM generation
│   │   │   └── report_pdf.py       # PDF reports
│   │   ├── middleware.py     # RequestId + Metrics middleware
│   │   ├── errors.py         # Business error classes
│   │   ├── config.py         # Environment variable configuration
│   │   └── main.py           # FastAPI application entry point
│   ├── scripts/
│   │   ├── init_db.py        # Database initialization
│   │   ├── init_admin.py     # Admin user creation/reset
│   │   └── backup.sh         # Backup script
│   ├── tests/
│   │   └── loadtest.py       # Load testing
│   ├── deploy/
│   │   ├── ultrasound.service  # systemd unit file
│   │   └── nssm-install.md     # Windows NSSM deployment
│   ├── checkpoints/           # Model weights (.gitignore)
│   ├── data/                  # Runtime data (.gitignore)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── auth/             # AuthContext + ProtectedRoute
│   │   ├── components/       # Shared components
│   │   ├── pages/            # Pages
│   │   │   ├── Login.tsx           # Login page
│   │   │   ├── Predict.tsx         # Single-case inference page
│   │   │   ├── Batch.tsx           # Batch inference page
│   │   │   ├── History.tsx         # History records
│   │   │   ├── CaseDetail.tsx      # Case detail (multi-image switcher)
│   │   │   ├── ChangePassword.tsx  # Change password
│   │   │   ├── Settings.tsx        # Settings
│   │   │   └── admin/              # Admin pages
│   │   │       ├── Users.tsx       # User management
│   │   │       ├── AuditLogs.tsx   # Audit logs
│   │   │       └── Stats.tsx       # System statistics
│   │   └── main.tsx
│   └── package.json
├── docs/
│   ├── deployment.md         # Deployment documentation
│   └── runbook.md            # Operations runbook
└── README_EN.md
```

---

## 2. User Manual

### 2.1 Initial Deployment

#### 2.1.1 Hardware Requirements

| Scenario | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8 cores+ |
| RAM | 8 GB | 16 GB |
| Disk | 50 GB SSD | 200 GB SSD |
| Network | 100 Mbps | 1 Gbps |

> Inference uses CPU. First-time BERT + ResNet18 loading requires approximately 1.2 GB RAM.

#### 2.1.2 Software Requirements

- Python 3.10+
- Node.js 18+ (frontend build)
- SQLite 3.35+ (WAL mode)
- rsync (backup scripts)

#### 2.1.3 Installation Steps (Linux)

```bash
# 1. Install system dependencies
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3-pip \
  sqlite3 rsync libjpeg-dev libpng-dev

# 2. Create system user
sudo useradd -r -s /bin/bash -m -d /opt/ultrasound ultrasound
sudo -u ultrasound mkdir -p /opt/ultrasound

# 3. Clone repository (scp or git clone)
cd /opt/ultrasound
git clone <repository-url> .
sudo chown -R ultrasound:ultrasound /opt/ultrasound

# 4. Create Python virtual environment and install dependencies
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  python3.10 -m venv venv
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
'

# 5. Place model weights
# Copy bert-base_fold1_best.pth to backend/checkpoints/
# Copy bert-base-chinese directory to backend/models/bert/
# Or specify paths via MODEL_CKPT_PATH / BERT_PATH environment variables

# 6. Initialize database + create admin user
sudo -u ultrasound bash -lc '
  cd /opt/ultrasound/backend
  source venv/bin/activate
  python scripts/init_db.py
  python scripts/init_admin.py --user-id admin --password "YourSecurePassword"
'

# 7. Build frontend
cd /opt/ultrasound/frontend
sudo -u ultrasound bash -lc 'npm install && npm run build'

# 8. Install systemd service
sudo cp /opt/ultrasound/backend/deploy/ultrasound.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ultrasound

# 9. Verify
sudo systemctl status ultrasound
curl -s http://127.0.0.1:8000/api/health | python3 -m json.tool
```

#### 2.1.4 Installation Steps (Windows)

See `backend/deploy/nssm-install.md` for NSSM service registration.

```cmd
REM 1. Create Python virtual environment
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

REM 2. Initialize database + admin
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password "YourSecurePassword"

REM 3. Build frontend
cd ..\frontend
npm install
npm run build

REM 4. Register service with NSSM (see nssm-install.md)
```

#### 2.1.5 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `8000` | Listen port |
| `LOG_FORMAT` | `console` | Log format: `json` (recommended for production) / `console` |
| `LOG_LEVEL` | `INFO` | Log level |
| `MODEL_CKPT_PATH` | `~/Documents/...` | Model weights path |
| `BERT_PATH` | `~/Documents/...` | BERT model path |
| `AGGREGATION_STRATEGY` | `mean` | Aggregation strategy: `mean` / `max_severity` / `majority_vote` |
| `MAX_IMAGES_PER_CASE` | `10` | Max images per single case |
| `MAX_IMAGE_BYTES` | `52428800` (50MB) | Max single image size |
| `COOKIE_SECURE` | `false` | Set to `true` for HTTPS |
| `COOKIE_SAMESITE` | `lax` | Cookie SameSite policy |
| `SESSION_LIFETIME_HOURS` | `8` | Session lifetime (hours) |
| `LOGIN_FAILURE_LIMIT` | `5` | Consecutive failure lockout threshold |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Lockout duration (minutes) |
| `PASSWORD_MIN_LENGTH` | `8` | Minimum password length |
| `HSTS_ENABLED` | `false` | Enable for HTTPS |
| `FORCE_HTTPS_REDIRECT` | `false` | Force HTTP -> HTTPS redirect |
| `BATCH_MAX_UNCOMPRESSED_BYTES` | `524288000` (500MB) | Batch ZIP extraction limit |
| `BATCH_MAX_IMAGES_PER_PATIENT` | `20` | Max images per patient in batch |
| `MAX_ACTIVE_BATCHES_PER_USER` | `1` | Max concurrent batch jobs per user |
| `MAX_PENDING_BATCHES_GLOBAL` | `10` | Max global pending batch jobs |

### 2.2 Daily Operations

#### 2.2.1 Login

1. Navigate to `http://<server-IP>:8000/`
2. Enter your employee ID and password
3. After first login with admin account, change the password immediately

#### 2.2.2 Single-Case Inference

1. On the "Single-Case Inference" page, upload one or more ultrasound images
2. (Optional) Enter patient number and clinical description
3. Click "Submit". The system returns a task ID and automatically polls status
4. After inference completes, the following is displayed:
   - **Overall Diagnosis**: Aggregated prediction probabilities (Normal / Endometrial Cancer / Polyp)
   - **Per-Image Analysis**: Independent prediction + Grad-CAM heatmap for each image
   - Switch between images in the detail view to examine per-image Grad-CAM visualizations

#### 2.2.3 Batch Inference

1. On the "Batch Inference" page, upload a ZIP file
2. ZIP structure:
   ```
   PatientID/
   ├── image1.jpg
   ├── image2.png
   └── ...
   AnotherPatient/
   └── scan.dcm
   ```
3. (Optional) Provide a `manifest.csv` to specify clinical descriptions for each patient
4. After submission, the system infers patient-by-patient in the background. View progress or cancel at any time.
5. New single-case tasks preempt queued batch jobs for priority execution

#### 2.2.4 History Records and Case Detail

1. The "History" page lists all cases in reverse chronological order
2. Click any case to enter the detail page
3. The detail page includes:
   - Patient information (patient number, clinical description)
   - Aggregated diagnosis result
   - Multi-image switcher + per-image Grad-CAM
   - Doctor judgment form (record final diagnosis opinion in the detail view)

#### 2.2.5 Admin Features

Only users with `admin` role can see the "Admin" menu in the top navigation:

- **User Management** (`/admin/users`): Create / edit / disable users, reset passwords
- **Audit Logs** (`/admin/audit-logs`): View system operation records, export to CSV
- **System Statistics** (`/admin/stats`): View inference latency, queue length, error rates, and other metrics

#### 2.2.6 Change Password

Click the username in the top-right corner -> "Change Password". Current password is required.

### 2.3 API Quick Reference

All authenticated endpoints use session cookie authentication.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Login | No |
| POST | `/api/auth/logout` | Logout | Yes |
| GET | `/api/auth/me` | Current user info | Yes |
| POST | `/api/auth/change-password` | Change password | Yes |
| POST | `/api/predict` | Single-case inference (multi-image) | Yes |
| POST | `/api/predict/batch` | Batch inference (ZIP) | Yes |
| GET | `/api/tasks/{task_id}` | Query task status | Yes |
| GET | `/api/cases` | Case list | Yes |
| GET | `/api/cases/{case_id}` | Case detail | Yes |
| POST | `/api/cases/{case_id}/judgment` | Record doctor judgment | Yes |
| GET | `/api/images/{image_id}/original` | Original image | Yes |
| GET | `/api/images/{image_id}/gradcam` | Grad-CAM heatmap | Yes |
| GET | `/api/reports/{case_id}` | PDF report | Yes |
| GET | `/api/health` | Health check | No |
| GET | `/api/metrics` | System metrics | admin |
| GET | `/api/admin/users` | User list | admin |
| POST | `/api/admin/users` | Create user | admin |
| PATCH | `/api/admin/users/{user_id}` | Edit user | admin |
| DELETE | `/api/admin/users/{user_id}` | Delete user | admin |
| GET | `/api/admin/audit-logs` | Audit logs | admin |
| GET | `/api/admin/audit-logs/export` | CSV export | admin |

### 2.4 Aggregation Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `mean` (default) | Average probabilities across all images | General-purpose, robust results |
| `max_severity` | If any image's cancer probability >= threshold, label as cancer; otherwise fall back to mean | Prefer false positives over false negatives |
| `majority_vote` | Majority vote across images | When image quality varies significantly |

Switch via `AGGREGATION_STRATEGY` environment variable or per-request parameter.

---

## 3. Deployment & Operations

### 3.1 Service Management

```bash
# Check service status
systemctl status ultrasound

# View real-time logs
journalctl -u ultrasound -f

# Restart service
sudo systemctl restart ultrasound

# Stop service
sudo systemctl stop ultrasound

# Health check
curl -sS http://127.0.0.1:8000/api/health | jq
```

### 3.2 Logging

#### 3.2.1 Log Format

For production, use JSON format (`LOG_FORMAT=json`). Each log entry contains:

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

#### 3.2.2 Log Event Types

| Event | Description |
|-------|-------------|
| `startup.model_loaded` | Model loaded successfully |
| `startup.model_load_failed` | Model loading failed; service runs but all inferences fail |
| `response.5xx` | 5xx response (with path / method / request_id) |
| `unhandled_exception` | Unexpected exception (stack trace logged) |
| `audit.xxx` | Audit event (login/logout/user creation, etc.) |

All logs include `request_id` for end-to-end request tracing.

#### 3.2.3 Viewing Logs

```bash
# Last 200 lines
journalctl -u ultrasound -n 200 --no-pager

# Filter by request_id
journalctl -u ultrasound | grep '"request_id":"a1b2c3d4"'

# Errors only
journalctl -u ultrasound -p err
```

### 3.3 Backup

#### 3.3.1 Automatic Backup

`backend/scripts/backup.sh` performs:
- SQLite `.backup` (online hot backup, no database lock)
- uploads directory incremental rsync
- 30-day retention

**Set up cron job** (daily at 3:00 AM):

```bash
crontab -e
# Add:
0 3 * * * /opt/ultrasound/backend/scripts/backup.sh >> /var/log/ultrasound-backup.log 2>&1
```

#### 3.3.2 Recovery

```bash
# Copy database from backup
cp /mnt/nas/backups/ultrasound/app-20260501-030000.db /opt/ultrasound/backend/data/app.db

# Sync uploaded files
rsync -a /mnt/nas/backups/ultrasound/uploads-latest/ /opt/ultrasound/backend/data/uploads/

# Restart service
sudo systemctl restart ultrasound

# Verify: login + check history + check individual case detail
curl -sS http://127.0.0.1:8000/api/health
```

> **Perform a recovery drill monthly** to ensure backups are valid.

### 3.4 Load Testing

```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python tests/loadtest.py \
  --base-url http://127.0.0.1:8000 \
  --user-id admin --password 'YourPassword' \
  --concurrency 10 --total 30 \
  --image /path/to/sample.jpg
```

Outputs P50 / P95 / P99 latency and error counts. Expected CPU inference P95 < 5 seconds.

### 3.5 HTTPS Deployment

Use Nginx as TLS termination reverse proxy:

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

After deployment, update environment variables:
```bash
COOKIE_SECURE=true
HSTS_ENABLED=true
FORCE_HTTPS_REDIRECT=true
```

### 3.6 Troubleshooting

#### Service Down / Cannot Access Homepage

```bash
systemctl status ultrasound                    # Check if active
journalctl -u ultrasound -n 200 --no-pager    # Check recent logs
curl http://127.0.0.1:8000/api/health          # Health check
```

- `model_loaded: false` -> Check that `MODEL_CKPT_PATH` / `BERT_PATH` files exist and are readable
- Service not running -> `sudo systemctl restart ultrasound`

#### SQLite Lock / Slow Writes

```bash
lsof backend/data/app.db    # Check who holds the database
```

- Long transaction causing WAL bloat -> Restart service to release locks (extreme cases only)
- WAL + `busy_timeout=5000` handles concurrency in normal operation

#### Disk Full

```bash
du -sh /opt/ultrasound/backend/data/*
```

Resolution order:
1. Run `backup.sh` to archive old data
2. Delete `uploads/YYYY/MM/DD/` subdirectories older than 30 days (**confirm backup first**)
3. Use `PRAGMA wal_checkpoint(TRUNCATE)` to compact WAL

#### Inference Slow / P95 Latency Spike

1. `curl http://127.0.0.1:8000/api/metrics` (admin cookie) to check latency and queue length
2. Batch job running? Let it finish first
3. CPU maxed out? Consider limiting concurrency (`MAX_PENDING_BATCHES_GLOBAL`) or upgrading hardware
4. BERT cache invalidated? After first load, avg should be ~80ms. If significantly slower, the model is being swapped out — check memory.

#### Forgotten Admin Password

If at least one admin account is available:
```bash
# Login with another admin and reset via admin page
PATCH /api/admin/users/<user_id>  { "new_password": "..." }
```

If all admin accounts are lost:
```bash
cd /opt/ultrasound/backend
source venv/bin/activate
python scripts/init_admin.py --user-id admin --password 'NewAdminPass#2026' --reset
```

### 3.7 Upgrade Procedure

```bash
# 1. Stop service
sudo systemctl stop ultrasound

# 2. Backup
/opt/ultrasound/backend/scripts/backup.sh

# 3. Update code
cd /opt/ultrasound
git pull

# 4. Update dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt

# 5. Run migration if schema changed (V2 will integrate Alembic)

# 6. Rebuild frontend
cd ../frontend
npm install && npm run build

# 7. Start service
sudo systemctl start ultrasound
systemctl status ultrasound
journalctl -u ultrasound -f
```

### 3.8 Database Schema

The system uses SQLite with 11 tables:

| Table | Description |
|-------|-------------|
| `users` | Users (employee ID, name, department, role, password hash) |
| `sessions` | Sessions |
| `login_attempts` | Login attempts (for brute-force protection) |
| `audit_logs` | Audit logs |
| `cases` | Cases (one case per patient) |
| `case_images` | Case images (one case can have multiple images) |
| `per_image_predictions` | Per-image inference results |
| `predictions` | Aggregated patient-level diagnosis |
| `judgments` | Doctor judgments |
| `batch_jobs` | Batch jobs |
| `idempotency_records` | Idempotency records (24h expiry) |

---

## License

This project is for internal hospital use only. Not for commercial use. Model predictions are for reference only and do not constitute clinical diagnosis. Final diagnosis should be made by a licensed physician.

---

## Contact

For issues, please contact the IT department.
