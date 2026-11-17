import os
import threading
from fastapi import HTTPException
from fastapi.responses import RedirectResponse
import main

integration_records: dict[str, dict] = {}
github_oauth_states: dict[str, tuple[str, float]] = {}
integration_lock = threading.RLock()


def _integration_doc(user_id: str) -> dict:
    coll = getattr(main, "integration_collection", None)
    if coll is not None:
        return coll.find_one({"user_id": user_id}) or {}
    with getattr(main, "integration_lock", integration_lock):
        return getattr(main, "integration_records", integration_records).get(user_id, {}).copy()


def _save_integration_doc(user_id: str, values: dict) -> None:
    values = {**values, "user_id": user_id}
    coll = getattr(main, "integration_collection", None)
    if coll is not None:
        coll.update_one({"user_id": user_id}, {"$set": values}, upsert=True)
    else:
        with getattr(main, "integration_lock", integration_lock):
            records = getattr(main, "integration_records", integration_records)
            records[user_id] = {**records.get(user_id, {}), **values}


def _delete_integration_fields(user_id: str, fields: list[str]) -> None:
    coll = getattr(main, "integration_collection", None)
    if coll is not None:
        coll.update_one({"user_id": user_id}, {"$unset": {field: "" for field in fields}})
    else:
        with getattr(main, "integration_lock", integration_lock):
            records = getattr(main, "integration_records", integration_records)
            record = records.get(user_id, {})
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
