import asyncio
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

# ruff: noqa: B008
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from src.temp_vectorstore import TempDocStore

rag = None
mongo_client = None
db = None
chat_collection = None
integration_collection = None
integration_records: dict[str, dict] = {}
github_oauth_states: dict[str, tuple[str, float]] = {}
integration_lock = threading.RLock()
document_sessions: dict = {}
document_chat_histories: dict = {}
document_lock = threading.RLock()
SESSION_TTL = timedelta(hours=2)
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
RATE_LIMITS = {
    "/auth/google": (10, 60),
    "/query": (30, 60),
    "/query/stream": (20, 60),
    "/upload": (5, 60),
    "/document/query": (30, 60),
    "/document/query/stream": (20, 60),
    "/document/generate-quiz": (10, 60),
    "/integrations/github/connect": (5, 60),
    "/integrations/github/callback": (10, 60),
    "/integrations/github": (20, 60),
    "/integrations/leetcode": (20, 60),
}
rate_windows: dict[tuple[str, str], list[float]] = {}
rate_lock = threading.Lock()
google_token_cache: dict[str, tuple[int, dict]] = {}
google_token_lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag, mongo_client, db, chat_collection, integration_collection
    from src.rag_search import RAGSearch
    rag = RAGSearch()
    
    # Initialize MongoDB
    mongo_uri = os.getenv("MONGODB_URI", "")
    if mongo_uri:
        try:
            from pymongo import MongoClient
            mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
            db = mongo_client["placement_prep"]
            chat_collection = db["chat_history"]
            integration_collection = db["integrations"]
            print("[INFO] Connected to MongoDB")
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR] Failed to connect to MongoDB ({type(e).__name__})")
            mongo_client = None
    else:
        print("[WARN] MONGODB_URI not set. Chat history will not be persisted to MongoDB.")

    cleanup_task = asyncio.create_task(_session_cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        if mongo_client:
            mongo_client.close()


app = FastAPI(lifespan=lifespan)

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
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Document-Token"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler so unhandled exceptions still return CORS headers.
    Without this, a server crash returns a raw 500 with no CORS headers,
    which browsers report as a CORS error — masking the real problem."""
    origin = request.headers.get("origin", "")
    cors_origin = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    route = request.scope.get("route")
    route_path = getattr(route, "path", "unknown route")
    print(f"[ERROR] Request failed ({request.method} {route_path}): {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true",
        },
    )


# Session expiry cleanup
MAX_DOCUMENT_SESSIONS = 50

def cleanup_expired_sessions():
    import gc
    now = datetime.now(UTC)
    with document_lock:
        expired = [sid for sid, data in document_sessions.items() if now - data["created_at"] > SESSION_TTL]
        for sid in expired:
            document_sessions.pop(sid, None)
            if rag and hasattr(rag, "clear_document_history"):
                rag.clear_document_history(sid)

        # If sessions exceed cap, evict oldest to avoid memory accumulation
        if len(document_sessions) > MAX_DOCUMENT_SESSIONS:
            sorted_sessions = sorted(document_sessions.items(), key=lambda item: item[1]["created_at"])
            to_evict = sorted_sessions[:len(document_sessions) - MAX_DOCUMENT_SESSIONS]
            for sid, _ in to_evict:
                document_sessions.pop(sid, None)
                if rag and hasattr(rag, "clear_document_history"):
                    rag.clear_document_history(sid)

    gc.collect()


async def _session_cleanup_loop():
    while True:
        await asyncio.sleep(300)
        cleanup_expired_sessions()


# ── Request/Response Models ────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=20)


class DocumentQueryRequest(BaseModel):
    session_id: str
    query: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=20)


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=10000)


class LeetCodeManualStats(BaseModel):
    profile_url: str = Field(min_length=1, max_length=300)
    easy: int = Field(default=0, ge=0, le=100000)
    medium: int = Field(default=0, ge=0, le=100000)
    hard: int = Field(default=0, ge=0, le=100000)
    topics: dict[str, int] = Field(default_factory=dict)
    daily_solves: dict[str, int] = Field(default_factory=dict)


class ResumeScoreRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    target_role: str = Field(default="Software Development Engineer", max_length=100)


def _integration_doc(user_id: str) -> dict:
    if integration_collection is not None:
        return integration_collection.find_one({"user_id": user_id}) or {}
    with integration_lock:
        return integration_records.get(user_id, {}).copy()


def _save_integration_doc(user_id: str, values: dict) -> None:
    values = {**values, "user_id": user_id}
    if integration_collection is not None:
        integration_collection.update_one({"user_id": user_id}, {"$set": values}, upsert=True)
    else:
        with integration_lock:
            integration_records[user_id] = {**integration_records.get(user_id, {}), **values}


def _delete_integration_fields(user_id: str, fields: list[str]) -> None:
    if integration_collection is not None:
        integration_collection.update_one({"user_id": user_id}, {"$unset": {field: "" for field in fields}})
    else:
        with integration_lock:
            record = integration_records.get(user_id, {})
            for field in fields:
                record.pop(field, None)


def _token_cipher():
    from cryptography.fernet import Fernet
    key = os.getenv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="Integration token encryption is not configured")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=503, detail="Integration token encryption is misconfigured") from exc


def _github_api(path: str, token: str):
    import requests
    response = requests.get(
        f"https://api.github.com{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
        timeout=8,
    )
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub authorization expired. Reconnect GitHub.")
    if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
        raise HTTPException(status_code=429, detail="GitHub rate limit reached. Try again later.")
    response.raise_for_status()
    return response.json()


def _github_contributions(token: str, login: str, start: str, end: str) -> dict:
    import requests
    query = """
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            colors
            weeks { contributionDays { date contributionCount color } }
          }
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          pullRequestContributions(first: 10, orderBy: {direction: DESC}) {
            nodes {
              occurredAt
              pullRequest { title url state merged repository { nameWithOwner } }
            }
          }
        }
      }
    }
    """
    response = requests.post(
        "https://api.github.com/graphql",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
        json={"query": query, "variables": {"login": login, "from": start, "to": end}},
        timeout=8,
    )
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="GitHub authorization expired. Reconnect GitHub.")
    if response.status_code == 403 and response.headers.get("X-RateLimit-Remaining") == "0":
        raise HTTPException(status_code=429, detail="GitHub rate limit reached. Try again later.")
    response.raise_for_status()
    body = response.json()
    if body.get("errors"):
        raise HTTPException(status_code=502, detail="GitHub contribution data is temporarily unavailable")
    return (body.get("data", {}).get("user") or {}).get("contributionsCollection") or {}


def _github_redirect(status: str):
    from urllib.parse import urlencode
    frontend = os.getenv("FRONTEND_ORIGIN", "https://placement-prep-rag.vercel.app").rstrip("/")
    return RedirectResponse(f"{frontend}/?github_oauth={urlencode({'status': status})}", status_code=303)


def verify_google_token(raw_token: str) -> dict:
    """Verify a GIS ID token; never trust decoded-but-unverified claims."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    token_key = hashlib.sha256(raw_token.encode()).hexdigest()
    now = int(time.time())
    with google_token_lock:
        cached = google_token_cache.get(token_key)
        if cached and cached[0] > now:
            return cached[1].copy()
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        google_request = google_requests.Request()

        def request_google_keys(url, method="GET", body=None, headers=None, **kwargs):
            return google_request(url, method=method, body=body, headers=headers, timeout=5, **kwargs)

        claims = id_token.verify_oauth2_token(raw_token, request_google_keys, client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired Google token") from exc
    except Exception as exc:
        print(f"[WARN] Google token verification unavailable: {type(exc).__name__}")
        raise HTTPException(status_code=503, detail="Google token verification is temporarily unavailable") from exc

    if not claims.get("sub") or not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google account must have a verified email")
    expiry = int(claims.get("exp", 0))
    with google_token_lock:
        for stale_key, (stale_expiry, _) in list(google_token_cache.items()):
            if stale_expiry <= now:
                google_token_cache.pop(stale_key, None)
        if len(google_token_cache) >= 2000:
            oldest_key = min(google_token_cache, key=lambda key: google_token_cache[key][0])
            google_token_cache.pop(oldest_key, None)
        google_token_cache[token_key] = (expiry, claims.copy())
    return claims


def google_user_from_request(request: Request, *, optional: bool = False) -> dict | None:
    authorization = request.headers.get("authorization", "")
    if not authorization:
        if optional:
            return None
        raise HTTPException(status_code=401, detail="Sign in with Google to access this data")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    return verify_google_token(token)


def enforce_rate_limit(request: Request, user: dict | None = None) -> None:
    route = request.scope.get("route")
    route_path = getattr(route, "path", request.url.path)
    limit = RATE_LIMITS.get(route_path)
    if not limit:
        return
    max_requests, window_seconds = limit
    client_ip = request.client.host if request.client else "unknown"
    caller = user["sub"] if user else client_ip
    key = (route_path, caller)
    now = time.monotonic()
    with rate_lock:
        cutoff = now - window_seconds
        for stale_key in [k for k, events in rate_windows.items() if not events or events[-1] <= cutoff]:
            rate_windows.pop(stale_key, None)
        events = [event for event in rate_windows.get(key, []) if event > cutoff]
        if len(events) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - events[0])))
            raise HTTPException(status_code=429, detail="Too many requests. Try again shortly.", headers={"Retry-After": str(retry_after)})
        events.append(now)
        rate_windows[key] = events


