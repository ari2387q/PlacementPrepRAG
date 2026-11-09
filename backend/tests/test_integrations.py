import main
from fastapi import HTTPException
from starlette.requests import Request


def make_request(path: str) -> Request:
    return Request({"type": "http", "method": "POST", "path": path, "headers": [], "client": ("127.0.0.1", 1234), "scheme": "http", "server": ("test", 80), "query_string": b""})


def test_in_memory_integrations_are_account_scoped_and_merge(monkeypatch):
    monkeypatch.setattr(main, "integration_collection", None)
    monkeypatch.setattr(main, "integration_records", {})
    main._save_integration_doc("account-a", {"github_token": "ciphertext"})
    main._save_integration_doc("account-a", {"leetcode_manual": {"easy": 4}})
    main._save_integration_doc("account-b", {"leetcode_manual": {"easy": 99}})

    assert main._integration_doc("account-a")["github_token"] == "ciphertext"
    assert main._integration_doc("account-a")["leetcode_manual"]["easy"] == 4
    assert "github_token" not in main._integration_doc("account-b")


def test_github_connect_uses_account_bound_state_and_minimal_scope(monkeypatch):
    monkeypatch.setenv("GITHUB_CLIENT_ID", "client-id")
    monkeypatch.setenv("GITHUB_REDIRECT_URI", "https://api.example.com/integrations/github/callback")
    monkeypatch.setattr(main, "_token_cipher", lambda: object())
    monkeypatch.setattr(main, "google_user_from_request", lambda request: {"sub": "google-subject"})
    monkeypatch.setattr(main, "github_oauth_states", {})

    result = main.github_connect(make_request("/integrations/github/connect"))

    assert "scope=read%3Auser" in result["authorization_url"]
    state = result["authorization_url"].split("state=", 1)[1]
    assert main.github_oauth_states[state][0] == "google-subject"


def test_leetcode_url_validation_rejects_untrusted_hosts(monkeypatch):
    monkeypatch.setattr(main, "google_user_from_request", lambda request: {"sub": "account-a"})
    payload = main.LeetCodeManualStats(profile_url="https://leetcode.com.attacker.example/u/me", easy=1, medium=2, hard=3)

    try:
        main.save_leetcode_manual_stats(payload, make_request("/integrations/leetcode"))
    except HTTPException as error:
        assert error.status_code == 422
    else:
        raise AssertionError("Expected invalid LeetCode host to be rejected")
