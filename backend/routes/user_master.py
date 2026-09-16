"""User Master API for external clients.

Other apps read the same HR directory shown in User Master.
Auth: Authorization Bearer token or X-API-Key.
  - Env USER_MASTER_API_KEY (all orgs)
  - Or a token created by an admin at POST /api/user-master/tokens
"""
from __future__ import annotations

import hmac
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

USER_MASTER_FIELDS = (
    "id",
    "email",
    "name",
    "full_name",
    "status",
    "role",
    "org_id",
    "adrenalin_employee_id",
    "title",
    "first_name",
    "last_name",
    "sex",
    "date_of_birth",
    "pan_number",
    "personal_email",
    "work_mobile",
    "employee_mobile",
    "mobile",
    "employee_pincode",
    "designation",
    "department",
    "department_code",
    "grade",
    "company",
    "legal_entity_code",
    "business_line",
    "branch_code",
    "location",
    "office_location",
    "supervisor_name",
    "supervisor_email",
    "supervisor_employee_code",
    "l2_manager_name",
    "l2_manager_email",
    "l2_manager_employee_code",
    "employee_status",
    "employee_status_description",
    "employment_status",
    "employment_status_description",
    "joining_date",
    "date_of_exit",
    "emp_added_on",
    "created_via",
    "hr_synced_at",
    "created_at",
    "updated_at",
)

_SECRET_FIELDS = {"password", "admin_known_password", "_id"}
_BEARER = HTTPBearer(auto_error=False)
_ADMIN_ROLES = ("org_admin", "owner", "admin", "super_admin")
COLLECTION = "user_master_tokens"


def _secure_equal(left: str, right: str) -> bool:
    a = (left or "").encode("utf-8")
    b = (right or "").encode("utf-8")
    if not a or not b or len(a) != len(b):
        return False
    return hmac.compare_digest(a, b)


def extract_api_token(
    authorization: Optional[str] = None,
    api_key: Optional[str] = None,
) -> str:
    raw_key = (api_key or "").strip()
    if raw_key:
        return raw_key
    header = (authorization or "").strip()
    if not header:
        return ""
    parts = header.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return header


def serialize_user_master(user: Optional[dict] = None) -> dict:
    row = user or {}
    out: Dict[str, Any] = {}
    for key in USER_MASTER_FIELDS:
        if key in _SECRET_FIELDS:
            continue
        value = row.get(key)
        out[key] = "" if value is None else value
    out["id"] = row.get("id") or ""
    out["email"] = (row.get("email") or "").strip().lower()
    if not out.get("full_name"):
        out["full_name"] = out.get("name") or ""
    if not out.get("name"):
        out["name"] = out.get("full_name") or ""
    return out


def build_user_master_query(
    *,
    org_id: Optional[str] = None,
    status: Optional[str] = None,
    email: Optional[str] = None,
    employee_id: Optional[str] = None,
    q: Optional[str] = None,
    updated_since: Optional[str] = None,
) -> dict:
    query: Dict[str, Any] = {}
    if org_id:
        query["org_id"] = org_id
    status_norm = (status or "active").strip().lower()
    if status_norm and status_norm not in ("all", "*"):
        query["status"] = status_norm
    if email:
        query["email"] = email.strip().lower()
    if employee_id:
        query["adrenalin_employee_id"] = employee_id.strip()
    clauses = []
    text = (q or "").strip()
    if text:
        rx = {"$regex": re.escape(text), "$options": "i"}
        clauses.append({"$or": [
            {"name": rx},
            {"email": rx},
            {"designation": rx},
            {"department": rx},
            {"adrenalin_employee_id": rx},
            {"company": rx},
        ]})
    since = (updated_since or "").strip()
    if since:
        clauses.append({"$or": [
            {"hr_synced_at": {"$gte": since}},
            {"updated_at": {"$gte": since}},
            {"created_at": {"$gte": since}},
        ]})
    if len(clauses) == 1:
        query.update(clauses[0])
    elif len(clauses) > 1:
        query["$and"] = clauses
    return query


def env_user_master_api_key() -> str:
    return (os.environ.get("USER_MASTER_API_KEY") or "").strip()


def _require_admin(user: dict) -> None:
    if (user or {}).get("role") not in _ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can manage User Master API tokens")


