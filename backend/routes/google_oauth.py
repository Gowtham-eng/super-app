"""
Google Workspace / Google OAuth login for RefexOne (OIDC + PKCE).

Mirrors the Azure AD multi-config pattern: one OAuth client per company/domain set.
"""
from __future__ import annotations

import hashlib
import logging
import re
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

from services.sso_provision import create_registered_domain_user

logger = logging.getLogger("google_oauth")

COLLECTION = "google_oauth_configs"
OAUTH_STATES = "google_oauth_states"
DEFAULT_SCOPES = ["openid", "profile", "email"]

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


DIRECTORY_USER_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly"
LOGIN_PURPOSE = "login"
SYNC_PURPOSE = "directory_sync"
SYNC_PURPOSE_ALIASES = (SYNC_PURPOSE, "sync", "sync_only")


class GoogleOAuthConfigCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    client_id: str = ""
    client_secret: str = ""
    email_domains: List[str] = Field(default_factory=list)
    hosted_domain: Optional[str] = None  # Google Workspace domain hint (hd=)
    redirect_uri: Optional[str] = None
    scopes: List[str] = Field(default_factory=lambda: list(DEFAULT_SCOPES))
    status: str = "active"  # active | disabled
    directory_admin_email: Optional[str] = None
    service_account_json: Optional[str] = None
    purpose: str = LOGIN_PURPOSE  # login | directory_sync


class GoogleOAuthConfigUpdate(BaseModel):
    label: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    email_domains: Optional[List[str]] = None
    hosted_domain: Optional[str] = None
    redirect_uri: Optional[str] = None
    scopes: Optional[List[str]] = None
    status: Optional[str] = None
    directory_admin_email: Optional[str] = None
    service_account_json: Optional[str] = None
    purpose: Optional[str] = None


def config_purpose(doc: Optional[dict]) -> str:
    purpose = str((doc or {}).get("purpose") or LOGIN_PURPOSE).strip().lower()
    if purpose in SYNC_PURPOSE_ALIASES:
        return SYNC_PURPOSE
    return LOGIN_PURPOSE


def is_directory_sync(doc: Optional[dict]) -> bool:
    return config_purpose(doc) == SYNC_PURPOSE


def login_config_query() -> dict:
    """Active Google configs that can sign users in. Sync-only admins are excluded."""
    return {"status": "active", "purpose": {"$nin": list(SYNC_PURPOSE_ALIASES)}}


def pick_login_config_for_domain(configs: List[dict], domain: str) -> Optional[dict]:
    """Login config that should accept this company. Prefer one that already lists the domain, else RefexOne."""
    domain = (domain or "").strip().lower().lstrip("@")
    logins = [c for c in configs or [] if not is_directory_sync(c) and (c.get("status") or "active") == "active"]
    if not domain or not logins:
        return None
    for cfg in logins:
        if domain in _normalize_domains(cfg.get("email_domains") or []):
            return cfg
    for cfg in logins:
        if re.search(r"refex", str(cfg.get("label") or ""), re.I):
            return cfg
    return logins[0]


def _normalize_domains(domains: Optional[List[str]]) -> List[str]:
    """Split comma-separated domains and drop the space after each comma."""
    out: List[str] = []
    seen = set()
    for raw in domains or []:
        for piece in re.split(r"[,;\s]+", str(raw or "")):
            dom = piece.strip().lower().lstrip("@")
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
    sa = out.pop("service_account", None)
    out["has_secret"] = bool(secret)
    out["has_directory_key"] = bool(isinstance(sa, dict) and sa.get("private_key") and sa.get("client_email"))
    return out


def _parse_service_account(raw: str) -> dict:
    import json

    try:
        info = json.loads(raw or "")
    except Exception:
        raise HTTPException(status_code=400, detail="Service account file is not valid JSON")
    if not isinstance(info, dict):
        raise HTTPException(status_code=400, detail="Service account file is not valid JSON")
    if info.get("type") != "service_account" or not info.get("private_key") or not info.get("client_email"):
        raise HTTPException(status_code=400, detail="Upload a Google Cloud service-account JSON key")
    return info


