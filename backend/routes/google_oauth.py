"""
Google Workspace / Google OAuth login for RefexOne (OIDC + PKCE).

Mirrors the Azure AD multi-config pattern: one OAuth client per company/domain set.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("google_oauth")

COLLECTION = "google_oauth_configs"
OAUTH_STATES = "google_oauth_states"
DEFAULT_SCOPES = ["openid", "profile", "email"]

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleOAuthConfigCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    client_id: str = Field(..., min_length=1)
    client_secret: str = Field(..., min_length=1)
    email_domains: List[str] = Field(default_factory=list)
    hosted_domain: Optional[str] = None  # Google Workspace domain hint (hd=)
    redirect_uri: Optional[str] = None
    scopes: List[str] = Field(default_factory=lambda: list(DEFAULT_SCOPES))
    status: str = "active"  # active | disabled


class GoogleOAuthConfigUpdate(BaseModel):
    label: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    email_domains: Optional[List[str]] = None
    hosted_domain: Optional[str] = None
    redirect_uri: Optional[str] = None
    scopes: Optional[List[str]] = None
    status: Optional[str] = None


def _normalize_domains(domains: Optional[List[str]]) -> List[str]:
    out: List[str] = []
    seen = set()
    for d in domains or []:
        dom = (d or "").strip().lower().lstrip("@")
        if not dom or dom in seen:
            continue
        seen.add(dom)
        out.append(dom)
    return out


def _public_base(public_url: str, request: Request) -> str:
    base = (public_url or "").rstrip("/")
    if base:
        return base
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost"
    if proto == "http" and "localhost" not in host and "127.0.0.1" not in host:
        proto = "https"
    return f"{proto}://{host}".rstrip("/")


def _default_redirect(public_url: str, request: Request) -> str:
    return f"{_public_base(public_url, request)}/api/auth/google/callback"


def _frontend_login_url(public_url: str, request: Request) -> str:
    return f"{_public_base(public_url, request)}/login"


def _sanitize(doc: dict) -> dict:
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "_id"}
    secret = out.pop("client_secret", None)
    out["has_secret"] = bool(secret)
    return out


def _pkce_pair():
    verifier = secrets.token_urlsafe(64)[:128]
    challenge = hashlib.sha256(verifier.encode("ascii")).digest()
    import base64

    challenge_b64 = base64.urlsafe_b64encode(challenge).decode("ascii").rstrip("=")
    return verifier, challenge_b64


def register_google_oauth_routes(
    api_router: APIRouter,
    get_current_user,
    db,
    *,
    create_token,
    log_audit,
    normalize_email,
    jwt_secret: str,
    public_url: str = "",
):
    def _require_admin(user: dict):
        if user.get("role") not in ("org_admin", "admin", "super_admin", "owner"):
            raise HTTPException(status_code=403, detail="Admin only")

    async def _domain_conflict(
        org_id: str, domains: List[str], exclude_id: Optional[str] = None
    ):
        if not domains:
            return
        query: Dict[str, Any] = {
            "org_id": org_id,
            "status": "active",
            "email_domains": {"$in": domains},
        }
        if exclude_id:
            query["id"] = {"$ne": exclude_id}
        conflict = await db[COLLECTION].find_one(query, {"_id": 0, "id": 1, "label": 1, "email_domains": 1})
        if conflict:
            overlap = sorted(set(domains) & set(conflict.get("email_domains") or []))
            raise HTTPException(
                status_code=409,
                detail=f"Email domain(s) {', '.join(overlap)} already used by '{conflict.get('label')}'",
            )

    @api_router.get("/google-oauth/configs")
    async def list_google_oauth_configs(user: dict = Depends(get_current_user)):
        _require_admin(user)
        docs = await db[COLLECTION].find(
            {"org_id": user["org_id"]}, {"_id": 0, "client_secret": 0}
        ).sort("created_at", -1).to_list(200)
        full = await db[COLLECTION].find(
            {"org_id": user["org_id"]}, {"_id": 0, "id": 1, "client_secret": 1}
        ).to_list(200)
        secret_map = {d["id"]: bool(d.get("client_secret")) for d in full}
        for d in docs:
            d["has_secret"] = secret_map.get(d["id"], False)
        return docs

    @api_router.post("/google-oauth/configs")
    async def create_google_oauth_config(
        body: GoogleOAuthConfigCreate,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        domains = _normalize_domains(body.email_domains)
        await _domain_conflict(user["org_id"], domains)

        redirect = (body.redirect_uri or "").strip() or _default_redirect(public_url, request)
        hosted = (body.hosted_domain or "").strip().lower().lstrip("@") or None
        config_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": config_id,
            "org_id": user["org_id"],
            "label": body.label.strip(),
            "client_id": body.client_id.strip(),
            "client_secret": body.client_secret.strip(),
            "email_domains": domains,
            "hosted_domain": hosted,
            "redirect_uri": redirect,
            "scopes": body.scopes or list(DEFAULT_SCOPES),
            "status": body.status if body.status in ("active", "disabled") else "active",
            "created_at": now,
            "updated_at": now,
            "created_by": user.get("email"),
        }
        await db[COLLECTION].insert_one(doc)
        await log_audit(
            user["org_id"],
            "google_oauth_config_created",
            "google_oauth",
            user["id"],
            user.get("email"),
            config_id,
            {"label": doc["label"], "hosted_domain": hosted},
            request.client.host if request.client else None,
        )
        return _sanitize(doc)

    @api_router.put("/google-oauth/configs/{config_id}")
    async def update_google_oauth_config(
        config_id: str,
        body: GoogleOAuthConfigUpdate,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        existing = await db[COLLECTION].find_one(
            {"id": config_id, "org_id": user["org_id"]}, {"_id": 0}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Google OAuth config not found")

        update: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if body.label is not None:
            update["label"] = body.label.strip()
        if body.client_id is not None:
            update["client_id"] = body.client_id.strip()
        if body.client_secret is not None and body.client_secret.strip():
            update["client_secret"] = body.client_secret.strip()
        if body.email_domains is not None:
            domains = _normalize_domains(body.email_domains)
            status = body.status or existing.get("status") or "active"
            if status == "active":
                await _domain_conflict(user["org_id"], domains, exclude_id=config_id)
            update["email_domains"] = domains
        if body.hosted_domain is not None:
            hd = (body.hosted_domain or "").strip().lower().lstrip("@")
            update["hosted_domain"] = hd or None
        if body.redirect_uri is not None and body.redirect_uri.strip():
            update["redirect_uri"] = body.redirect_uri.strip()
        if body.scopes is not None:
            update["scopes"] = body.scopes or list(DEFAULT_SCOPES)
        if body.status is not None:
            if body.status not in ("active", "disabled"):
                raise HTTPException(status_code=400, detail="status must be active or disabled")
            if body.status == "active":
                domains = update.get("email_domains", existing.get("email_domains") or [])
                await _domain_conflict(user["org_id"], domains, exclude_id=config_id)
            update["status"] = body.status

        await db[COLLECTION].update_one(
            {"id": config_id, "org_id": user["org_id"]}, {"$set": update}
        )
        await log_audit(
            user["org_id"],
            "google_oauth_config_updated",
            "google_oauth",
            user["id"],
            user.get("email"),
            config_id,
            {"fields": [k for k in update.keys() if k not in ("updated_at", "client_secret")]},
            request.client.host if request.client else None,
        )
        doc = await db[COLLECTION].find_one({"id": config_id}, {"_id": 0})
        return _sanitize(doc)

    @api_router.delete("/google-oauth/configs/{config_id}")
    async def delete_google_oauth_config(
        config_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        existing = await db[COLLECTION].find_one(
            {"id": config_id, "org_id": user["org_id"]}, {"_id": 0, "label": 1}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Google OAuth config not found")
        await db[COLLECTION].delete_one({"id": config_id, "org_id": user["org_id"]})
        await log_audit(
            user["org_id"],
            "google_oauth_config_deleted",
            "google_oauth",
            user["id"],
            user.get("email"),
            config_id,
            {"label": existing.get("label")},
            request.client.host if request.client else None,
        )
        return {"message": "Deleted"}

    @api_router.get("/google-oauth/callback-url")
    async def get_google_callback_url(
        request: Request, user: dict = Depends(get_current_user)
    ):
        _require_admin(user)
        base = _public_base(public_url, request)
        return {
            "redirect_uri": _default_redirect(public_url, request),
            "logout_url": _frontend_login_url(public_url, request),
            "setup_guide_url": f"{base}/google-workspace-setup.html",
        }

    @api_router.get("/google-oauth/providers")
    async def list_google_providers():
        """Public: active Google configs for the login page (no secrets)."""
        docs = await db[COLLECTION].find(
            {"status": "active"},
            {"_id": 0, "id": 1, "label": 1, "email_domains": 1},
        ).sort("label", 1).to_list(200)
        return docs

    async def _resolve_config(config_id: Optional[str], domain: Optional[str]):
        cfg = None
        if config_id:
            cfg = await db[COLLECTION].find_one(
                {"id": config_id, "status": "active"}, {"_id": 0}
            )
        elif domain:
            dom = (domain or "").strip().lower().lstrip("@")
            if "@" in (domain or ""):
                email = normalize_email(domain)
                dom = email.split("@")[-1] if "@" in email else dom
            cfg = await db[COLLECTION].find_one(
                {"status": "active", "email_domains": dom}, {"_id": 0}
            )
        if not cfg:
            all_active = await db[COLLECTION].find(
                {"status": "active"}, {"_id": 0}
            ).to_list(5)
            if len(all_active) == 1 and not config_id and not domain:
                cfg = all_active[0]
        return cfg

    @api_router.get("/auth/google/login")
    async def google_login_start(
        request: Request,
        config_id: Optional[str] = Query(None),
        domain: Optional[str] = Query(None),
    ):
        cfg = await _resolve_config(config_id, domain)
        if not cfg:
            login_url = _frontend_login_url(public_url, request)
            return RedirectResponse(
                f"{login_url}?google_error={urllib.parse.quote('Select a Google organization')}",
                status_code=302,
            )

        verifier, challenge = _pkce_pair()
        state = secrets.token_urlsafe(32)
        redirect_uri = cfg.get("redirect_uri") or _default_redirect(public_url, request)
        scopes = " ".join(cfg.get("scopes") or DEFAULT_SCOPES)

        await db[OAUTH_STATES].insert_one(
            {
                "state": state,
                "config_id": cfg["id"],
                "org_id": cfg["org_id"],
                "code_verifier": verifier,
                "redirect_uri": redirect_uri,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            }
        )

        params = {
            "client_id": cfg["client_id"],
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "online",
            "prompt": "select_account",
        }
        hosted = (cfg.get("hosted_domain") or "").strip()
        if hosted:
            params["hd"] = hosted

        auth_url = GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)
        return RedirectResponse(auth_url, status_code=302)

    @api_router.get("/auth/google/callback")
    async def google_login_callback(
        request: Request,
        code: Optional[str] = Query(None),
        state: Optional[str] = Query(None),
        error: Optional[str] = Query(None),
        error_description: Optional[str] = Query(None),
    ):
        login_url = _frontend_login_url(public_url, request)

        def fail(msg: str):
            return RedirectResponse(
                f"{login_url}?google_error={urllib.parse.quote(msg)}", status_code=302
            )

        if error:
            return fail(error_description or error)
        if not code or not state:
            return fail("Missing authorization code")

        st = await db[OAUTH_STATES].find_one({"state": state}, {"_id": 0})
        if not st:
            return fail("Invalid or expired login state")

        await db[OAUTH_STATES].delete_one({"state": state})

        exp = st.get("expires_at")
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                if exp_dt < datetime.now(timezone.utc):
                    return fail("Login state expired — try again")
            except Exception:
                pass

        cfg = await db[COLLECTION].find_one({"id": st["config_id"]}, {"_id": 0})
        if not cfg or cfg.get("status") != "active":
            return fail("Google login configuration is not available")

        data = {
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": st.get("redirect_uri") or cfg.get("redirect_uri"),
            "code_verifier": st["code_verifier"],
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                token_res = await client.post(GOOGLE_TOKEN_URL, data=data)
        except Exception as e:
            logger.exception("Google token exchange failed: %s", e)
            return fail("Could not reach Google login")

        if token_res.status_code != 200:
            detail = token_res.text[:300]
            logger.error("Google token error: %s", detail)
            return fail("Google token exchange failed")

        token_payload = token_res.json()
        id_token = token_payload.get("id_token")
        if not id_token:
            return fail("No ID token returned from Google")

        try:
            claims = pyjwt.decode(
                id_token,
                options={"verify_signature": False, "verify_aud": False, "verify_exp": True},
                algorithms=["RS256", "HS256"],
            )
        except Exception as e:
            logger.error("Google ID token decode failed: %s", e)
            return fail("Invalid ID token")

        if claims.get("aud") != cfg["client_id"]:
            return fail("Token audience mismatch")

        email = normalize_email(claims.get("email") or "")
        if not email or "@" not in email:
            return fail("Google account did not return an email address")

        if claims.get("email_verified") is False:
            return fail("Google email is not verified")

        domain = email.split("@")[-1]
        allowed = cfg.get("email_domains") or []
        if allowed and domain not in allowed:
            return fail(f"Email domain @{domain} is not allowed for this Google login")

        hosted = (cfg.get("hosted_domain") or "").strip().lower()
        token_hd = (claims.get("hd") or "").strip().lower()
        if hosted and token_hd and token_hd != hosted:
            return fail(f"Google account is not from workspace @{hosted}")

        import re as _re

        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user:
            user = await db.users.find_one(
                {"email": {"$regex": f"^{_re.escape(email)}$", "$options": "i"}},
                {"_id": 0},
            )

        if not user:
            return fail(
                "No RefexOne account found for this Google email. Contact your admin."
            )
        if user.get("status") != "active":
            return fail("Your RefexOne account is not active")
        if user.get("org_id") != cfg.get("org_id"):
            return fail("Google account is not linked to this organization")

        await db.users.update_one(
            {"id": user["id"]},
            {
                "$set": {
                    "google_sub": claims.get("sub"),
                    "google_hd": token_hd or None,
                    "google_config_id": cfg["id"],
                    "last_google_login_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        token = create_token(user["id"], user["email"], user["org_id"], user["role"])
        await log_audit(
            user["org_id"],
            "user_login_google",
            "user",
            user["id"],
            user["email"],
            user["id"],
            {"google_config_id": cfg["id"], "label": cfg.get("label")},
            request.client.host if request.client else None,
        )

        return RedirectResponse(
            f"{login_url}?google_token={urllib.parse.quote(token)}",
            status_code=302,
        )
