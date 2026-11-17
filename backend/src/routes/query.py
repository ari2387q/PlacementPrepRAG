from datetime import UTC, datetime
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
import main
from src.models import HistorySyncRequest, QueryRequest
from src.services.rate_limiter import enforce_rate_limit
from src.services.session_service import make_sse_generator

router = APIRouter(tags=["query"])


def _history_for_user(user: dict):
    if main.chat_collection is None:
        return {"messages": []}

    user_record = main.chat_collection.find_one({"user_id": user["sub"]}, {"_id": 0, "messages": 1})
    if not user_record:
        user_record = main.chat_collection.find_one({"email": user["email"]}, {"_id": 0, "messages": 1})
    if user_record and "messages" in user_record:
        return {"messages": user_record["messages"]}
    return {"messages": []}


@router.post("/query")
def query(payload: QueryRequest, request: Request):
    user = main.google_user_from_request(request, optional=True)
    enforce_rate_limit(request, user)
    results = main.rag.search_and_summarize(payload.query, payload.top_k, user_id=user["sub"] if user else None)
    return {"answer": results["answer"], "sources": results["sources"], "pipeline_stages": results.get("pipeline_stages", [])}


@router.post("/clear")
def clear_history(request: Request):
    user = main.google_user_from_request(request, optional=True)
    if user:
        if main.rag:
            main.rag.clear_history(user_id=user["sub"])
        if main.chat_collection is not None:
            main.chat_collection.delete_one({"user_id": user["sub"]})
            main.chat_collection.delete_one({"email": user["email"]})
    return {"status": "history cleared"}


@router.get("/history/me")
def get_my_history(request: Request):
    return _history_for_user(main.google_user_from_request(request))


@router.get("/history/{email}")
def get_user_history(email: str, request: Request):
    user = main.google_user_from_request(request)
    if email.casefold() != user["email"].casefold():
        raise HTTPException(status_code=403, detail="You can only access your own chat history")
    return _history_for_user(user)


@router.post("/history/sync")
def sync_user_history(payload: HistorySyncRequest, request: Request):
    user = main.google_user_from_request(request)
    if payload.email and payload.email.casefold() != user["email"].casefold():
        raise HTTPException(status_code=403, detail="You can only update your own chat history")
    if main.chat_collection is None:
        return {"status": "mongodb not configured"}

    main.chat_collection.update_one(
        {"user_id": user["sub"]},
        {"$set": {"email": user["email"], "messages": payload.messages, "updated_at": datetime.now(UTC)}},
        upsert=True
    )
    return {"status": "synced"}


@router.post("/query/stream")
def query_stream(payload: QueryRequest, request: Request):
    user = main.google_user_from_request(request, optional=True)
    enforce_rate_limit(request, user)
    gen = main.rag.search_and_summarize_stream(payload.query, payload.top_k, user_id=user["sub"] if user else None)
    return StreamingResponse(
        make_sse_generator(gen),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
