"""Structured logging (structlog) configuration.

Two renderers are supported:

- ``console`` (default, dev-friendly): human-readable coloured output with
  timestamps and call-site info.
- ``json``: one JSON object per line for ingestion by log collectors.

Switch via environment variable ``LOG_FORMAT``:

    LOG_FORMAT=json   -> production-style JSON lines
    LOG_FORMAT=console (or unset) -> coloured console output

The request_id context variable is bound by ``RequestIdMiddleware``; when
no middleware has run yet the processor fills in ``"-"`` so logs are never
missing the field.
"""
from __future__ import annotations

import logging
import os
import sys

import structlog
from structlog.contextvars import merge_contextvars


def _ensure_request_id(_logger, _name, event_dict):
    """Fill request_id with '-' if nothing in the context has bound it."""
    if "request_id" not in event_dict:
        event_dict["request_id"] = "-"
    return event_dict


def configure_logging() -> None:
    """Configure both stdlib logging and structlog.

    Safe to call multiple times; subsequent calls reconfigure.
    """
    log_format = (os.getenv("LOG_FORMAT") or "console").strip().lower()
    log_level_name = (os.getenv("LOG_LEVEL") or "INFO").strip().upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    # Reset root handlers so repeated calls (e.g. during reloads) don't
    # stack duplicates.
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    # Shared pre-processors applied to both stdlib-origin and structlog-origin
    # records.
    pre_chain: list = [
        merge_contextvars,
        _ensure_request_id,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.CallsiteParameterAdder(
            parameters=[
                structlog.processors.CallsiteParameter.MODULE,
                structlog.processors.CallsiteParameter.FUNC_NAME,
                structlog.processors.CallsiteParameter.LINENO,
            ]
        ),
    ]

    if log_format == "json":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty())

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=pre_chain,
    )
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(log_level)

    # Keep FastAPI / Uvicorn chatter at INFO or above and route through
    # the same handler via propagation.
    for noisy in ("uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(noisy)
        lg.handlers = []
        lg.propagate = True
        lg.setLevel(log_level)

    structlog.configure(
        processors=pre_chain + [
            structlog.processors.format_exc_info,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    """Module helper so callers can do ``logger = get_logger(__name__)``."""
    return structlog.get_logger(name)
