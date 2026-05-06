from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS
from app.models.db import Base, engine
from app.api import health, predict, batch, cases, reports

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="子宫超声辅助诊断系统",
    description="Uterine Ultrasound AI-Assisted Diagnosis System",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(batch.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
