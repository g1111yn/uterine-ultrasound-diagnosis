"""ASGI middlewares: request_id tagging and 5xx counting for /api/metrics.

Kept in a single module to avoid scattering small middlewares.
"""
from __future__ import annotations

import secrets
import threading
from datetime import date, datetime
from typing import Callable

import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp


logger = structlog.get_logger("app.middleware")


_REQUEST_ID_HEADER = "X-Request-Id"


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a request_id to every request.

    Source of truth: incoming ``X-Request-Id`` header; falls back to a new
    8-byte hex token. The id is:

    - Bound to structlog contextvars so every log line during the request
      carries it.
    - Echoed back in the response header.
    - Cleared in a finally block so worker threads don't leak ids between
      requests.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming = request.headers.get(_REQUEST_ID_HEADER, "").strip()
        request_id = incoming or secrets.token_hex(8)
        bind_contextvars(request_id=request_id)
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        finally:
            clear_contextvars()
        response.headers[_REQUEST_ID_HEADER] = request_id
        return response


# -- 5xx metrics counter -----------------------------------------------------


class _FiveXXCounter:
    """Thread-safe in-memory 5xx counter that resets on a date rollover.

    Deliberately not persisted: it's a rough operational signal, not an
    auditing source. Restart / midnight resets are acceptable.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._date = date.today()
        self._count = 0

    def _maybe_roll(self):
        today = date.today()
        if today != self._date:
            self._date = today
            self._count = 0

    def incr(self):
        with self._lock:
            self._maybe_roll()
            self._count += 1

    def snapshot(self) -> int:
        with self._lock:
            self._maybe_roll()
            return self._count


five_xx_counter = _FiveXXCounter()


class MetricsMiddleware(BaseHTTPMiddleware):
    """Increment the 5xx counter for every response with status >= 500.

    Kept separate from RequestIdMiddleware so the two concerns can be
    ordered / disabled independently.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        try:
            if response.status_code >= 500:
                five_xx_counter.incr()
                logger.warning(
                    "response.5xx",
                    status_code=response.status_code,
                    path=str(request.url.path),
                    method=request.method,
                )
        except Exception:  # pragma: no cover - never let metrics kill the req
            pass
        return response
