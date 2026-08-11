import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import AsyncGenerator

# ruff: noqa: B008
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.temp_vectorstore import TempDocStore

rag = None
mongo_client = None
db = None
chat_collection = None
document_sessions: dict = {}
document_chat_histories: dict = {}
SESSION_TTL = timedelta(hours=2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag, mongo_client, db, chat_collection
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
            print("[INFO] Connected to MongoDB")
        except Exception as e:
            print(f"[ERROR] Failed to connect to MongoDB: {e}")
            mongo_client = None
    else:
        print("[WARN] MONGODB_URI not set. Chat history will not be persisted to MongoDB.")
        
    yield
    
    if mongo_client:
        mongo_client.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Session expiry cleanup
def cleanup_expired_sessions():
    now = datetime.now(UTC)
    expired = [sid for sid, data in document_sessions.items() if now - data["created_at"] > SESSION_TTL]
    for sid in expired:
        del document_sessions[sid]


# ── Request/Response Models ────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str
    top_k: int = 5


class DocumentQueryRequest(BaseModel):
    session_id: str
    query: str
    top_k: int = 5


class GoogleAuthRequest(BaseModel):
    id_token: str


# ── SSE Helper ────────────────────────────────────────────────────────────────
def make_sse_generator(gen) -> AsyncGenerator[str, None]:
    """Wraps a synchronous (event_type, data) generator into SSE-formatted strings."""
    async def inner():
        try:
            for event_type, data in gen:
                yield f"event: {event_type}\ndata: {data}\n\n"
        except Exception as e:
            error_payload = json.dumps({"error": str(e)})
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
def query(request: QueryRequest):
    results = rag.search_and_summarize(request.query, request.top_k)
    return {"answer": results["answer"], "sources": results["sources"], "pipeline_stages": results.get("pipeline_stages", [])}


@app.post("/clear")
def clear_history():
    rag.clear_history()
    return {"status": "history cleared"}


# ── MongoDB History Sync ───────────────────────────────────────────────────────
class HistorySyncRequest(BaseModel):
    email: str
    messages: list[dict]

@app.get("/history/{email}")
def get_user_history(email: str):
    if chat_collection is None:
        return {"messages": []}
    
    user_record = chat_collection.find_one({"email": email}, {"_id": 0, "messages": 1})
    if user_record and "messages" in user_record:
        return {"messages": user_record["messages"]}
    return {"messages": []}

@app.post("/history/sync")
def sync_user_history(request: HistorySyncRequest):
    if chat_collection is None:
        return {"status": "mongodb not configured"}
        
    chat_collection.update_one(
        {"email": request.email},
        {"$set": {"messages": request.messages, "updated_at": datetime.now(UTC)}},
        upsert=True
    )
    return {"status": "synced"}



# ── Streaming endpoints ────────────────────────────────────────────────────────
@app.post("/query/stream")
def query_stream(request: QueryRequest):
    gen = rag.search_and_summarize_stream(request.query, request.top_k)
    return StreamingResponse(
        make_sse_generator(gen),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/document/query/stream")
def query_document_stream(request: DocumentQueryRequest):
    session = document_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    gen = rag.search_document_stream(
        query=request.query,
        store=session["store"],
        filename=session["filename"],
        session_id=request.session_id,
        top_k=request.top_k,
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
async def upload_pdf(file: UploadFile = File(...)):
    cleanup_expired_sessions()

    if not file.filename.lower().endswith(".pdf"):
        return {"error": "Only PDF files are supported"}

    store = TempDocStore()
    chunk_count = await store.build_from_file(file, rag.vectorstore.model)

    if chunk_count == 0:
        return {"error": "Couldn't extract any text from this PDF"}

    session_id = str(uuid.uuid4())
    document_sessions[session_id] = {
        "store": store,
        "created_at": datetime.now(UTC),
        "filename": file.filename,
    }

    return {"session_id": session_id, "filename": file.filename, "chunks": chunk_count}


@app.post("/document/query")
def query_document(request: DocumentQueryRequest):
    session = document_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    result = rag.search_document(
        query=request.query,
        store=session["store"],
        filename=session["filename"],
        session_id=request.session_id,
        top_k=request.top_k,
    )
    return result


@app.delete("/document/{session_id}")
def delete_document_session(session_id: str):
    document_sessions.pop(session_id, None)
    rag.clear_document_history(session_id)
    return {"status": "session cleared"}


class QuizRequest(BaseModel):
    session_id: str
    count: int = 4


@app.post("/document/generate-quiz")
def generate_quiz(request: QuizRequest):
    session = document_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    quiz_items = rag.generate_quiz_from_store(session["store"], count=request.count)
    return {"quiz_items": quiz_items}


# ── Google OAuth ───────────────────────────────────────────────────────────────
@app.post("/auth/google")
def google_auth(request: GoogleAuthRequest):
    """Verify Google ID token and return user info."""
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if not google_client_id:
        # Fallback: decode without verification if client ID not set yet
        # (allows frontend to work while credentials are being configured)
        import base64
        import json as _json
        try:
            parts = request.id_token.split(".")
            if len(parts) != 3:
                raise HTTPException(status_code=400, detail="Invalid ID token format")
            padding = 4 - len(parts[1]) % 4
            padded = parts[1] + "=" * padding
            payload = _json.loads(base64.urlsafe_b64decode(padded))
            return {
                "email": payload.get("email", ""),
                "name": payload.get("name", ""),
                "picture": payload.get("picture", ""),
            }
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to decode token")

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        id_info = id_token.verify_oauth2_token(
            request.id_token,
            google_requests.Request(),
            google_client_id,
        )
        return {
            "email": id_info.get("email", ""),
            "name": id_info.get("name", ""),
            "picture": id_info.get("picture", ""),
        }
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")
