# Uterine Ultrasound AI-Assisted Diagnosis System

[中文](README.md)

## System Positioning

This project is a clinical decision-support and research prototype for gynecological ultrasound in hospitals. It accepts multiple ultrasound images and optional clinical text for a patient, produces a patient-level three-class AI-assisted suggestion with probabilities and Grad-CAM heatmaps, and requires a physician to review the evidence and actively save a final judgment in the workbench.

The system is not an autonomous diagnostic device and does not replace physician review, differential diagnosis, or an established hospital care pathway. Model output is supporting information only; a licensed physician remains responsible for the final judgment and subsequent care.

## Clinical Workflow

### Single-Case Clinical Workbench

A physician enters a patient number, examination method, and findings, and may upload 1 to 30 images, with a maximum of 50 MB per file. The system asynchronously performs per-image inference and patient-level aggregation. The case detail uses a three-column workbench: case and examination information on the left, original/Grad-CAM image review in the center, and the AI-assisted suggestion alongside the physician final judgment on the right.

### Batch Inference and Continuous Diagnosis

After a physician uploads a multi-patient ZIP, the backend processes patients serially; single-case work can enter the inference queue between batch images at higher priority. The batch detail keeps the patient queue and case workbench on one page. It provides All / Unjudged / Judged / Inference failed filters plus Save judgment and Save and next patient actions. Patients with pending inference or failed inference are not diagnosable and cannot have a physician judgment saved.

### Physician Judgment and Responsibility

The model classes are fixed to `normal`, `polyp`, and `endometrial_cancer`. A physician does not passively accept model output: they must actively select and save one of `normal`, `polyp`, `endometrial_cancer`, or `indeterminate` (indeterminate / further examination required), and may add a care recommendation and note.

When updating an existing judgment, the client submits its `expected_judged_at` timestamp. If another physician has already changed the record, the service returns `JUDGMENT_CONFLICT`; the local edit is retained, and the physician should refresh, review the latest judgment, and retry. This is timestamp-based optimistic concurrency control, not case locking.

## Model and Inference

- Image encoder: EfficientNet-B3; images are resized to 300 x 300 and ImageNet-normalized.
- Text encoder: Alibaba Chinese medical BERT, `nlp_corom_sentence-embedding_chinese-base-medical`, using its CLS vector; examination method and findings are cleaned with training-aligned rules and concatenated.
- Multimodal fusion: image-dominant gated fusion; a zero text vector is used when no text is supplied.
- Patient-level output: per-image three-class probabilities are aggregated into the patient suggestion. The default strategy is `mean`; `max_severity` and `majority_vote` are also implemented.
- Explainability: Grad-CAM overlays are generated from the final EfficientNet-B3 convolutional layer for per-image predictions.
- Runtime: the current inferencer runs on CPU. The model checkpoint and BERT directory are not distributed with the repository and must be supplied by the deployer.

The model covers only its three training-defined classes and does not rule out other uterine or adnexal disease. Research evaluation should independently validate calibration, subgroup performance, failure cases, and distribution shift in the target hospital population; UI confidence must not be treated as a substitute for clinical performance evidence.

## Feature Overview

| Area | Current capability |
| --- | --- |
| Single case | Multi-image upload, asynchronous task status, patient aggregation, three-column clinical workbench |
| Batch work | ZIP validation, progress and history, cancellation, patient queue, continuous inline diagnosis |
| Physician review | Four-class final judgment, recommendation, notes, Save/Save and next, unsaved-edit protection, judgment conflict detection |
| Image review and output | Original image, browser preview for DICOM, per-image probabilities, Grad-CAM, Chinese PDF report |
| Search | Cases by keyword, date, model class, physician, and single/batch source |
| Administration | Physician/admin accounts, session authentication, login lockout, audit log and CSV export, health and metrics endpoints |

Supported image formats are JPG, JPEG, PNG, BMP, TIF, TIFF, and DICOM (`.dcm`). A single case accepts up to 30 images at 50 MB per image. A batch accepts up to 30 images per patient and at most 500 MB total after ZIP decompression.

## Technical Architecture

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

FastAPI provides authentication, case, batch, judgment, reporting, and operations endpoints. The inference queue prioritizes single-case image tasks over batch image tasks. SQLite stores business records, while uploads and derived images live in the local data directory. The frontend uses React Router and TanStack Query for routing, server state, polling, and judgment-version refreshes.

See the [backend guide](backend/README.md) and [frontend guide](frontend/README.md) for development details.

## Quick Start

Python 3.10+, Node.js/npm, and the following local model files are required. `MODEL_CKPT_PATH` and `BERT_PATH` may point to other locations instead:

```text
backend/checkpoints/best_single_fold3.pth
backend/models/nlp_corom_sentence-embedding_chinese-base-medical/
```

