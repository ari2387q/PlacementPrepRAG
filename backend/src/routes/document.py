import hashlib
import secrets
import uuid
from datetime import UTC, datetime
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
import main
from src.models import DocumentQueryRequest, QuizRequest, ResumeScoreRequest
from src.services.rate_limiter import enforce_rate_limit
from src.services.session_service import MAX_UPLOAD_BYTES, make_sse_generator
from src.temp_vectorstore import TempDocStore

router = APIRouter(tags=["document"])


@router.post("/upload")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    main.cleanup_expired_sessions(main.rag)

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_UPLOAD_BYTES + 64 * 1024:
        raise HTTPException(status_code=413, detail="PDF exceeds the 15 MB upload limit")
    user = main.google_user_from_request(request, optional=True)
    enforce_rate_limit(request, user)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {"error": "Only PDF files are supported"}
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds the 15 MB upload limit")

    store = TempDocStore()
    chunk_count = await store.build_from_file(file, main.rag.vectorstore.model)

    if chunk_count == 0:
        return {"error": "Couldn't extract any text from this PDF"}

    session_id = str(uuid.uuid4())
    access_token = secrets.token_urlsafe(32)
    with main.document_lock:
        main.document_sessions[session_id] = {
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


@router.post("/document/query")
def query_document(payload: DocumentQueryRequest, request: Request):
    session = main.assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    result = main.rag.search_document(
        query=payload.query,
        store=session["store"],
        filename=session["filename"],
        session_id=payload.session_id,
        top_k=payload.top_k,
    )
    return result


@router.post("/document/query/stream")
def query_document_stream(payload: DocumentQueryRequest, request: Request):
    session = main.assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    gen = main.rag.search_document_stream(
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


@router.delete("/document/{session_id}")
def delete_document_session(session_id: str, request: Request):
    main.assert_document_access(session_id, request)
    with main.document_lock:
        main.document_sessions.pop(session_id, None)
    if main.rag:
        main.rag.clear_document_history(session_id)
    return {"status": "session cleared"}


@router.post("/document/generate-quiz")
def generate_quiz(payload: QuizRequest, request: Request):
    session = main.assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    try:
        quiz_items = main.rag.generate_quiz_from_store(session["store"], count=payload.count)
        return {"quiz_items": quiz_items}
    except Exception as e:  # noqa: BLE001
        print(f"[ERROR] generate_quiz failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Quiz generation is temporarily unavailable")


@router.post("/document/score-resume")
def score_resume(payload: ResumeScoreRequest, request: Request):
    session = main.assert_document_access(payload.session_id, request)
    enforce_rate_limit(request, {"sub": session["owner_id"]} if session.get("owner_id") else None)

    try:
        score_data = main.rag.score_resume_from_store(session["store"], target_role=payload.target_role)
        return score_data
    except Exception as e:  # noqa: BLE001
        print(f"[ERROR] score_resume failed: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="Resume evaluation is temporarily unavailable")
