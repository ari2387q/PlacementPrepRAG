from .auth import router as auth_router
from .document import router as document_router
from .integrations import router as integrations_router
from .query import router as query_router

__all__ = [
    "auth_router",
    "document_router",
    "integrations_router",
    "query_router",
]
