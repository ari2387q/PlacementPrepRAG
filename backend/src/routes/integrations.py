import os
import secrets
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode, urlparse
from fastapi import APIRouter, HTTPException, Request
import main
from src.models import LeetCodeManualStats
from src.services.rate_limiter import enforce_rate_limit

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.post("/github/connect")
def github_connect(request: Request):
    user = main.google_user_from_request(request)
    enforce_rate_limit(request, user)
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    redirect_uri = os.getenv("GITHUB_REDIRECT_URI", "").strip()
    if not client_id or not redirect_uri:
        raise HTTPException(status_code=503, detail="GitHub integration is not configured")
    main._token_cipher()
    state = secrets.token_urlsafe(32)
    with main.integration_lock:
        now = time.time()
        for key, (_, expiry) in list(main.github_oauth_states.items()):
            if expiry <= now:
                main.github_oauth_states.pop(key, None)
        main.github_oauth_states[state] = (user["sub"], now + 600)
    params = urlencode({"client_id": client_id, "redirect_uri": redirect_uri, "scope": "read:user", "state": state})
    return {"authorization_url": f"https://github.com/login/oauth/authorize?{params}"}


@router.get("/github/callback")
def github_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    enforce_rate_limit(request)
    if error or not code or not state:
        return main._github_redirect("failed")
    with main.integration_lock:
        state_data = main.github_oauth_states.pop(state, None)
    if not state_data or state_data[1] <= time.time():
        return main._github_redirect("failed")
    user_id = state_data[0]
    client_id = os.getenv("GITHUB_CLIENT_ID", "").strip()
    client_secret = os.getenv("GITHUB_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GITHUB_REDIRECT_URI", "").strip()
    if not client_id or not client_secret or not redirect_uri:
        return main._github_redirect("failed")
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
            return main._github_redirect("failed")
        profile = main._github_api("/user", access_token)
        encrypted = main._token_cipher().encrypt(access_token.encode()).decode()
        main._save_integration_doc(user_id, {
            "github_token": encrypted,
            "github_profile": {"login": profile.get("login", ""), "name": profile.get("name") or profile.get("login", ""), "avatar_url": profile.get("avatar_url", ""), "html_url": profile.get("html_url", "")},
            "github_cached_at": 0,
        })
        return main._github_redirect("connected")
    except Exception as exc:  # noqa: BLE001
        print(f"[WARN] GitHub OAuth callback failed: {type(exc).__name__}")
        return main._github_redirect("failed")


@router.get("/github")
def github_dashboard(request: Request, refresh: bool = False):
    user = main.google_user_from_request(request)
    enforce_rate_limit(request, user)
    record = main._integration_doc(user["sub"])
    encrypted = record.get("github_token")
    if not encrypted:
        return {"connected": False}
    cipher = main._token_cipher()
    try:
        token = cipher.decrypt(encrypted.encode()).decode()
    except Exception as exc:
        print(f"[WARN] Stored GitHub token could not be decrypted: {type(exc).__name__}")
        main._delete_integration_fields(user["sub"], ["github_token", "github_profile", "github_summary", "github_cached_at"])
        raise HTTPException(status_code=503, detail="GitHub connection needs to be set up again") from exc
    cached_at = record.get("github_cached_at", 0)
    summary = record.get("github_summary")
    if summary and not refresh and time.time() - float(cached_at or 0) < 900:
        return {"connected": True, "profile": record.get("github_profile", {}), **summary, "cached": True}
    try:
        profile = main._github_api("/user", token)
        repos = main._github_api("/user/repos?visibility=public&affiliation=owner&sort=pushed&per_page=10", token)
        event_list = main._github_api(f"/users/{profile.get('login', '')}/events/public?per_page=100", token)
        now = datetime.now(UTC)
        contributions = {}
        contribution_error = False
        try:
            contributions = main._github_contributions(token, profile.get("login", ""), (now - timedelta(days=365)).isoformat(), now.isoformat())
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
        main._save_integration_doc(user["sub"], {"github_token": encrypted, "github_profile": safe_profile, "github_summary": summary, "github_cached_at": time.time()})
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


@router.delete("/github")
def github_disconnect(request: Request):
    user = main.google_user_from_request(request)
    enforce_rate_limit(request, user)
    main._delete_integration_fields(user["sub"], ["github_token", "github_profile", "github_summary", "github_cached_at"])
    return {"connected": False}


@router.get("/leetcode")
def leetcode_manual_stats(request: Request):
    user = main.google_user_from_request(request)
    enforce_rate_limit(request, user)
    stats = main._integration_doc(user["sub"]).get("leetcode_manual")
    return {"connected": bool(stats), "stats": stats, "source": "user-entered" if stats else None}


@router.put("/leetcode")
def save_leetcode_manual_stats(payload: LeetCodeManualStats, request: Request):
    user = main.google_user_from_request(request)
    enforce_rate_limit(request, user)
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
    main._save_integration_doc(user["sub"], {"leetcode_manual": stats})
    return {"connected": True, "stats": stats, "source": "user-entered"}


@router.delete("/leetcode")
def delete_leetcode_manual_stats(request: Request):
    user = main.google_user_from_request(request)
    enforce_rate_limit(request, user)
    main._delete_integration_fields(user["sub"], ["leetcode_manual"])
    return {"connected": False}