def register_user_master_routes(
    app,
    api_router: APIRouter,
    get_current_user: Callable,
    db,
    get_public_base_url: Callable,
) -> None:
    public = APIRouter(prefix="/api/v1", tags=["user-master"])

    async def require_client(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(_BEARER)):
        bearer = credentials.credentials if credentials else ""
        token = extract_api_token(
            authorization=f"Bearer {bearer}" if bearer else request.headers.get("authorization"),
            api_key=request.headers.get("x-api-key"),
        )
        if not token:
            raise HTTPException(status_code=401, detail="Missing User Master API token")

        env_key = env_user_master_api_key()
        if env_key and _secure_equal(token, env_key):
            return {"id": "env", "org_id": None, "label": "USER_MASTER_API_KEY", "source": "env"}

        token_doc = await db[COLLECTION].find_one({"token": token, "active": True}, {"_id": 0})
        if not token_doc:
            raise HTTPException(status_code=401, detail="Invalid or inactive User Master API token")

        await db[COLLECTION].update_one(
            {"id": token_doc["id"]},
            {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}},
        )
        token_doc["source"] = "token"
        return token_doc

    def _scope_org(_client: dict, requested: Optional[str]) -> Optional[str]:
        return (requested or "").strip() or None

    @public.get("/user-master")
    async def list_user_master(
        status: str = Query("active"),
        email: Optional[str] = Query(None),
        employee_id: Optional[str] = Query(None),
        org_id: Optional[str] = Query(None),
        q: Optional[str] = Query(None),
        updated_since: Optional[str] = Query(None),
        client: dict = Depends(require_client),
    ):
        scoped_org = _scope_org(client, org_id)
        query = build_user_master_query(
            org_id=scoped_org,
            status=status,
            email=email,
            employee_id=employee_id,
            q=q,
            updated_since=updated_since,
        )
        rows = await db.users.find(query, {"_id": 0, "password": 0, "admin_known_password": 0}).sort(
            [("name", 1), ("email", 1)]
        ).to_list(None)
        return {
            "ok": True,
            "total": len(rows),
            "users": [serialize_user_master(row) for row in rows],
        }

    @public.get("/user-master/{user_ref}")
    async def get_user_master(user_ref: str, client: dict = Depends(require_client)):
        raw = unquote(user_ref or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="Missing user id or email")
        scoped_org = _scope_org(client, None)
        org_filter = {"org_id": scoped_org} if scoped_org else {}
        email = raw.lower()
        user = await db.users.find_one(
            {"$and": [org_filter, {"$or": [
                {"id": raw},
                {"email": email},
                {"adrenalin_employee_id": raw},
            ]}]} if org_filter else {"$or": [
                {"id": raw},
                {"email": email},
                {"adrenalin_employee_id": raw},
            ]},
            {"_id": 0, "password": 0, "admin_known_password": 0},
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {"ok": True, "user": serialize_user_master(user)}

    @api_router.post("/user-master/tokens")
    async def create_user_master_token(body: dict, user: dict = Depends(get_current_user)):
        _require_admin(user)
        label = (body.get("label") or "User Master API").strip() or "User Master API"
        token_value = f"um_{uuid.uuid4().hex}{uuid.uuid4().hex}"
        token_doc = {
            "id": str(uuid.uuid4()),
            "token": token_value,
            "label": label,
            "org_id": user["org_id"],
            "created_by": user["id"],
            "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db[COLLECTION].insert_one(token_doc)
        base_url = get_public_base_url().rstrip("/")
        return {
            "id": token_doc["id"],
            "token": token_value,
            "label": label,
            "api_base_url": f"{base_url}/api/v1/user-master",
            "created_at": token_doc["created_at"],
        }

    @api_router.get("/user-master/tokens")
    async def list_user_master_tokens(user: dict = Depends(get_current_user)):
        _require_admin(user)
        tokens = await db[COLLECTION].find(
            {"org_id": user["org_id"], "active": True},
            {"_id": 0, "token": 0},
        ).to_list(50)
        base_url = get_public_base_url().rstrip("/")
        for item in tokens:
            item["api_base_url"] = f"{base_url}/api/v1/user-master"
        return tokens

    @api_router.delete("/user-master/tokens/{token_id}")
    async def revoke_user_master_token(token_id: str, user: dict = Depends(get_current_user)):
        _require_admin(user)
        result = await db[COLLECTION].update_one(
            {"id": token_id, "org_id": user["org_id"]},
            {"$set": {"active": False, "revoked_at": datetime.now(timezone.utc).isoformat()}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Token not found")
        return {"message": "Token revoked"}

    app.include_router(public)
