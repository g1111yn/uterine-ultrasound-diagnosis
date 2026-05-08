"""Business-domain exceptions.

Raised anywhere in the request path; caught by the global exception handler
registered in ``app.main`` and rendered as a uniform JSON error body:

    {"error": {"code": "...", "message": "..."}}

Any uncaught ``Exception`` is logged with a stack trace and returned as a
generic 500 so internals never leak to clients.
"""
from __future__ import annotations


class BusinessError(Exception):
    """Known, user-facing error.

    ``code`` is a stable machine string (the frontend keys on it),
    ``message`` is a human-readable Chinese sentence, ``status`` is the
    HTTP status to return.
    """

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class NotFoundError(BusinessError):
    def __init__(self, message: str = "资源不存在", code: str = "NOT_FOUND"):
        super().__init__(code=code, message=message, status=404)


class PermissionDeniedError(BusinessError):
    def __init__(self, message: str = "无权访问", code: str = "FORBIDDEN"):
        super().__init__(code=code, message=message, status=403)


class InvalidInputError(BusinessError):
    def __init__(self, message: str = "请求参数无效", code: str = "INVALID_INPUT"):
        super().__init__(code=code, message=message, status=400)
