"""
Google Workspace / Google OAuth login for RefexOne (OIDC + PKCE).

Mirrors the Azure AD multi-config pattern: one OAuth client per company/domain set.
User sync uses Admin Directory API via service account + domain-wide delegation.
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
import time
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
SYNC_LOGS = "google_oauth_sync_logs"
DEFAULT_SCOPES = ["openid", "profile", "email"]
DIRECTORY_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly"

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
DIRECTORY_USERS_URL = "https://admin.googleapis.com/admin/directory/v1/users"


class GoogleOAuthConfigCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    client_id: str = Field(..., min_length=1)
    client_secret: str = Field(..., min_length=1)
    email_domains: List[str] = Field(default_factory=list)
    hosted_domain: Optional[str] = None  # Google Workspace domain hint (hd=)
    redirect_uri: Optional[str] = None
    scopes: List[str] = Field(default_factory=lambda: list(DEFAULT_SCOPES))
    status: str = "active"  # active | disabled
    sync_admin_email: Optional[str] = None
    service_account_json: Optional[str] = None


class GoogleOAuthConfigUpdate(BaseModel):
    label: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    email_domains: Optional[List[str]] = None
    hosted_domain: Optional[str] = None
    redirect_uri: Optional[str] = None
    scopes: Optional[List[str]] = None
    status: Optional[str] = None
    sync_admin_email: Optional[str] = None
    service_account_json: Optional[str] = None


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
    sa = out.pop("service_account_json", None)
    out["has_secret"] = bool(secret)
    out["has_service_account"] = bool(sa)
    if out.get("sync_admin_email"):
        out["sync_admin_email"] = out["sync_admin_email"]
    return out


def _parse_service_account(raw) -> dict:
    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Service account JSON is required for user sync",
        )
    if isinstance(raw, dict):
        sa = raw
    else:
        try:
            sa = json.loads(raw)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid service account JSON: {e}") from e
    if not sa.get("client_email") or not sa.get("private_key"):
        raise HTTPException(
            status_code=400,
            detail="Service account JSON must include client_email and private_key",
        )
    return sa


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
            {"org_id": user["org_id"]},
            {"_id": 0, "client_secret": 0, "service_account_json": 0},
        ).sort("created_at", -1).to_list(200)
        full = await db[COLLECTION].find(
            {"org_id": user["org_id"]},
            {"_id": 0, "id": 1, "client_secret": 1, "service_account_json": 1},
        ).to_list(200)
        flags = {
            d["id"]: {
                "has_secret": bool(d.get("client_secret")),
                "has_service_account": bool(d.get("service_account_json")),
            }
            for d in full
        }
        for d in docs:
            f = flags.get(d["id"], {})
            d["has_secret"] = f.get("has_secret", False)
            d["has_service_account"] = f.get("has_service_account", False)
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
        sync_admin = normalize_email(body.sync_admin_email or "") or None
        sa_json = None
        if body.service_account_json and body.service_account_json.strip():
            # Validate shape on create
            _parse_service_account(body.service_account_json.strip())
            sa_json = body.service_account_json.strip()
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
            "sync_admin_email": sync_admin,
            "service_account_json": sa_json,
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
        if body.sync_admin_email is not None:
            sync_admin = normalize_email(body.sync_admin_email or "") or None
            update["sync_admin_email"] = sync_admin
        if body.service_account_json is not None and body.service_account_json.strip():
            _parse_service_account(body.service_account_json.strip())
            update["service_account_json"] = body.service_account_json.strip()

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
            {
                "fields": [
                    k
                    for k in update.keys()
                    if k not in ("updated_at", "client_secret", "service_account_json")
                ]
            },
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

    # ---------- Pull users from Google Admin Directory ----------

    async def _directory_access_token(cfg: dict) -> str:
        admin = (cfg.get("sync_admin_email") or "").strip()
        if not admin:
            raise HTTPException(
                status_code=400,
                detail="Set Sync admin email (Workspace admin to impersonate) on this Google config",
            )
        sa = _parse_service_account(cfg.get("service_account_json"))
        now = int(time.time())
        assertion = {
            "iss": sa["client_email"],
            "scope": DIRECTORY_SCOPE,
            "aud": GOOGLE_TOKEN_URL,
            "iat": now,
            "exp": now + 3600,
            "sub": admin,
        }
        try:
            signed = pyjwt.encode(assertion, sa["private_key"], algorithm="RS256")
            if isinstance(signed, bytes):
                signed = signed.decode("ascii")
        except Exception as e:
            logger.exception("Google SA JWT sign failed: %s", e)
            raise HTTPException(
                status_code=400,
                detail=f"Failed to sign service account JWT: {e}",
            ) from e

        data = {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": signed,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(GOOGLE_TOKEN_URL, data=data)
        if res.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Failed to get Directory token. Enable Admin SDK API, domain-wide "
                    "delegation for the service account Client ID with scope "
                    f"{DIRECTORY_SCOPE}, and use a Workspace admin email. "
                    f"Google said: {res.text[:240]}"
                ),
            )
        return res.json()["access_token"]

    async def _directory_list_users(access_token: str, cfg: dict) -> List[dict]:
        headers = {"Authorization": f"Bearer {access_token}"}
        domain = (
            (cfg.get("hosted_domain") or "").strip().lower().lstrip("@")
            or ((cfg.get("email_domains") or [None])[0])
        )
        params: Dict[str, Any] = {"maxResults": 500, "orderBy": "email"}
        if domain:
            params["domain"] = domain
        else:
            params["customer"] = "my_customer"

        users: List[dict] = []
        page_token = None
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                q = dict(params)
                if page_token:
                    q["pageToken"] = page_token
                res = await client.get(DIRECTORY_USERS_URL, headers=headers, params=q)
                if res.status_code != 200:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Directory users list failed: {res.text[:300]}",
                    )
                payload = res.json()
                users.extend(payload.get("users") or [])
                page_token = payload.get("nextPageToken")
                if not page_token:
                    break
        return users

    def _pick_google_email(guser: dict) -> str:
        primary = (guser.get("primaryEmail") or "").strip().lower()
        if primary and "@" in primary:
            return primary
        for item in guser.get("emails") or []:
            addr = (item.get("address") or "").strip().lower()
            if addr and "@" in addr:
                return addr
        return ""

    @api_router.post("/google-oauth/configs/{config_id}/sync-users")
    async def sync_users_from_google_workspace(
        config_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        """
        Pull users from Google Workspace Admin Directory into RefexOne.
        Requires service account JSON + sync_admin_email with domain-wide
        delegation for admin.directory.user.readonly.
        """
        _require_admin(user)
        cfg = await db[COLLECTION].find_one(
            {"id": config_id, "org_id": user["org_id"]}, {"_id": 0}
        )
        if not cfg:
            raise HTTPException(status_code=404, detail="Google OAuth config not found")
        if cfg.get("status") != "active":
            raise HTTPException(status_code=400, detail="Enable this Google config first")

        import bcrypt as _bcrypt
        import os as _os
        import re as _re

        result = {
            "config_id": config_id,
            "label": cfg.get("label"),
            "fetched": 0,
            "created": 0,
            "updated": 0,
            "disabled": 0,
            "skipped": 0,
            "errors": [],
        }

        try:
            access_token = await _directory_access_token(cfg)
            directory_users = await _directory_list_users(access_token, cfg)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Google user sync failed: %s", e)
            raise HTTPException(status_code=500, detail=str(e)) from e

        result["fetched"] = len(directory_users)
        allowed_domains = set(cfg.get("email_domains") or [])
        default_pw = _os.environ.get("DEFAULT_USER_PASSWORD", "Welcome@2026")
        password_hash = _bcrypt.hashpw(default_pw.encode(), _bcrypt.gensalt()).decode()
        now = datetime.now(timezone.utc).isoformat()
        disable_reason = "Disabled in Google Workspace sync"

        for guser in directory_users:
            try:
                email = normalize_email(_pick_google_email(guser))
                if not email or "@" not in email:
                    result["skipped"] += 1
                    continue
                domain = email.split("@")[-1].lower()
                if allowed_domains and domain not in allowed_domains:
                    result["skipped"] += 1
                    continue

                suspended = bool(guser.get("suspended"))
                name_info = guser.get("name") or {}
                given = (name_info.get("givenName") or "").strip()
                surname = (name_info.get("familyName") or "").strip()
                display = (name_info.get("fullName") or "").strip()
                name = display or f"{given} {surname}".strip() or email.split("@")[0]
                org_unit = (guser.get("orgUnitPath") or "").strip()
                orgs = guser.get("organizations") or []
                dept = ""
                title = ""
                company = cfg.get("label") or ""
                if orgs:
                    primary_org = next((o for o in orgs if o.get("primary")), orgs[0])
                    dept = (primary_org.get("department") or "")[:200]
                    title = (primary_org.get("title") or "")[:200]
                    company = (primary_org.get("name") or company)[:200]

                fields = {
                    "name": name,
                    "first_name": given or (name.split(" ", 1)[0] if name else ""),
                    "last_name": surname
                    or (name.split(" ", 1)[1] if name and " " in name else ""),
                    "designation": title,
                    "department": dept,
                    "company": company,
                    "location": org_unit[:200] if org_unit else "",
                    "google_user_id": guser.get("id"),
                    "google_sub": guser.get("id"),
                    "google_config_id": cfg["id"],
                    "google_hd": cfg.get("hosted_domain") or domain,
                    "source": "google_workspace",
                    "google_synced_at": now,
                }

                existing = await db.users.find_one(
                    {"email": email, "org_id": user["org_id"]}, {"_id": 0}
                )
                if not existing:
                    existing = await db.users.find_one(
                        {
                            "email": {"$regex": f"^{_re.escape(email)}$", "$options": "i"},
                            "org_id": user["org_id"],
                        },
                        {"_id": 0},
                    )
                if not existing and guser.get("id"):
                    existing = await db.users.find_one(
                        {
                            "org_id": user["org_id"],
                            "google_user_id": guser.get("id"),
                            "google_config_id": cfg["id"],
                        },
                        {"_id": 0},
                    )

                if existing:
                    update = dict(fields)
                    update["email"] = email
                    if suspended and existing.get("status") != "disabled":
                        update["status"] = "disabled"
                        update["disabled_at"] = now
                        update["disabled_reason"] = disable_reason
                        result["disabled"] += 1
                    elif (
                        not suspended
                        and existing.get("status") == "disabled"
                        and (existing.get("disabled_reason") or "").startswith(
                            "Disabled in Google Workspace"
                        )
                    ):
                        update["status"] = "active"
                        update["disabled_at"] = None
                        update["disabled_reason"] = None
                    await db.users.update_one({"id": existing["id"]}, {"$set": update})
                    result["updated"] += 1
                else:
                    if suspended:
                        result["skipped"] += 1
                        continue
                    new_user = {
                        "id": str(uuid.uuid4()),
                        "email": email,
                        "password": password_hash,
                        "role": "user",
                        "org_id": user["org_id"],
                        "group_ids": [],
                        "role_ids": [],
                        "status": "active",
                        "created_at": now,
                        **fields,
                    }
                    await db.users.insert_one(new_user)
                    result["created"] += 1
            except Exception as e:
                result["errors"].append(
                    f"{guser.get('primaryEmail') or guser.get('id')}: {e}"
                )
                if len(result["errors"]) > 50:
                    result["errors"].append("… truncated")
                    break

        await db[SYNC_LOGS].insert_one(
            {
                "id": str(uuid.uuid4()),
                "org_id": user["org_id"],
                "config_id": config_id,
                "label": cfg.get("label"),
                "triggered_by": user.get("email"),
                "timestamp": now,
                "result": {k: v for k, v in result.items() if k != "errors"}
                | {"error_count": len(result["errors"])},
            }
        )
        await log_audit(
            user["org_id"],
            "google_users_synced",
            "google_oauth",
            user["id"],
            user.get("email"),
            config_id,
            {
                "created": result["created"],
                "updated": result["updated"],
                "disabled": result["disabled"],
                "fetched": result["fetched"],
            },
            request.client.host if request.client else None,
        )
        return result

    @api_router.get("/google-oauth/sync-logs")
    async def list_google_sync_logs(user: dict = Depends(get_current_user)):
        _require_admin(user)
        logs = await db[SYNC_LOGS].find(
            {"org_id": user["org_id"]}, {"_id": 0}
        ).sort("timestamp", -1).to_list(50)
        return logs
