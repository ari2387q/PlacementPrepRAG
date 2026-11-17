import asyncio
import gc
import hashlib
import hmac
import json
import threading
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from fastapi import HTTPException, Request

document_sessions: dict[str, dict] = {}
document_chat_histories: dict[str, list] = {}
document_lock = threading.RLock()

SESSION_TTL = timedelta(hours=2)
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_DOCUMENT_SESSIONS = 50


def assert_document_access(session_id: str, request: Request) -> dict:
    import main
    with getattr(main, "document_lock", document_lock):
        sessions = getattr(main, "document_sessions", document_sessions)
        session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    owner_id = session.get("owner_id")
    if owner_id:
        user = main.google_user_from_request(request)
        if user["sub"] != owner_id:
            raise HTTPException(status_code=403, detail="This document belongs to another account")
    else:
        supplied = request.headers.get("x-document-token", "")
        supplied_hash = hashlib.sha256(supplied.encode()).hexdigest() if supplied else ""
        if not supplied_hash or not hmac.compare_digest(supplied_hash, session["access_token_hash"]):
            raise HTTPException(status_code=403, detail="Document access token is missing or invalid")
    return session


def cleanup_expired_sessions(rag=None) -> None:
    import main
    now = datetime.now(UTC)
    with getattr(main, "document_lock", document_lock):
        sessions = getattr(main, "document_sessions", document_sessions)
        expired = [sid for sid, data in sessions.items() if now - data["created_at"] > SESSION_TTL]
        for sid in expired:
            sessions.pop(sid, None)
            active_rag = rag or getattr(main, "rag", None)
            if active_rag and hasattr(active_rag, "clear_document_history"):
                active_rag.clear_document_history(sid)

        # Evict oldest if exceeding cap
        if len(sessions) > MAX_DOCUMENT_SESSIONS:
            excess = len(sessions) - MAX_DOCUMENT_SESSIONS
            sorted_sids = sorted(sessions.keys(), key=lambda sid: sessions[sid]["created_at"])
            for sid in sorted_sids[:excess]:
                sessions.pop(sid, None)
                active_rag = rag or getattr(main, "rag", None)
                if active_rag and hasattr(active_rag, "clear_document_history"):
                    active_rag.clear_document_history(sid)

    gc.collect()


async def session_cleanup_loop(get_rag) -> None:
    while True:
        await asyncio.sleep(300)
        cleanup_expired_sessions(get_rag())


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