def assert_document_access(session_id: str, request: Request) -> dict:
    with document_lock:
        session = document_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    owner_id = session.get("owner_id")
    if owner_id:
        user = google_user_from_request(request)
        if user["sub"] != owner_id:
            raise HTTPException(status_code=403, detail="This document belongs to another account")
    else:
        supplied = request.headers.get("x-document-token", "")
        supplied_hash = hashlib.sha256(supplied.encode()).hexdigest() if supplied else ""
        if not supplied_hash or not hmac.compare_digest(supplied_hash, session["access_token_hash"]):
            raise HTTPException(status_code=403, detail="Document access token is missing or invalid")
    return session


# ── SSE Helper ────────────────────────────────────────────────────────────────
def make_sse_generator(gen) -> AsyncGenerator[str, None]:
    """Wraps a synchronous (event_type, data) generator into SSE-formatted strings."""
    async def inner():
        try:
            for event_type, data in gen:
                payload = json.dumps(data, ensure_ascii=False) if event_type == "token" else data
                yield f"event: {event_type}\ndata: {payload}\n\n"
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR] SSE generation failed: {type(e).__name__}")
            error_payload = json.dumps({"error": "Unable to complete the response"})
            yield f"event: error\ndata: {error_payload}\n\n"
        finally:
            yield "event: done\ndata: \n\n"
    return inner()


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok"}


