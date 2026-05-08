import time
from fastapi import APIRouter
from app.models.schemas import HealthResponse
from app.config import MODEL_VERSION
from app.services.inference import inferencer
from app.services.inference_queue import queue

router = APIRouter()

_start_time = time.time()


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        model_version=MODEL_VERSION,
        model_loaded=inferencer.loaded,
        uptime_seconds=int(time.time() - _start_time),
        queue_length=queue.queue_length(),
    )