def _directory_admin_email(raw: Optional[str]) -> str:
    email = (raw or "").strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Directory admin must be a Google Workspace admin email")
    return email


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
        org_id: str,
        domains: List[str],
        exclude_id: Optional[str] = None,
        purpose: str = LOGIN_PURPOSE,
    ):
        if not domains:
            return
        query: Dict[str, Any] = {
            "org_id": org_id,
            "status": "active",
            "email_domains": {"$in": domains},
        }
        if is_directory_sync({"purpose": purpose}):
            query["purpose"] = {"$in": list(SYNC_PURPOSE_ALIASES)}
        else:
            query["purpose"] = {"$nin": list(SYNC_PURPOSE_ALIASES)}
        if exclude_id:
            query["id"] = {"$ne": exclude_id}
        conflict = await db[COLLECTION].find_one(query, {"_id": 0, "id": 1, "label": 1, "email_domains": 1})
        if conflict:
            overlap = sorted(set(domains) & set(conflict.get("email_domains") or []))
            raise HTTPException(
                status_code=409,
                detail=f"Email domain(s) {', '.join(overlap)} already used by '{conflict.get('label')}'",
            )

    async def _grant_login_domain(org_id: str, domain: str):
        """Let the RefexOne Google login accept a company that is synced by a separate admin."""
        domain = (domain or "").strip().lower().lstrip("@")
        if not domain:
            return
        query = {"org_id": org_id}
        query.update(login_config_query())
        logins = await db[COLLECTION].find(query, {"_id": 0}).to_list(50)
        target = pick_login_config_for_domain(logins, domain)
        if not target:
            return
        domains = _normalize_domains(target.get("email_domains") or [])
        if domain in domains:
            return
        domains.append(domain)
        await db[COLLECTION].update_one(
            {"id": target["id"]},
            {"$set": {
                "email_domains": domains,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )

    @api_router.get("/google-oauth/configs")
    async def list_google_oauth_configs(user: dict = Depends(get_current_user)):
        _require_admin(user)
        docs = await db[COLLECTION].find(
            {"org_id": user["org_id"]}, {"_id": 0, "client_secret": 0, "service_account": 0}
        ).sort("created_at", -1).to_list(200)
        full = await db[COLLECTION].find(
            {"org_id": user["org_id"]},
            {"_id": 0, "id": 1, "client_secret": 1, "service_account.client_email": 1, "service_account.private_key": 1},
        ).to_list(200)
        secret_map = {d["id"]: bool(d.get("client_secret")) for d in full}
        key_map = {
            d["id"]: bool((d.get("service_account") or {}).get("private_key"))
            for d in full
        }
        for d in docs:
            d["has_secret"] = secret_map.get(d["id"], False)
            d["has_directory_key"] = key_map.get(d["id"], False)
        return docs

    @api_router.post("/google-oauth/configs")
    async def create_google_oauth_config(
        body: GoogleOAuthConfigCreate,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        purpose = config_purpose({"purpose": body.purpose})
        domains = _normalize_domains(body.email_domains)
        admin_email = None
        if (body.directory_admin_email or "").strip():
            admin_email = _directory_admin_email(body.directory_admin_email)
        if purpose == SYNC_PURPOSE:
            if not admin_email:
                raise HTTPException(status_code=400, detail="Directory admin email is required for user sync")
            sync_domain = admin_email.split("@", 1)[1]
            if sync_domain not in domains:
                domains.append(sync_domain)
        else:
            if not (body.client_id or "").strip() or not (body.client_secret or "").strip():
                raise HTTPException(status_code=400, detail="Client ID and Client Secret are required for Google login")
            if not domains:
                raise HTTPException(status_code=400, detail="Add at least one email domain")
        await _domain_conflict(user["org_id"], domains, purpose=purpose)

        redirect = (body.redirect_uri or "").strip() or _default_redirect(public_url, request)
        hosted = (body.hosted_domain or "").strip().lower().lstrip("@") or None
        config_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": config_id,
            "org_id": user["org_id"],
            "label": body.label.strip(),
            "purpose": purpose,
            "client_id": (body.client_id or "").strip(),
            "client_secret": (body.client_secret or "").strip(),
            "email_domains": domains,
            "hosted_domain": hosted,
            "redirect_uri": redirect,
            "scopes": body.scopes or list(DEFAULT_SCOPES),
            "status": body.status if body.status in ("active", "disabled") else "active",
            "directory_admin_email": admin_email,
            "created_at": now,
            "updated_at": now,
            "created_by": user.get("email"),
        }
        if (body.service_account_json or "").strip():
            doc["service_account"] = _parse_service_account(body.service_account_json)
        await db[COLLECTION].insert_one(doc)
        if purpose == SYNC_PURPOSE and doc.get("status") == "active" and admin_email:
            await _grant_login_domain(user["org_id"], admin_email.split("@", 1)[1])
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
        purpose = config_purpose(existing)
        if body.email_domains is not None:
            domains = _normalize_domains(body.email_domains)
            status = body.status or existing.get("status") or "active"
            if status == "active":
                await _domain_conflict(user["org_id"], domains, exclude_id=config_id, purpose=purpose)
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
                await _domain_conflict(user["org_id"], domains, exclude_id=config_id, purpose=purpose)
            update["status"] = body.status
        if body.directory_admin_email is not None:
            raw_admin = (body.directory_admin_email or "").strip()
            update["directory_admin_email"] = _directory_admin_email(raw_admin) if raw_admin else None
            if purpose == SYNC_PURPOSE and update["directory_admin_email"]:
                sync_domain = update["directory_admin_email"].split("@", 1)[1]
                domains = _normalize_domains(update.get("email_domains", existing.get("email_domains") or []))
                if sync_domain not in domains:
                    domains.append(sync_domain)
                    await _domain_conflict(user["org_id"], [sync_domain], exclude_id=config_id, purpose=purpose)
                update["email_domains"] = domains
        if body.service_account_json is not None and body.service_account_json.strip():
            update["service_account"] = _parse_service_account(body.service_account_json)

        await db[COLLECTION].update_one(
            {"id": config_id, "org_id": user["org_id"]}, {"$set": update}
        )
        admin_after = update.get("directory_admin_email", existing.get("directory_admin_email"))
        status_after = update.get("status", existing.get("status"))
        if purpose == SYNC_PURPOSE and status_after == "active" and admin_after and "@" in admin_after:
            await _grant_login_domain(user["org_id"], admin_after.split("@", 1)[1])
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

    def _directory_access_token(sa_info: dict, subject: str) -> str:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_info(
            sa_info,
            scopes=[DIRECTORY_USER_SCOPE],
            subject=subject,
        )
        creds.refresh(GoogleAuthRequest())
        if not creds.token:
            raise HTTPException(status_code=400, detail="Google did not return a directory token")
        return creds.token

    async def _list_directory_users(access_token: str, domain: str) -> List[dict]:
        url = "https://admin.googleapis.com/admin/directory/v1/users"
        params = {
            "domain": domain,
            "maxResults": 500,
            "orderBy": "email",
            "projection": "basic",
        }
        headers = {"Authorization": f"Bearer {access_token}"}
        users: List[dict] = []
        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                res = await client.get(url, headers=headers, params=params)
                if res.status_code != 200:
                    detail = res.text[:300]
                    if res.status_code == 403:
                        detail = (
                            f"{subject_hint(domain)} Google refused the directory read. "
                            "The directory admin must be a super admin of that company, and "
                            "domain-wide delegation must include "
                            f"{DIRECTORY_USER_SCOPE}. Google said: {res.text[:180]}"
                        )
                    raise HTTPException(status_code=400, detail=detail)
                payload = res.json()
                users.extend(payload.get("users") or [])
                token = payload.get("nextPageToken")
                if not token:
                    break
                params = {"domain": domain, "maxResults": 500, "pageToken": token, "projection": "basic"}
        return users

    def subject_hint(domain: str) -> str:
        return f"Cannot list @{domain}."

    @api_router.post("/google-oauth/configs/{config_id}/sync-users")
    async def sync_users_from_google(
        config_id: str,
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        """Pull one company's Google Workspace users, like Azure AD Sync users."""
        import asyncio
        import os as _os

        import bcrypt as _bcrypt

        _require_admin(user)
        cfg = await db[COLLECTION].find_one(
            {"id": config_id, "org_id": user["org_id"]}, {"_id": 0}
        )
        if not cfg:
            raise HTTPException(status_code=404, detail="Google OAuth config not found")
        if cfg.get("status") != "active":
            raise HTTPException(status_code=400, detail="Enable this Google config first")

        admin_email = _directory_admin_email(cfg.get("directory_admin_email"))
        domain = admin_email.split("@", 1)[1]
        allowed = set(_normalize_domains(cfg.get("email_domains") or []))
        if allowed and domain not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Add {domain} to Email domains before syncing that company's users",
            )

        sa_info = cfg.get("service_account") if isinstance(cfg.get("service_account"), dict) else None
        if not sa_info:
            sa_path = (_os.environ.get("GOOGLE_DIRECTORY_SA_FILE") or "").strip()
            if sa_path:
                try:
                    with open(sa_path, encoding="utf-8") as handle:
                        sa_info = _parse_service_account(handle.read())
                except HTTPException:
                    raise
                except Exception:
                    raise HTTPException(status_code=400, detail="GOOGLE_DIRECTORY_SA_FILE could not be read")
        if not sa_info:
            sibling = await db[COLLECTION].find_one(
                {
                    "org_id": user["org_id"],
                    "service_account.private_key": {"$exists": True, "$nin": [None, ""]},
                },
                {"_id": 0, "service_account": 1},
            )
            sibling_sa = (sibling or {}).get("service_account")
            if isinstance(sibling_sa, dict) and sibling_sa.get("private_key") and sibling_sa.get("client_email"):
                sa_info = sibling_sa
        if not sa_info:
            raise HTTPException(
                status_code=400,
                detail="Upload the Google Cloud service-account JSON on this sync admin or on the RefexOne Google login",
            )

        result = {
            "config_id": config_id,
            "label": cfg.get("label"),
            "domain": domain,
            "directory_admin_email": admin_email,
            "fetched": 0,
            "created": 0,
            "updated": 0,
            "disabled": 0,
            "skipped": 0,
            "errors": [],
        }
        try:
            access_token = await asyncio.to_thread(_directory_access_token, sa_info, admin_email)
            directory_users = await _list_directory_users(access_token, domain)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Google user sync failed")
            raise HTTPException(status_code=400, detail=str(e)[:300])

        result["fetched"] = len(directory_users)
        default_pw = _os.environ.get("DEFAULT_USER_PASSWORD", "Welcome@2026")
        password_hash = _bcrypt.hashpw(default_pw.encode(), _bcrypt.gensalt()).decode()
        now = datetime.now(timezone.utc).isoformat()

        for guser in directory_users:
            try:
                email = (guser.get("primaryEmail") or "").strip().lower()
                if not email or "@" not in email or email.split("@", 1)[1] != domain:
                    result["skipped"] += 1
                    continue
                name_obj = guser.get("name") or {}
                given = (name_obj.get("givenName") or "").strip()
                family = (name_obj.get("familyName") or "").strip()
                display = (name_obj.get("fullName") or "").strip()
                name = display or f"{given} {family}".strip() or email.split("@")[0]
                suspended = bool(guser.get("suspended"))
                orgs = guser.get("organizations") or []
                company = ""
                if orgs and isinstance(orgs[0], dict):
                    company = (orgs[0].get("name") or "").strip()
                if not company:
                    company = domain.split(".")[0].title()

                fields = {
                    "name": name,
                    "first_name": given or (name.split(" ", 1)[0] if name else ""),
                    "last_name": family or (name.split(" ", 1)[1] if name and " " in name else ""),
                    "company": company[:200],
                    "google_id": guser.get("id"),
                    "google_config_id": cfg["id"],
                    "source": "google_workspace",
                    "google_synced_at": now,
                }
                existing = await db.users.find_one(
                    {"email": email, "org_id": user["org_id"]}, {"_id": 0}
                )
                if not existing and guser.get("id"):
                    existing = await db.users.find_one(
                        {"org_id": user["org_id"], "google_id": guser.get("id")},
                        {"_id": 0},
                    )
                if existing:
                    update = dict(fields)
                    update["email"] = email
                    if suspended and existing.get("status") != "disabled":
                        update["status"] = "disabled"
                        update["disabled_at"] = now
                        update["disabled_reason"] = "Suspended in Google Workspace sync"
                        result["disabled"] += 1
                    elif (not suspended) and existing.get("status") == "disabled" and str(existing.get("disabled_reason") or "").startswith("Suspended in Google Workspace"):
                        update["status"] = "active"
                        update["disabled_at"] = None
                        update["disabled_reason"] = None
                    await db.users.update_one({"id": existing["id"]}, {"$set": update})
                    result["updated"] += 1
                else:
                    if suspended:
                        result["skipped"] += 1
                        continue
                    await db.users.insert_one({
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
                    })
                    result["created"] += 1
            except Exception as e:
                result["errors"].append(f"{guser.get('primaryEmail') or guser.get('id')}: {e}")
                if len(result["errors"]) > 50:
                    result["errors"].append("… truncated")
                    break

        await log_audit(
            user["org_id"],
            "google_users_synced",
            "google_oauth",
            user["id"],
            user.get("email"),
            config_id,
            {
                "domain": domain,
                "created": result["created"],
                "updated": result["updated"],
                "disabled": result["disabled"],
                "fetched": result["fetched"],
            },
            request.client.host if request.client else None,
        )
        return result

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
            login_config_query(),
            {"_id": 0, "id": 1, "label": 1, "email_domains": 1, "purpose": 1},
        ).sort("label", 1).to_list(200)
        return docs

    async def _resolve_config(config_id: Optional[str], domain: Optional[str]):
        cfg = None
        if config_id:
            cfg = await db[COLLECTION].find_one(
                {"id": config_id, "status": "active"}, {"_id": 0}
            )
            if is_directory_sync(cfg):
                cfg = None
        elif domain:
            dom = (domain or "").strip().lower().lstrip("@")
            if "@" in (domain or ""):
                email = normalize_email(domain)
                dom = email.split("@")[-1] if "@" in email else dom
            query = login_config_query()
            query["email_domains"] = dom
            cfg = await db[COLLECTION].find_one(query, {"_id": 0})
        if not cfg:
            all_active = await db[COLLECTION].find(
                login_config_query(), {"_id": 0}
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
        allowed_domains = _normalize_domains(cfg.get("email_domains") or [])
        # hd locks the Google picker to one workspace. Skip it when several domains share this login.
        if hosted and (not allowed_domains or allowed_domains == [hosted.lower()]):
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

        domain = email.split("@")[-1].strip().lower()
        allowed = _normalize_domains(cfg.get("email_domains") or [])
        if allowed and domain not in allowed:
            return fail(f"Email domain @{domain} is not allowed for this Google login")

        hosted = (cfg.get("hosted_domain") or "").strip().lower()
        token_hd = (claims.get("hd") or "").strip().lower()
        # A listed domain such as omegahires.com must still sign in when Hosted domain is refex.co.in.
        if hosted and token_hd and token_hd != hosted and domain == hosted:
            return fail(f"Google account is not from workspace @{hosted}")

        import re as _re

        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user:
            user = await db.users.find_one(
                {"email": {"$regex": f"^{_re.escape(email)}$", "$options": "i"}},
                {"_id": 0},
            )

        if not user:
            if domain not in allowed:
                return fail(
                    "No RefexOne account found for this Google email. Contact your admin."
                )
            user = await create_registered_domain_user(
                db,
                email=email,
                org_id=cfg.get("org_id"),
                claims=claims,
                source="google_login",
                extra={
                    "google_sub": claims.get("sub"),
                    "google_hd": token_hd or None,
                    "google_config_id": cfg["id"],
                },
            )
            await log_audit(
                user["org_id"],
                "user_created_on_google_login",
                "user",
                user["id"],
                user["email"],
                user["id"],
                {"google_config_id": cfg["id"], "domain": domain},
                request.client.host if request.client else None,
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