# ── Standard (non-streaming) endpoints — kept for backward compat ──────────────
@app.post("/query")
def query(payload: QueryRequest, request: Request):
    user = google_user_from_request(request, optional=True)
    enforce_rate_limit(request, user)
    results = rag.search_and_summarize(payload.query, payload.top_k, user_id=user["sub"] if user else None)
    return {"answer": results["answer"], "sources": results["sources"], "pipeline_stages": results.get("pipeline_stages", [])}


@app.post("/clear")
def clear_history(request: Request):
    user = google_user_from_request(request, optional=True)
    if user:
        rag.clear_history(user_id=user["sub"])
        if chat_collection is not None:
            chat_collection.delete_one({"user_id": user["sub"]})
            chat_collection.delete_one({"email": user["email"]})
    return {"status": "history cleared"}


# ── MongoDB History Sync ───────────────────────────────────────────────────────
class HistorySyncRequest(BaseModel):
    # Keep `email` accepted for compatibility with older frontends, but never
    # use a caller-supplied email as the database owner key.
    email: str | None = None
    messages: list[dict] = Field(max_length=200)

def _history_for_user(user: dict):
    if chat_collection is None:
        return {"messages": []}

    user_record = chat_collection.find_one({"user_id": user["sub"]}, {"_id": 0, "messages": 1})
    # Read legacy records once by verified email. Writes below migrate them to
    # the stable Google subject ID without exposing another user's email lookup.
    if not user_record:
        user_record = chat_collection.find_one({"email": user["email"]}, {"_id": 0, "messages": 1})
    if user_record and "messages" in user_record:
        return {"messages": user_record["messages"]}
    return {"messages": []}


