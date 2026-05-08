from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import CORS_ORIGINS, FORCE_HTTPS_REDIRECT, HSTS_ENABLED
from app.errors import BusinessError
from app.middleware import MetricsMiddleware, RequestIdMiddleware
from app.models.db import init_schema
from app.utils.logging import configure_logging, get_logger
from app.api import (
    health,
    predict,
    batch,
    cases,
    reports,
    tasks,
    auth as auth_api,
    admin,
    metrics,
)

configure_logging()
logger = get_logger("app.main")

init_schema()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.inference import inferencer
    from app.services.inference_queue import queue
    from app.services.batch_pipeline import resume_incomplete_batches

    logger.info("startup.model_loading")
    try:
        inferencer.ensure_loaded()
        logger.info("startup.model_loaded", model_version=inferencer.model_version)
    except Exception as exc:
        logger.exception("startup.model_load_failed", error=str(exc))
    queue.start()
    logger.info("startup.queue_worker_started")
    stale = resume_incomplete_batches()
    if stale:
        logger.warning("startup.stale_batches_marked_failed", count=stale)
    try:
        yield
    finally:
        queue.stop()
        logger.info("shutdown.queue_worker_stopped")


app = FastAPI(
    title="子宫超声辅助诊断系统",
    description="Uterine Ultrasound AI-Assisted Diagnosis System",
    version="1.0.0",
    lifespan=lifespan,
)

# Middleware order: outermost first. RequestId binds the log context, so it
# must wrap everything that logs. CORS is last so preflight 204s include it.
app.add_middleware(MetricsMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    if FORCE_HTTPS_REDIRECT and request.url.scheme == "http":
        return RedirectResponse(
            str(request.url).replace("http://", "https://", 1),
            status_code=301,
        )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    if HSTS_ENABLED:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(BusinessError)
async def _business_error_handler(_request: Request, exc: BusinessError):
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(
        "unhandled_exception",
        path=str(request.url.path),
        method=request.method,
        error=str(exc),
    )
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "服务器内部错误"}},
    )


app.include_router(health.router, prefix="/api")
app.include_router(auth_api.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(batch.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
