import hashlib
import os
import threading
import time
from fastapi import HTTPException, Request

google_token_cache: dict[str, tuple[int, dict]] = {}
google_token_lock = threading.Lock()


def verify_google_token(raw_token: str) -> dict:
    """Verify a GIS ID token; never trust decoded-but-unverified claims."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    token_key = hashlib.sha256(raw_token.encode()).hexdigest()
    now = int(time.time())
    with google_token_lock:
        cached = google_token_cache.get(token_key)
        if cached and cached[0] > now:
            return cached[1].copy()
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        google_request = google_requests.Request()

        def request_google_keys(url, method="GET", body=None, headers=None, **kwargs):
            return google_request(url, method=method, body=body, headers=headers, timeout=5, **kwargs)

        claims = id_token.verify_oauth2_token(raw_token, request_google_keys, client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired Google token") from exc
    except Exception as exc:
        print(f"[WARN] Google token verification unavailable: {type(exc).__name__}")
        raise HTTPException(status_code=503, detail="Google token verification is temporarily unavailable") from exc

    if not claims.get("sub") or not claims.get("email") or not claims.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google account must have a verified email")
    expiry = int(claims.get("exp", 0))
    with google_token_lock:
        for stale_key, (stale_expiry, _) in list(google_token_cache.items()):
            if stale_expiry <= now:
                google_token_cache.pop(stale_key, None)
        if len(google_token_cache) >= 2000:
            oldest_key = min(google_token_cache, key=lambda key: google_token_cache[key][0])
            google_token_cache.pop(oldest_key, None)
        google_token_cache[token_key] = (expiry, claims.copy())
    return claims


def google_user_from_request(request: Request, *, optional: bool = False) -> dict | None:
    authorization = request.headers.get("authorization", "")
    if not authorization:
        if optional:
            return None
        raise HTTPException(status_code=401, detail="Sign in with Google to access this data")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    import main
    return main.verify_google_token(token)