@app.get("/history/me")
def get_my_history(request: Request):
    return _history_for_user(google_user_from_request(request))


@app.get("/history/{email}")
def get_user_history(email: str, request: Request):
    user = google_user_from_request(request)
    if email.casefold() != user["email"].casefold():
        raise HTTPException(status_code=403, detail="You can only access your own chat history")
    return _history_for_user(user)


@app.post("/history/sync")
def sync_user_history(payload: HistorySyncRequest, request: Request):
    user = google_user_from_request(request)
    if payload.email and payload.email.casefold() != user["email"].casefold():
        raise HTTPException(status_code=403, detail="You can only update your own chat history")
    if chat_collection is None:
        return {"status": "mongodb not configured"}

    chat_collection.update_one(
        {"user_id": user["sub"]},
        {"$set": {"email": user["email"], "messages": payload.messages, "updated_at": datetime.now(UTC)}},
        upsert=True
    )
    return {"status": "synced"}



# ── Streaming endpoints ────────────────────────────────────────────────────────
@app.post("/query/stream")
def query_stream(payload: QueryRequest, request: Request):
    user = google_user_from_request(request, optional=True)
    enforce_rate_limit(request, user)
    gen = rag.search_and_summarize_stream(payload.query, payload.top_k, user_id=user["sub"] if user else None)
    return StreamingResponse(
        make_sse_generator(gen),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/document/query/stream")
def query_document_stream(payload: DocumentQueryRequest, request: Request):
    session = assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    gen = rag.search_document_stream(
        query=payload.query,
        store=session["store"],
        filename=session["filename"],
        session_id=payload.session_id,
        top_k=payload.top_k,
    )
    return StreamingResponse(
        make_sse_generator(gen),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ── PDF Upload & Document Endpoints ────────────────────────────────────────────
@app.post("/upload")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    cleanup_expired_sessions()

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_UPLOAD_BYTES + 64 * 1024:
        raise HTTPException(status_code=413, detail="PDF exceeds the 15 MB upload limit")
    user = google_user_from_request(request, optional=True)
    enforce_rate_limit(request, user)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {"error": "Only PDF files are supported"}
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds the 15 MB upload limit")

    store = TempDocStore()
    chunk_count = await store.build_from_file(file, rag.vectorstore.model)

    if chunk_count == 0:
        return {"error": "Couldn't extract any text from this PDF"}

    session_id = str(uuid.uuid4())
    access_token = secrets.token_urlsafe(32)
    with document_lock:
        document_sessions[session_id] = {
            "store": store,
            "created_at": datetime.now(UTC),
            "filename": file.filename,
            "owner_id": user["sub"] if user else None,
            "access_token_hash": hashlib.sha256(access_token.encode()).hexdigest(),
        }

    return {
        "session_id": session_id,
        "session_token": access_token,
        "filename": file.filename,
        "chunks": chunk_count,
    }


@app.post("/document/query")
def query_document(payload: DocumentQueryRequest, request: Request):
    session = assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    result = rag.search_document(
        query=payload.query,
        store=session["store"],
        filename=session["filename"],
        session_id=payload.session_id,
        top_k=payload.top_k,
    )
    return result


@app.delete("/document/{session_id}")
def delete_document_session(session_id: str, request: Request):
    assert_document_access(session_id, request)
    with document_lock:
        document_sessions.pop(session_id, None)
    rag.clear_document_history(session_id)
    return {"status": "session cleared"}


class QuizRequest(BaseModel):
    session_id: str
    count: int = Field(default=4, ge=1, le=12)


@app.post("/document/generate-quiz")
def generate_quiz(payload: QuizRequest, request: Request):
    session = assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    try:
        quiz_items = rag.generate_quiz_from_store(session["store"], count=payload.count)
        return {"quiz_items": quiz_items}
    except Exception as e:  # noqa: BLE001
        print(f"[ERROR] generate_quiz failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Quiz generation is temporarily unavailable")


@app.post("/document/score-resume")
def score_resume(payload: ResumeScoreRequest, request: Request):
    session = assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    try:
        score_data = rag.score_resume_from_store(session["store"], target_role=payload.target_role)
        return score_data
    except Exception as e:  # noqa: BLE001
        print(f"[ERROR] score_resume failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Resume evaluation is temporarily unavailable")


# ── Google OAuth ───────────────────────────────────────────────────────────────
@app.post("/auth/google")
def google_auth(request: Request, payload: GoogleAuthRequest):
    """Verify GIS identity; return only claims validated against our client ID."""
    # Uses the remote client's address because the token is not trusted yet.
    enforce_rate_limit(request)
    claims = verify_google_token(payload.id_token)
    return {
        "sub": claims["sub"],
        "email": claims["email"],
        "name": claims.get("name", ""),
        "picture": claims.get("picture", ""),
    }


# ── GitHub and LeetCode integrations ──────────────────────────────────────────
@app.post("/integrations/github/connect")
def github_connect(request: Request):
    user = google_user_from_request(request)
    enforce_rate_limit(request, user)
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("GITHUB_REDIRECT_URI", "").strip()
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="GitHub integration is not configured")
    _token_cipher()  # Fail before sending the user into OAuth if tokens cannot be stored safely.
    from urllib.parse import urlencode
    state = secrets.token_urlsafe(32)
    with integration_lock:
        now = time.time()
        for key, (_, expiry) in list(github_oauth_states.items()):
            if expiry <= now:
                github_oauth_states.pop(key, None)
        github_oauth_states[state] = (user["sub"], now + 600)
    params = urlencode({"client_id": client_id, "redirect_uri": redirect_uri, "scope": "read:user", "state": state})
    return {"authorization_url": f"https://github.com/login/oauth/authorize?{params}"}


@app.get("/integrations/github/callback")
def github_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    enforce_rate_limit(request)
    if error or not code or not state:
        return _github_redirect("failed")
    with integration_lock:
        state_data = github_oauth_states.pop(state, None)
    if not state_data or state_data[1] <= time.time():
        return _github_redirect("failed")
    user_id = state_data[0]
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    client_secret = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GITHUB_REDIRECT_URI", "").strip()
    if not client_id or not client_secret or not redirect_uri:
        return _github_redirect("failed")
    try:
        import requests
        response = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            json={"client_id": client_id, "client_secret": client_secret, "code": code, "redirect_uri": redirect_uri, "state": state},
            timeout=8,
        )
        response.raise_for_status()
        access_token = response.json().get("access_token")
        if not access_token:
            return _github_redirect("failed")
        profile = _github_api("/user", access_token)
        encrypted = _token_cipher().encrypt(access_token.encode()).decode()
        _save_integration_doc(user_id, {
            "github_token": encrypted,
            "github_profile": {"login": profile.get("login", ""), "name": profile.get("name") or profile.get("login", ""), "avatar_url": profile.get("avatar_url", ""), "html_url": profile.get("html_url", "")},
            "github_cached_at": 0,
        })
        return _github_redirect("connected")
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] GitHub OAuth callback failed: {type(exc).__name__}")
        return _github_redirect("failed")


