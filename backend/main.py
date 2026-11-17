import asyncio
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Clean architecture imports: Models, Services, Routes
from src.models import (
    ClearRequest,
    DocumentQueryRequest,
    GoogleAuthRequest,
    HistorySyncRequest,
    LeetCodeManualStats,
    QueryRequest,
    QuizRequest,
    ResumeScoreRequest,
)
from src.rag_search import RAGSearch
from src.routes import (
    auth_router,
    document_router,
    integrations_router,
    query_router,
)
from src.routes.document import (
    delete_document_session,
    generate_quiz,
    query_document,
    query_document_stream,
    score_resume,
    upload_pdf,
)
from src.routes.integrations import (
    delete_leetcode_manual_stats,
    github_callback,
    github_connect,
    github_dashboard,
    github_disconnect,
    leetcode_manual_stats,
    save_leetcode_manual_stats,
)
from src.routes.query import (
    clear_history,
    get_my_history,
    get_user_history,
    query,
    query_stream,
    sync_user_history,
)
from src.services import (
    MAX_DOCUMENT_SESSIONS,
    MAX_UPLOAD_BYTES,
    SESSION_TTL,
    _delete_integration_fields,
    _github_api,
    _github_contributions,
    _github_redirect,
    _integration_doc,
    _save_integration_doc,
    _token_cipher,
    assert_document_access,
    chat_collection,
    cleanup_expired_sessions,
    close_db,
    db,
    document_chat_histories,
    document_lock,
    document_sessions,
    enforce_rate_limit,
    github_oauth_states,
    google_user_from_request,
    init_db,
    integration_collection,
    integration_lock,
    integration_records,
    make_sse_generator,
    mongo_client,
    session_cleanup_loop,
    verify_google_token,
)
from src.services.rate_limiter import RATE_LIMITS, rate_lock, rate_windows

rag: RAGSearch | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag
    rag = RAGSearch()

    # Initialize MongoDB
    init_db()

    # Ephemeral session cleanup loop
    cleanup_task = asyncio.create_task(session_cleanup_loop(lambda: rag))
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        close_db()


app = FastAPI(
    title="Placement-Prep Backend API",
    description="RAG-powered Campus Placement Preparation & Engineering Tracking System",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS Configuration ─────────────────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "https://placement-prep-rag.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
]
ALLOWED_ORIGINS.extend(
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip() and origin.strip() not in ALLOWED_ORIGINS
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-Document-Token"],
)


# ── Global Exception Handlers (Always include CORS headers on errors) ─────────
def _get_cors_headers(request: Request) -> dict:
    origin = request.headers.get("origin", "")
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Document-Token",
        }
    return {}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = _get_cors_headers(request)
    if exc.headers:
        headers.update(exc.headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[ERROR] Uncaught exception on {request.method} {request.url.path}: {exc}")
    headers = _get_cors_headers(request)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


# ── Health Endpoint ────────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok", "service": "placement-prep-api", "version": "2.0.0"}


# ── Mount Modular Routers ──────────────────────────────────────────────────────
app.include_router(query_router)
app.include_router(document_router)
app.include_router(auth_router)
app.include_router(integrations_router)