Start the backend and create a development administrator:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scripts/init_db.py
python scripts/init_admin.py --user-id admin --password 'ChangeMe#2026'
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal, start the frontend. Vite proxies `/api` to `http://localhost:8000` by default:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and change the initial password immediately after first login. FastAPI's interactive documentation is at `http://localhost:8000/docs`. If model files are missing, the service can still start, but health reports that the model is not loaded and inference tasks cannot succeed.

## Batch ZIP Format

The ZIP root must directly contain a UTF-8 `manifest.csv` with `patient_no` and `clinical_text` columns; `check_project` is optional. Each patient directory must be a direct child of the ZIP root, and its name must match the corresponding `patient_no` **exactly**.

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
P0001,Anteverted uterus with a hyperechoic intrauterine lesion,Transvaginal 3D ultrasound
P0002,Endometrium approximately 0.8 cm thick,
```

Do not wrap all of this content in an extra top-level folder. For example, `batch/manifest.csv` leaves no manifest at the ZIP root. Patient directories not listed in the manifest, manifest rows without an exactly named directory, and unsupported files are skipped or reported as validation diagnostics. At most 30 supported images are processed per patient, and all decompressed content together must not exceed 500 MB.

## Tests and Quality Checks

The backend uses standard-library `unittest`, and the frontend uses Vitest. These commands match the repository's current test entry points:

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

Current tests focus on clinical workflows, batch status and filters, judgment concurrency conflicts, unsaved-edit protection, upload interactions, and API behavior. Model performance, DICOM device variation, and hospital network validation still require approved data and the target deployment environment.

## API Overview

Except for login and health, business endpoints require a valid session. Use the running `/docs` page and the [backend guide](backend/README.md) as the complete request/response reference.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Log in and establish a session |
| `GET` | `/api/health` | Check service, model, and queue health |
| `POST` | `/api/predict` | Submit single-case multi-image inference |
| `GET` | `/api/tasks/{task_id}` | Read single-case task status |
| `POST` | `/api/predict/batch` | Upload a batch ZIP |
| `GET` | `/api/batch` | List batch history |
| `GET` | `/api/batch/{job_id}` | Read batch progress and patient results |
| `POST` | `/api/batch/{job_id}/cancel` | Cancel an eligible batch |
| `GET` | `/api/cases` | Search cases |
| `GET` | `/api/cases/{case_id}` | Read case, image, prediction, and judgment data |
| `POST` | `/api/cases/{case_id}/judgment` | Create or concurrency-safe update a physician judgment |
| `GET` | `/api/images/{image_id}` | Get a browser-viewable image/preview |
| `GET` | `/api/images/{image_id}/original` | Get the original upload |
| `GET` | `/api/images/{image_id}/gradcam` | Get a Grad-CAM image |
| `GET` | `/api/cases/{case_id}/report.pdf` | Export a PDF report |

## Deployment and Operations Links

- [Backend development and service guide](backend/README.md)
- [Frontend development guide](frontend/README.md)
- [Production deployment](docs/deployment.md)
- [On-call and incident runbook](docs/runbook.md)

Production should use a controlled host, an HTTPS reverse proxy, strong passwords, `COOKIE_SECURE=true`, backups, and restore drills. Run health, login, and representative clinical-flow checks after upgrades. The linked documents cover systemd, Nginx, Windows NSSM, backup, and restore commands.

## Data, Security, and Hospital Integration Boundaries

- Current storage is single-host SQLite plus local files, not a shared database or object store for multi-node deployment. The deployer owns disk encryption, backup media, retention, deletion procedures, and access review.
- The system provides password accounts, bcrypt hashes, HttpOnly/SameSite session cookies, failed-login lockout, and audit logs. These controls do not replace hospital identity, endpoint management, network isolation, or security review.
- **Any currently authenticated physician can view cases and batch jobs in the system.** Department isolation, case-owner permissions, and finer-grained authorization are deferred until formal hospital integration, when they must be aligned with organizational roles and least privilege.
- This repository does not implement PACS, HIS, EMR, RIS, or hospital SSO integrations, and it makes no claim of medical-device registration, data-compliance certification, or interoperability conformance. Interface mapping, identity federation, de-identification, consent/ethics approval, and hospital acceptance are deployment-project responsibilities.
- Real patient data must not enter unauthorized development or research environments. Logs, ZIP files, original images, DICOM metadata, PDFs, and backups may all contain sensitive information and require equivalent protection.

## Project Structure

```text
.
├── backend/
│   ├── app/          # FastAPI routes, data models, inference and business services
│   ├── tests/        # Backend clinical-workflow tests
│   ├── scripts/      # Initialization and backup scripts
│   ├── deploy/       # systemd / Windows service configuration
│   └── data/         # Runtime database and files; protect separately in production
├── frontend/
│   └── src/          # React pages, clinical components, API client, and tests
├── docs/             # Deployment, operations, design, and implementation records
├── README.md         # Chinese overview
└── README_EN.md      # English overview
```

## License

The repository currently has no separate open-source license file. Under the project's existing terms, it is for internal hospital use only and not for commercial use. Model output is supporting information, not a clinical diagnosis; a licensed physician makes the final diagnosis.