@app.get("/integrations/github")
def github_dashboard(request: Request, refresh: bool = False):
    user = google_user_from_request(request)
    enforce_rate_limit(request, user)
    record = _integration_doc(user["sub"])
    encrypted = record.get("github_token")
    if not encrypted:
        return {"connected": False}
    cipher = _token_cipher()
    try:
        token = cipher.decrypt(encrypted.encode()).decode()
    except Exception as exc:
        print(f"[WARN] Stored GitHub token could not be decrypted: {type(exc).__name__}")
        _delete_integration_fields(user["sub"], ["github_token", "github_profile", "github_summary", "github_cached_at"])
        raise HTTPException(status_code=503, detail="GitHub connection needs to be set up again") from exc
    cached_at = record.get("github_cached_at", 0)
    summary = record.get("github_summary")
    if summary and not refresh and time.time() - float(cached_at or 0) < 900:
        return {"connected": True, "profile": record.get("github_profile", {}), **summary, "cached": True}
    try:
        profile = _github_api("/user", token)
        repos = _github_api("/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=10", token)
        event_list = _github_api(f"/users/{profile.get('login', '')}/events/public?per_page=100", token)
        now = datetime.now(UTC)
        contributions = {}
        contribution_error = False
        try:
            contributions = _github_contributions(token, profile.get("login", ""), (now - timedelta(days=365)).isoformat(), now.isoformat())
        except HTTPException as exc:
            if exc.status_code == 401:
                raise
            contribution_error = True
            print(f"[WARN] GitHub contribution sync unavailable: {exc.status_code}")

        calendar = contributions.get("contributionCalendar", {})
        activity_weeks = [
            [{"date": day.get("date"), "count": day.get("contributionCount", 0), "color": day.get("color", "#161b22")} for day in week.get("contributionDays", [])]
            for week in calendar.get("weeks", [])
        ]
        recent_commits = []
        event_pull_requests = []
        for event in event_list:
            event_type = event.get("type")
            repository = event.get("repo", {}).get("name", "")
            payload = event.get("payload", {})
            if event_type == "PushEvent":
                for commit in reversed(payload.get("commits", [])):
                    sha = commit.get("sha", "")
                    if sha and repository:
                        recent_commits.append({"sha": sha[:7], "message": commit.get("message", "").splitlines()[0][:180], "repository": repository, "url": f"https://github.com/{repository}/commit/{sha}", "occurred_at": event.get("created_at")})
            elif event_type == "PullRequestEvent":
                pull_request = payload.get("pull_request", {})
                if pull_request.get("html_url"):
                    event_pull_requests.append({"title": pull_request.get("title", "Pull request"), "url": pull_request["html_url"], "repository": repository, "state": "merged" if pull_request.get("merged_at") else pull_request.get("state", "unknown"), "occurred_at": event.get("created_at")})

        graph_pull_requests = []
        for contribution in contributions.get("pullRequestContributions", {}).get("nodes", []):
            pull_request = contribution.get("pullRequest") or {}
            if pull_request.get("url"):
                graph_pull_requests.append({"title": pull_request.get("title", "Pull request"), "url": pull_request["url"], "repository": (pull_request.get("repository") or {}).get("nameWithOwner", ""), "state": "merged" if pull_request.get("merged") else str(pull_request.get("state", "unknown")).lower(), "occurred_at": contribution.get("occurredAt")})

        merged_pull_requests = {item["url"]: item for item in [*graph_pull_requests, *event_pull_requests]}
        summary = {
            "repositories": [{"name": repo.get("name", ""), "description": repo.get("description"), "url": repo.get("html_url", ""), "language": repo.get("language"), "stars": repo.get("stargazers_count", 0), "updated_at": repo.get("pushed_at")} for repo in repos[:10]],
            "recent_public_events": len(event_list),
            "activity_weeks": activity_weeks,
            "activity_total": calendar.get("totalContributions", 0),
            "activity_colors": calendar.get("colors", []),
            "activity_totals": {
                "commits": contributions.get("totalCommitContributions", 0),
                "pull_requests": contributions.get("totalPullRequestContributions", 0),
                "issues": contributions.get("totalIssueContributions", 0),
            },
            "recent_commits": recent_commits[:10],
            "pull_requests": sorted(merged_pull_requests.values(), key=lambda item: item.get("occurred_at") or "", reverse=True)[:10],
            "contribution_data_available": bool(calendar),
            "contribution_data_limited": contribution_error,
            "synced_at": datetime.now(UTC).isoformat(),
        }
        safe_profile = {"login": profile.get("login", ""), "name": profile.get("name") or profile.get("login", ""), "avatar_url": profile.get("avatar_url", ""), "html_url": profile.get("html_url", "")}
        _save_integration_doc(user["sub"], {"github_token": encrypted, "github_profile": safe_profile, "github_summary": summary, "github_cached_at": time.time()})
        return {"connected": True, "profile": safe_profile, **summary, "cached": False}
    except HTTPException as exc:
        if summary and exc.status_code in {429, 502, 503}:
            return {"connected": True, "profile": record.get("github_profile", {}), **summary, "cached": True, "stale": True}
        raise
    except Exception as exc:
        print(f"[WARN] GitHub dashboard sync failed: {type(exc).__name__}")
        if summary:
            return {"connected": True, "profile": record.get("github_profile", {}), **summary, "cached": True, "stale": True}
        raise HTTPException(status_code=502, detail="GitHub data is temporarily unavailable") from exc


