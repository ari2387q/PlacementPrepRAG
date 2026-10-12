from fastapi.testclient import TestClient
from unittest.mock import MagicMock
import pytest

from main import app, ALLOWED_ORIGINS
import main

client = TestClient(app, raise_server_exceptions=False)

def test_cors_headers_on_regular_options_request():
    headers = {
        "Origin": "https://placement-prep-rag.vercel.app",
        "Access-Control-Request-Method": "POST",
    }
    response = client.options("/document/generate-quiz", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://placement-prep-rag.vercel.app"


def test_cors_headers_preserved_on_unhandled_exception():
    @app.get("/test-crash")
    def crash_endpoint():
        raise RuntimeError("Simulated crash")

    response = client.get("/test-crash", headers={"Origin": "https://placement-prep-rag.vercel.app"})
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "https://placement-prep-rag.vercel.app"
    data = response.json()
    assert "Internal server error" in data["detail"]


def test_generate_quiz_session_not_found():
    response = client.post(
        "/document/generate-quiz",
        json={"session_id": "nonexistent-id", "count": 4},
        headers={"Origin": "https://placement-prep-rag.vercel.app"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Session not found or expired"
    assert response.headers.get("access-control-allow-origin") == "https://placement-prep-rag.vercel.app"


def test_generate_quiz_handles_llm_failure():
    mock_rag = MagicMock()
    mock_rag.generate_quiz_from_store.side_effect = Exception("Groq API quota exceeded")
    
    # inject mock store and mock rag
    main.rag = mock_rag
    main.document_sessions["test-session"] = {
        "store": MagicMock(),
        "created_at": main.datetime.now(main.UTC),
        "filename": "sample.pdf",
    }

    try:
        response = client.post(
            "/document/generate-quiz",
            json={"session_id": "test-session", "count": 4},
            headers={"Origin": "https://placement-prep-rag.vercel.app"},
        )
        assert response.status_code == 500
        assert "Quiz generation failed" in response.json()["detail"]
        assert response.headers.get("access-control-allow-origin") == "https://placement-prep-rag.vercel.app"
    finally:
        main.document_sessions.pop("test-session", None)
