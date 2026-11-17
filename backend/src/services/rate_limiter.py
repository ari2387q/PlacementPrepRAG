import threading
import time
from fastapi import HTTPException, Request

RATE_LIMITS = {
    "/auth/google": (10, 60),
    "/query": (30, 60),
    "/query/stream": (20, 60),
    "/upload": (5, 60),
    "/document/query": (30, 60),
    "/document/query/stream": (20, 60),
    "/document/generate-quiz": (10, 60),
    "/document/score-resume": (10, 60),
    "/integrations/github/connect": (5, 60),
    "/integrations/github/callback": (10, 60),
    "/integrations/github": (20, 60),
    "/integrations/leetcode": (20, 60),
}

rate_windows: dict[tuple[str, str], list[float]] = {}
rate_lock = threading.Lock()


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
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Try again shortly.",
                headers={"Retry-After": str(retry_after)},
            )
        events.append(now)
        rate_windows[key] = events