@app.delete("/integrations/github")
def github_disconnect(request: Request):
    user = google_user_from_request(request)
    enforce_rate_limit(request, user)
    _delete_integration_fields(user["sub"], ["github_token", "github_profile", "github_summary", "github_cached_at"])
    return {"connected": False}


@app.get("/integrations/leetcode")
def leetcode_manual_stats(request: Request):
    user = google_user_from_request(request)
    enforce_rate_limit(request, user)
    stats = _integration_doc(user["sub"]).get("leetcode_manual")
    return {"connected": bool(stats), "stats": stats, "source": "user-entered" if stats else None}


@app.put("/integrations/leetcode")
def save_leetcode_manual_stats(payload: LeetCodeManualStats, request: Request):
    user = google_user_from_request(request)
    enforce_rate_limit(request, user)
    from urllib.parse import urlparse
    parsed = urlparse(payload.profile_url if "://" in payload.profile_url else f"https://{payload.profile_url}")
    if parsed.scheme != "https" or parsed.hostname not in {"leetcode.com", "www.leetcode.com"} or not parsed.path.strip("/"):
        raise HTTPException(status_code=422, detail="Enter a valid LeetCode profile URL")
    stats = {
        "profile_url": f"https://{parsed.hostname}{parsed.path.rstrip('/')}",
        "easy": payload.easy,
        "medium": payload.medium,
        "hard": payload.hard,
        "topics": payload.topics or {},
        "daily_solves": payload.daily_solves or {},
        "updated_at": datetime.now(UTC).isoformat(),
    }
    _save_integration_doc(user["sub"], {"leetcode_manual": stats})
    return {"connected": True, "stats": stats, "source": "user-entered"}


@app.delete("/integrations/leetcode")
def delete_leetcode_manual_stats(request: Request):
    user = google_user_from_request(request)
    enforce_rate_limit(request, user)
    _delete_integration_fields(user["sub"], ["leetcode_manual"])
    return {"connected": False}
