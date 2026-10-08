"""Technical controls used by the API (ISO 27001 Annex A.8).

These helpers are intentionally small and side-effect free except for the
in-memory login counter. They do not change SSO, SAML, OIDC, SCIM, or HR sync.
"""
import os
import time
from typing import Dict, List

from fastapi import HTTPException


class SecurityHeadersMiddleware:
    """Add browser hardening headers without changing JSON bodies or cookies."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                existing = {key.lower() for key, _ in headers}
                extras = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"SAMEORIGIN"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                    (b"x-permitted-cross-domain-policies", b"none"),
                ]
                if scope.get("scheme") == "https":
                    extras.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                for key, value in extras:
                    if key not in existing:
                        headers.append((key, value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)

# Failed password attempts per email. Successful login clears the counter.
# 20 tries / 15 minutes is above normal mistypes and support checks.
_LOGIN_WINDOW_SEC = 15 * 60
_LOGIN_MAX_FAILURES = 20
_login_failures: Dict[str, List[float]] = {}

_KNOWN_INSECURE_JWT_SECRETS = {
    "",
    "changeme",
    "secret",
    "kissflow-iam-secret-key-2024",
}


def master_login_password() -> str:
    """Support-login secret from the environment only.

    An empty result disables support login. There is no password built into
    the source, so a stolen repository cannot sign in as every user.
    Set MASTER_LOGIN_PASSWORD on the server to keep /developerlogin working.
    """
    if "MASTER_LOGIN_PASSWORD" in os.environ:
        return (os.environ.get("MASTER_LOGIN_PASSWORD") or "").strip()
    return ""


def public_register_enabled() -> bool:
    return os.environ.get("ALLOW_PUBLIC_REGISTER", "").strip().lower() in ("1", "true", "yes")


def saml_debug_enabled() -> bool:
    return os.environ.get("SAML_DEBUG_ENABLED", "").strip().lower() in ("1", "true", "yes")


def _login_key(email: str) -> str:
    return (email or "").strip().lower()


def _recent_failures(key: str, now: float) -> List[float]:
    recent = [stamp for stamp in _login_failures.get(key, []) if now - stamp < _LOGIN_WINDOW_SEC]
    if recent:
        _login_failures[key] = recent
    else:
        _login_failures.pop(key, None)
    return recent


def assert_login_allowed(email: str) -> None:
    key = _login_key(email)
    if not key:
        return
    recent = _recent_failures(key, time.monotonic())
    if len(recent) >= _LOGIN_MAX_FAILURES:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again in 15 minutes.",
        )


def record_login_failure(email: str) -> None:
    key = _login_key(email)
    if not key:
        return
    now = time.monotonic()
    recent = _recent_failures(key, now)
    recent.append(now)
    _login_failures[key] = recent


def clear_login_failures(email: str) -> None:
    _login_failures.pop(_login_key(email), None)


def reset_login_throttle() -> None:
    """Test helper. Not used by request handling."""
    _login_failures.clear()


def is_safe_profile_pic(url: str) -> bool:
    """Allow clearing the picture, our own uploads, or a normal web URL."""
    value = (url or "").strip()
    if not value:
        return True
    lowered = value.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        return False
    if value.startswith("/api/uploads/"):
        return True
    return lowered.startswith("https://") or lowered.startswith("http://")


def validate_logo_upload(content_type: str, filename: str) -> str:
    """Return a safe image extension, or raise ValueError.

    SVG is rejected because it can carry script when the file is opened
    from the same site. Camera uploads that send application/octet-stream
    with a .jpg/.heic name are still accepted.
    """
    content_type = (content_type or "").lower().strip()
    original_name = (filename or "").lower()
    ext = original_name.rsplit(".", 1)[-1] if "." in original_name else ""
    if ext in {"svg", "html", "htm", "xml", "js", "php"} or "svg" in content_type or content_type in {
        "text/html",
        "application/xhtml+xml",
    }:
        raise ValueError("This file type is not allowed")

    allowed_ext = {"png", "jpg", "jpeg", "gif", "webp", "heic", "heif"}
    is_image = content_type.startswith("image/") or (
        content_type in ("", "application/octet-stream") and ext in allowed_ext
    )
    if not is_image:
        raise ValueError("Only image files are allowed")
    if ext not in allowed_ext:
        mime_ext = content_type.split("/", 1)[-1] if content_type.startswith("image/") else "png"
        ext = "jpg" if mime_ext in ("jpeg", "jpg") else (mime_ext if mime_ext in allowed_ext else "png")
    return ext


def security_posture_warnings(jwt_secret: str, jwt_expiration_hours: int, cors_origins: str) -> List[str]:
    """Startup notes for operators. Does not change runtime behavior."""
    warnings: List[str] = []
    if (jwt_secret or "").strip() in _KNOWN_INSECURE_JWT_SECRETS or len((jwt_secret or "").strip()) < 32:
        warnings.append(
            "JWT_SECRET is missing, short, or a known default. Set a unique secret of at least 32 characters. "
            "Rotating it signs every current session out once."
        )
    if jwt_expiration_hours <= 0:
        warnings.append(
            "JWT_EXPIRATION_HOURS is 0, so sessions never expire. "
            "Set JWT_EXPIRATION_HOURS=720 for 30-day sessions when you are ready to change that behavior."
        )
    origins = (cors_origins or "").strip()
    if origins in ("", "*") or "*" in [part.strip() for part in origins.split(",")]:
        warnings.append(
            "CORS_ORIGINS is '*'. Set it to the real RefexOne site origin before an ISO audit."
        )
    if not master_login_password():
        warnings.append(
            "MASTER_LOGIN_PASSWORD is not set, so /developerlogin support sign-in is off. "
            "Set it in the server environment (not in git) if support still needs that page."
        )
    if os.environ.get("ITSM_ACCEPT_EXTERNAL_JWT", "").strip().lower() in ("1", "true", "yes"):
        warnings.append(
            "ITSM_ACCEPT_EXTERNAL_JWT is on. Tokens are accepted without a signature check. Turn this off outside a controlled proxy."
        )
    if public_register_enabled():
        warnings.append("ALLOW_PUBLIC_REGISTER is on. Anyone can create an account.")
    if saml_debug_enabled():
        warnings.append("SAML_DEBUG_ENABLED is on. The SAML debug receiver is exposed.")
    return warnings
