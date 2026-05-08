"""GET /api/tasks/{task_id} — poll inference task status."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.models.db import User
from app.models.schemas import TaskStatusResponse
from app.services import auth
from app.services.inference_queue import queue

router = APIRouter()


@router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task(task_id: str, _user: User = Depends(auth.require_user)):
    snap = queue.status_snapshot(task_id)
    if snap is None:
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "NOT_FOUND", "message": f"Task {task_id} not found."}},
        )
    rec = queue.get(task_id)
    return TaskStatusResponse(
        task_id=snap["task_id"],
        kind=snap["kind"],
        status=snap["status"],
        priority=snap["priority"],
        queue_position=snap.get("queue_position"),
        estimated_wait_ms=snap.get("estimated_wait_ms"),
        error=snap.get("error"),
        case_id=rec.case_id if rec else None,
    )
