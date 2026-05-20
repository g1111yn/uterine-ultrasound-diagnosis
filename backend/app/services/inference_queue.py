"""Priority inference queue with a single background worker.

The worker serializes model calls (the model isn't thread-safe) and
polls a priority queue so single-case tasks (priority 0) jump ahead of
batch tasks (priority 5). Task status is held in-memory for fast polls.

An aggregation task represents "combine child per-image results into a
patient-level prediction". It stays dormant until all child per-image
tasks complete, then the last child enqueues it (priority 0 so it runs
immediately). The actual aggregation logic lives in the on_complete
callback supplied by the submitter.
"""
from __future__ import annotations

import heapq
import itertools
import threading
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.services.inference import inferencer, InferenceResult


@dataclass(order=True)
class _PrioritizedItem:
    priority: int
    order: int
    task_id: str = field(compare=False)


@dataclass
class TaskRecord:
    task_id: str
    kind: str  # "per_image" | "aggregation"
    priority: int
    status: str = "queued"  # queued | running | done | failed
    submitted_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    error: Optional[str] = None
    result: Any = None
    case_id: Optional[str] = None
    child_task_ids: list[str] = field(default_factory=list)
    image_bytes_getter: Optional[Callable[[], bytes]] = None
    check_project: str = ""
    check_seen: str = ""
    on_complete: Optional[Callable[["TaskRecord"], None]] = None


