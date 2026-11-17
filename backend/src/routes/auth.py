from fastapi import APIRouter, Request
from src.models import GoogleAuthRequest
from src.services.auth_service import verify_google_token
from src.services.rate_limiter import enforce_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google")
def google_auth(request: Request, payload: GoogleAuthRequest):
    """Verify GIS identity; return only claims validated against our client ID."""
    enforce_rate_limit(request)
    claims = verify_google_token(payload.id_token)
    return {
        "sub": claims["sub"],
        "email": claims["email"],
        "name": claims.get("name", ""),
        "picture": claims.get("picture", ""),
    }
