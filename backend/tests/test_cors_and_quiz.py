import asyncio
from unittest.mock import MagicMock

import httpx
import main
import pytest
from fastapi import HTTPException
from main import app
from starlette.requests import Request


class ASGITestClient:
    """Synchronous helper over HTTPX's ASGI transport."""

    def __getattr__(self, method):
        async def send(path, **kwargs):
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as session:
                return await session.request(method.upper(), path, **kwargs)

        return lambda path, **kwargs: asyncio.run(send(path, **kwargs))


client = ASGITestClient()


def make_request(path="/", headers=None):
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()],
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })

def test_cors_headers_on_regular_options_request():
    headers = {
        "Origin": "https://placement-prep-rag.vercel.app",
        "Access-Control-Request-Method": "POST",
    }
    response = client.options("/document/generate-quiz", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://placement-prep-rag.vercel.app"


def test_cors_headers_preserved_on_unhandled_exception():
    request = make_request("/test-crash", {"Origin": "https://placement-prep-rag.vercel.app"})
    response = asyncio.run(main.global_exception_handler(request, RuntimeError("Simulated crash")))
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "https://placement-prep-rag.vercel.app"
    assert "Internal server error" in response.body.decode()


def test_generate_quiz_session_not_found():
    with pytest.raises(HTTPException) as error:
        main.assert_document_access("nonexistent-id", make_request())
    assert error.value.status_code == 404
    assert error.value.detail == "Session not found or expired"


def test_generate_quiz_handles_llm_failure(monkeypatch):
    main.rate_windows.clear()
    monkeypatch.setattr(
        main,
        "verify_google_token",
        lambda token: {"sub": "test-user", "email": "test@example.com", "email_verified": True},
    )
    mock_rag = MagicMock()
    mock_rag.generate_quiz_from_store.side_effect = Exception("Groq API quota exceeded")
    
    # inject mock store and mock rag
    main.rag = mock_rag
    main.document_sessions["test-session"] = {
        "store": MagicMock(),
        "created_at": main.datetime.now(main.UTC),
        "filename": "sample.pdf",
        "owner_id": "test-user",
        "access_token_hash": "unused-for-account-owner",
    }

    try:
        with pytest.raises(HTTPException) as error:
            main.generate_quiz(
                main.QuizRequest(session_id="test-session", count=4),
                make_request("/document/generate-quiz", {"Authorization": "Bearer signed-token"}),
            )
        assert error.value.status_code == 502
        assert "temporarily unavailable" in error.value.detail
    finally:
        main.document_sessions.pop("test-session", None)


def test_unverified_google_token_fallback_is_disabled(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    main.rate_windows.clear()
    with pytest.raises(HTTPException) as error:
        main.verify_google_token("a" * 24)
    assert error.value.status_code == 503


def test_document_access_is_bound_to_google_subject(monkeypatch):
    main.document_sessions["owned"] = {
        "owner_id": "owner-sub",
        "access_token_hash": "not-used-for-account-owner",
        "store": MagicMock(),
        "filename": "owned.pdf",
        "created_at": main.datetime.now(main.UTC),
    }
    monkeypatch.setattr(
        main,
        "verify_google_token",
        lambda token: {
            "sub": "owner-sub" if token == "owner-token" else "other-sub",
            "email": "test@example.com",
            "email_verified": True,
        },
    )
    try:
        with pytest.raises(HTTPException) as error:
            main.assert_document_access("owned", make_request(headers={"Authorization": "Bearer other-token"}))
        assert error.value.status_code == 403
        assert error.value.detail == "This document belongs to another account"
    finally:
        main.document_sessions.pop("owned", None)


def test_history_routes_use_verified_user_and_reject_other_email(monkeypatch):
    mock_collection = MagicMock()
    monkeypatch.setattr(main, "chat_collection", mock_collection)
    monkeypatch.setattr(
        main,
        "verify_google_token",
        lambda token: {"sub": "user-123", "email": "me@example.com", "email_verified": True},
    )
    with pytest.raises(HTTPException) as error:
        main.get_user_history("other@example.com", make_request(headers={"Authorization": "Bearer signed-token"}))
    assert error.value.status_code == 403

    response = main.sync_user_history(
        main.HistorySyncRequest(email="me@example.com", messages=[{"role": "user", "content": "hi"}]),
        make_request(headers={"Authorization": "Bearer signed-token"}),
    )
    assert response["status"] == "synced"
    assert mock_collection.update_one.call_args.args[0] == {"user_id": "user-123"}


def test_clear_only_deletes_the_verified_user_history(monkeypatch):
    mock_rag = MagicMock()
    mock_collection = MagicMock()
    monkeypatch.setattr(main, "rag", mock_rag)
    monkeypatch.setattr(main, "chat_collection", mock_collection)
    monkeypatch.setattr(
        main,
        "verify_google_token",
        lambda token: {"sub": "user-456", "email": "me@example.com", "email_verified": True},
    )
    response = main.clear_history(make_request("/clear", {"Authorization": "Bearer signed-token"}))
    assert response["status"] == "history cleared"
    mock_rag.clear_history.assert_called_once_with(user_id="user-456")
    assert mock_collection.delete_one.call_args_list[0].args[0] == {"user_id": "user-456"}