class InferenceQueue:
    def __init__(self):
        self._heap: list[_PrioritizedItem] = []
        self._counter = itertools.count()
        self._cv = threading.Condition()
        self._tasks: dict[str, TaskRecord] = {}
        self._worker: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._ema_ms = 2000.0
        self._ema_alpha = 0.3
        # Rolling latency buffer for metrics (per-image inference only).
        self._latency_ms: list[float] = []
        self._latency_capacity = 1000
        self._latency_total = 0
        self._queue_max_today = 0
        self._queue_max_day = None  # date of last reset

    # -- Public API ----------------------------------------------------------

    def start(self):
        if self._worker and self._worker.is_alive():
            return
        self._stop.clear()
        self._worker = threading.Thread(target=self._run, name="inference-worker", daemon=True)
        self._worker.start()

    def stop(self):
        self._stop.set()
        with self._cv:
            self._cv.notify_all()

    def submit_per_image(
        self,
        task_id: str,
        *,
        priority: int,
        image_bytes_getter: Callable[[], bytes],
        check_project: str = "",
        check_seen: str = "",
        on_complete: Optional[Callable[[TaskRecord], None]] = None,
    ) -> TaskRecord:
        rec = TaskRecord(
            task_id=task_id,
            kind="per_image",
            priority=priority,
            image_bytes_getter=image_bytes_getter,
            check_project=check_project,
            check_seen=check_seen,
            on_complete=on_complete,
        )
        self._enqueue(rec, put_on_heap=True)
        return rec

    def submit_aggregation(
        self,
        task_id: str,
        *,
        priority: int,
        case_id: str,
        child_task_ids: list[str],
        on_complete: Optional[Callable[[TaskRecord], None]] = None,
    ) -> TaskRecord:
        """Create an aggregation task record. It is NOT queued until
        ``enqueue_ready_aggregation(task_id)`` is called (typically from the
        last child's on_complete)."""
        rec = TaskRecord(
            task_id=task_id,
            kind="aggregation",
            priority=priority,
            case_id=case_id,
            child_task_ids=list(child_task_ids),
            on_complete=on_complete,
        )
        self._enqueue(rec, put_on_heap=False)
        return rec

    def enqueue_ready_aggregation(self, task_id: str):
        with self._cv:
            rec = self._tasks.get(task_id)
            if not rec or rec.kind != "aggregation" or rec.status != "queued":
                return
            heapq.heappush(
                self._heap,
                _PrioritizedItem(rec.priority, next(self._counter), task_id),
            )
            self._cv.notify()

    def get(self, task_id: str) -> Optional[TaskRecord]:
        with self._cv:
            return self._tasks.get(task_id)

    def status_snapshot(self, task_id: str) -> Optional[dict]:
        with self._cv:
            rec = self._tasks.get(task_id)
            if not rec:
                return None
            position = None
            wait_ms = None
            if rec.status == "queued":
                target = next((it for it in self._heap if it.task_id == task_id), None)
                if target is not None:
                    ahead = sum(
                        1 for it in self._heap
                        if (it.priority, it.order) < (target.priority, target.order)
                    )
                    position = ahead
                    wait_ms = int(ahead * self._ema_ms)
            return {
                "task_id": rec.task_id,
                "kind": rec.kind,
                "status": rec.status,
                "priority": rec.priority,
                "queue_position": position,
                "estimated_wait_ms": wait_ms,
                "error": rec.error,
                "child_task_ids": list(rec.child_task_ids),
            }

    def queue_length(self) -> int:
        with self._cv:
            n = len(self._heap)
            from datetime import date
            today = date.today()
            if self._queue_max_day != today:
                self._queue_max_day = today
                self._queue_max_today = 0
            if n > self._queue_max_today:
                self._queue_max_today = n
            return n

    def _record_latency(self, elapsed_ms: float) -> None:
        with self._cv:
            self._latency_ms.append(elapsed_ms)
            if len(self._latency_ms) > self._latency_capacity:
                del self._latency_ms[: len(self._latency_ms) - self._latency_capacity]
            self._latency_total += 1

    def metrics_snapshot(self) -> dict:
        """Return per-image inference metrics for /api/metrics."""
        from datetime import date
        with self._cv:
            samples = list(self._latency_ms)
            total = self._latency_total
            today = date.today()
            if self._queue_max_day != today:
                self._queue_max_day = today
                self._queue_max_today = len(self._heap)
            queue_len = len(self._heap)
            queue_max = self._queue_max_today
        if not samples:
            return {
                "total_count": total,
                "avg_latency_ms": 0,
                "p95_latency_ms": 0,
                "queue_length": queue_len,
                "queue_max_today": queue_max,
            }
        samples.sort()
        avg = sum(samples) / len(samples)
        p95_idx = max(0, int(round(0.95 * (len(samples) - 1))))
        return {
            "total_count": total,
            "avg_latency_ms": int(avg),
            "p95_latency_ms": int(samples[p95_idx]),
            "queue_length": queue_len,
            "queue_max_today": queue_max,
        }

    # -- Worker loop ---------------------------------------------------------

    def _enqueue(self, rec: TaskRecord, *, put_on_heap: bool):
        with self._cv:
            self._tasks[rec.task_id] = rec
            if put_on_heap:
                heapq.heappush(
                    self._heap,
                    _PrioritizedItem(rec.priority, next(self._counter), rec.task_id),
                )
                self._cv.notify()

    def _pop(self) -> Optional[TaskRecord]:
        with self._cv:
            while not self._stop.is_set() and not self._heap:
                self._cv.wait(timeout=0.5)
            if self._stop.is_set():
                return None
            if not self._heap:
                return None
            item = heapq.heappop(self._heap)
            return self._tasks.get(item.task_id)

    def _run(self):
        while not self._stop.is_set():
            rec = self._pop()
            if rec is None:
                continue
            rec.status = "running"
            rec.started_at = time.time()
            try:
                if rec.kind == "per_image":
                    self._process_per_image(rec)
                elif rec.kind == "aggregation":
                    # Real work is the callback; see on_complete below.
                    pass
                else:
                    raise RuntimeError(f"Unknown task kind: {rec.kind}")
                rec.status = "done"
            except Exception as exc:
                rec.status = "failed"
                rec.error = f"{type(exc).__name__}: {exc}"
                traceback.print_exc()
            finally:
                rec.finished_at = time.time()
                elapsed_ms = (rec.finished_at - (rec.started_at or rec.finished_at)) * 1000.0
                if rec.kind == "per_image" and elapsed_ms > 0 and rec.status == "done":
                    self._ema_ms = self._ema_alpha * elapsed_ms + (1 - self._ema_alpha) * self._ema_ms
                    self._record_latency(elapsed_ms)
                if rec.on_complete:
                    try:
                        rec.on_complete(rec)
                    except Exception:
                        traceback.print_exc()

    def _process_per_image(self, rec: TaskRecord):
        if rec.image_bytes_getter is None:
            raise RuntimeError("Per-image task missing bytes getter.")
        image_bytes = rec.image_bytes_getter()
        result: InferenceResult = inferencer.predict(
            image_bytes,
            check_project=rec.check_project or "",
            check_seen=rec.check_seen or "",
        )
        rec.result = result


queue = InferenceQueue()
