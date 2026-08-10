"""
ITSM ticket proxy — Kissflow approval matrix + webhook submit.

Supports:
- Global env defaults (backward compatible)
- Per-entity Mongo configs (admin master setup): Refex, Extrovis, ModePro, etc.
  each with its own base URL / account / matrix / webhook / access keys.
"""
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("itsm")

KISSFLOW_BASE_URL = os.environ.get(
    "ITSM_KISSFLOW_BASE_URL",
    "https://development-refexgroup.kissflow.com",
).rstrip("/")
KISSFLOW_ACCOUNT_ID = os.environ.get("ITSM_ACCOUNT_ID", "AcCMptp3yqcn")
KISSFLOW_APPLICATION_ID = os.environ.get(
    "ITSM_APPLICATION_ID", "IT_Service_Management_A00"
)
KISSFLOW_PROCESS_ID = os.environ.get(
    "ITSM_PROCESS_ID", "Live_IT_Service_Request_A00"
)
KISSFLOW_APPROVAL_MATRIX_ID = os.environ.get(
    "ITSM_APPROVAL_MATRIX_ID", "Live_Approval_Matrix_A00"
)
KISSFLOW_ACCESS_KEY_ID = os.environ.get(
    "ITSM_ACCESS_KEY_ID",
    "Ak02048f79-316b-495a-81fc-150b8a485ef4",
)
KISSFLOW_ACCESS_KEY_SECRET = os.environ.get(
    "ITSM_ACCESS_KEY_SECRET",
    "mLuo5ag4tRVCHBHBdyWM9lOIM9I8ickEU0JhCz-XxCfd-oU7f6Pmx0hbiI4M73M7AbGgUS1djcg-HwwARRaBA",
)
KISSFLOW_WEBHOOK_PATH = os.environ.get(
    "ITSM_WEBHOOK_PATH",
    "/integration/2/AcCMptp3yqcn/webhook/"
    "J1VLVRMG2wXYcRkvDBHLxx0L5fNELbNtFYhPNtUg7kMbhvZSFxJL44ZEjn0htxhGqNCWqOntb7ZcbAz4MNWtQ",
)
# Per-entity webhook overrides (used by seed-defaults / fallback mapping)
ENTITY_WEBHOOK_PATHS = {
    "Extrovis": os.environ.get(
        "ITSM_EXTROVIS_WEBHOOK_PATH",
        "/integration/2/AcCMptp3yqcn/webhook/"
        "M1yJco-Vdt6t962Xi9BnbOd5nm75TKnl6mAD8rA7hA8lAiQJkce9Xj2zbOn8Nn0KkcB4n7Vz6sypvft61N1w",
    ),
}
ENTITY_OPTIONS_FALLBACK = ["Refex", "Extrovis", "ModePro"]
CRITICALITY_OPTIONS = ["Low", "Medium", "High", "Critical"]
SOURCE_VALUE = "Mobile"
APPROVAL_MATRIX_PAGE_SIZE = 500
COLLECTION = "itsm_entity_configs"


class TicketSubmitRequest(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    entity: str = Field(..., min_length=1)
    location: str = Field(..., min_length=1)
    sub_type: str = Field(..., min_length=1)
    criticality: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


class EntityConfigUpsert(BaseModel):
    entity_key: str = Field(..., min_length=1)
    display_name: Optional[str] = None
    kissflow_base_url: str = Field(..., min_length=1)
    account_id: str = Field(..., min_length=1)
    application_id: str = Field(..., min_length=1)
    process_id: str = Field(..., min_length=1)
    approval_matrix_id: str = Field(..., min_length=1)
    webhook_path: str = Field(..., min_length=1)
    access_key_id: str = Field(..., min_length=1)
    access_key_secret: Optional[str] = None  # omit / blank = keep existing on update
    enabled: bool = True
    sort_order: int = 0


def _default_env_config() -> Dict[str, Any]:
    return {
        "kissflow_base_url": KISSFLOW_BASE_URL,
        "account_id": KISSFLOW_ACCOUNT_ID,
        "application_id": KISSFLOW_APPLICATION_ID,
        "process_id": KISSFLOW_PROCESS_ID,
        "approval_matrix_id": KISSFLOW_APPROVAL_MATRIX_ID,
        "webhook_path": KISSFLOW_WEBHOOK_PATH,
        "access_key_id": KISSFLOW_ACCESS_KEY_ID,
        "access_key_secret": KISSFLOW_ACCESS_KEY_SECRET,
        "source": "env",
    }


def _normalize_entity_key(value: str) -> str:
    return (value or "").strip().lower().replace("  ", " ")


def _kissflow_headers(cfg: Dict[str, Any]) -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Access-Key-Id": cfg["access_key_id"],
        "X-Access-Key-Secret": cfg["access_key_secret"],
    }


def _as_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        return str(value.get("Name") or value.get("name") or value.get("_id") or "").strip()
    if isinstance(value, list) and value:
        return _as_string(value[0])
    return str(value).strip()


def _parse_matrix_record(row: Any, columns: List[Any], index: int) -> Dict[str, Any]:
    if isinstance(row, dict):
        data = row
        record_id = _as_string(data.get("_id")) or f"matrix_{index}"
    elif isinstance(row, list):
        data = {}
        for i, col in enumerate(columns):
            if i >= len(row):
                break
            col_id = col.get("Id") if isinstance(col, dict) else str(col)
            data[str(col_id)] = row[i]
        record_id = f"matrix_{index}"
    else:
        return {
            "id": f"matrix_{index}",
            "ticketType": "",
            "entity": "",
            "category": "",
            "subCategory": "",
            "subType": "",
            "type": "",
            "criticality": "",
            "detailsScope": "",
        }

    category = _as_string(data.get("Category"))
    sub_category = _as_string(data.get("SubCategory"))
    sub_type = _as_string(data.get("Sub_Type"))
    type_val = _as_string(data.get("Type"))
    # Extrovis rows often leave Sub_Type blank and use Category / SubCategory instead
    if not sub_type:
        if category and sub_category:
            sub_type = f"{category} / {sub_category}"
        else:
            sub_type = category or sub_category or type_val

    return {
        "id": record_id,
        "ticketType": _as_string(data.get("Ticket_Type")),
        "entity": _as_string(data.get("Entity")),
        "category": category,
        "subCategory": sub_category,
        "subType": sub_type,
        "type": type_val,
        "criticality": _as_string(data.get("Criticality")) or "Medium",
        "turnAroundTime": _as_string(data.get("TurnAround_Time_TAT")),
        "closureTime": _as_string(data.get("Closure_Time")),
        "detailsScope": _as_string(data.get("Details__Scope")),
        "firstApprovalEmail": _as_string(data.get("First_Approval_Email")) or None,
        "finalApprovalEmail": _as_string(data.get("Final_Approval_Email")) or None,
    }


def _raw_body_indicates_success(raw: Any) -> bool:
    if isinstance(raw, dict):
        status = str(raw.get("status") or "").strip().lower()
        return status == "success" or raw.get("success") is True
    text = str(raw or "").lower()
    return (
        ('"status"' in text and "success" in text)
        or ("'status'" in text and "success" in text)
        or "status: success" in text
        or text.strip() == "{status: success}"
    )


def _public_entity(doc: Dict[str, Any]) -> Dict[str, Any]:
    secret = doc.get("access_key_secret") or ""
    masked = (secret[:4] + "…" + secret[-4:]) if len(secret) > 10 else ("***" if secret else "")
    return {
        "id": doc.get("id"),
        "entity_key": doc.get("entity_key"),
        "display_name": doc.get("display_name") or doc.get("entity_key"),
        "kissflow_base_url": doc.get("kissflow_base_url"),
        "account_id": doc.get("account_id"),
        "application_id": doc.get("application_id"),
        "process_id": doc.get("process_id"),
        "approval_matrix_id": doc.get("approval_matrix_id"),
        "webhook_path": doc.get("webhook_path"),
        "access_key_id": doc.get("access_key_id"),
        # Admin-only list/detail includes full secret so ITSM Setup can display it.
        "access_key_secret": secret,
        "access_key_secret_masked": masked,
        "has_secret": bool(secret),
        "enabled": bool(doc.get("enabled", True)),
        "sort_order": int(doc.get("sort_order") or 0),
        "updated_at": doc.get("updated_at"),
    }


def register_itsm_routes(api_router: APIRouter, get_current_user, db=None):
    """Register ITSM proxy routes (requires IAM auth)."""

    def _require_admin(user: dict):
        if user.get("role") not in ("org_admin", "admin", "super_admin", "owner"):
            raise HTTPException(status_code=403, detail="Admin only")

    async def _list_entity_docs(org_id: str, enabled_only: bool = False) -> List[Dict[str, Any]]:
        if db is None:
            return []
        query: Dict[str, Any] = {"org_id": org_id}
        if enabled_only:
            query["enabled"] = {"$ne": False}
        docs = await db[COLLECTION].find(query, {"_id": 0}).sort("sort_order", 1).to_list(200)
        return docs

    async def _entity_options(org_id: str) -> List[str]:
        docs = await _list_entity_docs(org_id, enabled_only=True)
        if docs:
            return [d.get("display_name") or d.get("entity_key") for d in docs if d.get("entity_key")]
        return list(ENTITY_OPTIONS_FALLBACK)

    async def _resolve_config(org_id: str, entity: Optional[str]) -> Dict[str, Any]:
        """Pick per-entity Kissflow config, else global env defaults."""
        base = _default_env_config()
        if not entity or db is None:
            return base
        docs = await _list_entity_docs(org_id, enabled_only=True)
        if not docs:
            return base
        want = _normalize_entity_key(entity)
        for d in docs:
            key = _normalize_entity_key(d.get("entity_key") or "")
            display = _normalize_entity_key(d.get("display_name") or "")
            if want and (want == key or want == display):
                return {
                    "kissflow_base_url": (d.get("kissflow_base_url") or "").rstrip("/"),
                    "account_id": d.get("account_id") or "",
                    "application_id": d.get("application_id") or "",
                    "process_id": d.get("process_id") or "",
                    "approval_matrix_id": d.get("approval_matrix_id") or "",
                    "webhook_path": d.get("webhook_path") or "",
                    "access_key_id": d.get("access_key_id") or "",
                    "access_key_secret": d.get("access_key_secret") or "",
                    "source": "db",
                    "entity_key": d.get("entity_key"),
                }
        return base

    async def _verify_kissflow_access(user: dict) -> Dict[str, Any]:
        from services.kissflow_scim_client import check_user_kissflow_access

        profile = await check_user_kissflow_access(
            db,
            user.get("org_id") or "",
            user.get("email") or "",
            user_id=user.get("id"),
        )
        return {
            "user_in_kissflow": bool(profile.get("user_in_kissflow")),
            "kissflow_user_id": profile.get("kissflow_user_id") if profile.get("user_in_kissflow") else None,
            "kissflow_active": bool(profile.get("kissflow_active")),
            "verified_via": profile.get("verified_via"),
        }

    async def _fetch_matrix(cfg: Dict[str, Any]) -> Dict[str, Any]:
        path = (
            f"/form/2/{cfg['account_id']}/{cfg['approval_matrix_id']}/list"
            f"?page_number=1&page_size={APPROVAL_MATRIX_PAGE_SIZE}"
            f"&_application_id={cfg['application_id']}"
        )
        url = f"{cfg['kissflow_base_url']}{path}"
        last_error: Optional[Exception] = None
        for attempt in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.get(url, headers=_kissflow_headers(cfg))
                if response.status_code >= 400:
                    body_snip = (response.text or "")[:240]
                    raise HTTPException(
                        status_code=502,
                        detail=(
                            f"Failed to load approval matrix from "
                            f"{cfg['kissflow_base_url']} "
                            f"(Kissflow HTTP {response.status_code}). "
                            f"Check entity base URL / access keys in ITSM Setup. "
                            f"{body_snip}"
                        ).strip(),
                    )
                payload = response.json()
                columns = payload.get("Columns") or []
                data = payload.get("Data") or []
                records = [
                    _parse_matrix_record(row, columns, i)
                    for i, row in enumerate(data)
                ]
                sub_types = sorted(
                    {
                        r["subType"].strip()
                        for r in records
                        if r.get("subType", "").strip()
                    }
                )
                return {
                    "records": records,
                    "subTypes": sub_types,
                    "subCategories": sub_types,
                    "criticalityOptions": CRITICALITY_OPTIONS,
                    "config_source": cfg.get("source"),
                }
            except HTTPException:
                raise
            except Exception as exc:
                last_error = exc
                logger.warning("Approval matrix attempt %s failed: %s", attempt, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Unable to load approval matrix: {last_error}",
        )

    @api_router.get("/itsm/config")
    async def itsm_config(user: dict = Depends(get_current_user)):
        entities = await _entity_options(user.get("org_id") or "")
        return {
            "entityOptions": entities,
            "criticalityOptions": CRITICALITY_OPTIONS,
            "source": SOURCE_VALUE,
            "processId": KISSFLOW_PROCESS_ID,
            "has_entity_configs": bool(
                await _list_entity_docs(user.get("org_id") or "", enabled_only=True)
            ),
        }

    @api_router.get("/itsm/kissflow-status")
    async def kissflow_status(user: dict = Depends(get_current_user)):
        user_profile = await _verify_kissflow_access(user)
        cfg = await _resolve_config(user.get("org_id") or "", None)
        path = (
            f"/form/2/{cfg['account_id']}/{cfg['approval_matrix_id']}/list"
            f"?page_number=1&page_size=1"
            f"&_application_id={cfg['application_id']}"
        )
        url = f"{cfg['kissflow_base_url']}{path}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=_kissflow_headers(cfg))
            ok = 200 <= response.status_code < 300
            return {
                "ok": ok,
                "status_code": response.status_code,
                "base_url": cfg["kissflow_base_url"],
                **user_profile,
            }
        except Exception as exc:
            logger.warning("Kissflow status check failed: %s", exc)
            return {
                "ok": False,
                "status_code": 0,
                "base_url": cfg["kissflow_base_url"],
                "error": str(exc),
                **user_profile,
            }

    @api_router.get("/itsm/approval-matrix")
    async def get_approval_matrix(
        entity: Optional[str] = Query(None),
        user: dict = Depends(get_current_user),
    ):
        org_id = user.get("org_id") or ""
        entities = await _entity_options(org_id)
        cfg = await _resolve_config(org_id, entity)
        result = await _fetch_matrix(cfg)
        result["entityOptions"] = entities
        result["resolved_entity"] = entity
        return result

    @api_router.post("/itsm/tickets")
    async def submit_ticket(
        body: TicketSubmitRequest,
        user: dict = Depends(get_current_user),
    ):
        name = body.name.strip()
        email = str(body.email).strip()
        entity = body.entity.strip()
        location = body.location.strip()
        sub_type = body.sub_type.strip()
        criticality = body.criticality.strip()
        description = body.description.strip()

        if not entity:
            raise HTTPException(status_code=400, detail="Entity is required")
        if not location:
            raise HTTPException(status_code=400, detail="Location is required")
        if criticality not in CRITICALITY_OPTIONS:
            raise HTTPException(status_code=400, detail="Invalid criticality")
        if not description:
            raise HTTPException(status_code=400, detail="Description is required")
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            raise HTTPException(status_code=400, detail="Invalid email")

        cfg = await _resolve_config(user.get("org_id") or "", entity)
        if not cfg.get("webhook_path") or not cfg.get("access_key_secret"):
            raise HTTPException(
                status_code=400,
                detail=f"ITSM webhook is not configured for entity '{entity}'. Ask an admin to set it up.",
            )

        webhook_body = {
            "process_id": cfg["process_id"],
            "Source": SOURCE_VALUE,
            "Name": name,
            "Email": email,
            "Entity": entity,
            "Location_user": location,
            "Sub_Type": sub_type,
            "Criticality": criticality,
            "Description": description,
        }

        url = f"{cfg['kissflow_base_url']}{cfg['webhook_path']}"
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    url, headers=_kissflow_headers(cfg), json=webhook_body
                )
        except Exception as exc:
            logger.exception("ITSM webhook submit failed for entity=%s", entity)
            raise HTTPException(
                status_code=502, detail=f"Unable to submit ticket: {exc}"
            ) from exc

        raw = None
        try:
            raw = response.json()
        except Exception:
            raw = response.text

        if 200 <= response.status_code < 300 and _raw_body_indicates_success(raw):
            return {"success": True, "message": "Submitted successfully", "entity": entity}
        if isinstance(raw, dict) and _raw_body_indicates_success(raw):
            return {
                "success": True,
                "message": raw.get("message") or "Submitted successfully",
                "entity": entity,
            }
        if 200 <= response.status_code < 300:
            return {"success": True, "message": "Submitted successfully", "entity": entity}

        detail = "Unable to submit ticket."
        if isinstance(raw, dict):
            detail = raw.get("message") or raw.get("error") or detail
        raise HTTPException(status_code=502, detail=detail)

    @api_router.get("/itsm/admin/entities")
    async def admin_list_entities(user: dict = Depends(get_current_user)):
        _require_admin(user)
        docs = await _list_entity_docs(user.get("org_id") or "")
        return {
            "entities": [_public_entity(d) for d in docs],
            "env_defaults": {
                "kissflow_base_url": KISSFLOW_BASE_URL,
                "account_id": KISSFLOW_ACCOUNT_ID,
                "application_id": KISSFLOW_APPLICATION_ID,
                "process_id": KISSFLOW_PROCESS_ID,
                "approval_matrix_id": KISSFLOW_APPROVAL_MATRIX_ID,
                "webhook_path": KISSFLOW_WEBHOOK_PATH,
                "access_key_id": KISSFLOW_ACCESS_KEY_ID,
            },
            "fallback_entity_options": ENTITY_OPTIONS_FALLBACK,
        }

    @api_router.post("/itsm/admin/entities")
    async def admin_create_entity(
        body: EntityConfigUpsert,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")
        org_id = user.get("org_id") or ""
        key = body.entity_key.strip()
        existing = await db[COLLECTION].find_one(
            {"org_id": org_id, "entity_key": {"$regex": f"^{re.escape(key)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if existing:
            raise HTTPException(status_code=409, detail="Entity already exists")
        if not (body.access_key_secret or "").strip():
            raise HTTPException(status_code=400, detail="access_key_secret is required for new entities")

        webhook_path = body.webhook_path.strip()
        if webhook_path and not webhook_path.startswith("/"):
            webhook_path = "/" + webhook_path

        doc = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "entity_key": key,
            "display_name": (body.display_name or key).strip(),
            "kissflow_base_url": body.kissflow_base_url.strip().rstrip("/"),
            "account_id": body.account_id.strip(),
            "application_id": body.application_id.strip(),
            "process_id": body.process_id.strip(),
            "approval_matrix_id": body.approval_matrix_id.strip(),
            "webhook_path": webhook_path,
            "access_key_id": body.access_key_id.strip(),
            "access_key_secret": body.access_key_secret.strip(),
            "enabled": bool(body.enabled),
            "sort_order": int(body.sort_order or 0),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("email"),
        }
        await db[COLLECTION].insert_one(doc)
        doc.pop("_id", None)
        return _public_entity(doc)

    @api_router.put("/itsm/admin/entities/{entity_id}")
    async def admin_update_entity(
        entity_id: str,
        body: EntityConfigUpsert,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")
        org_id = user.get("org_id") or ""
        existing = await db[COLLECTION].find_one(
            {"id": entity_id, "org_id": org_id}, {"_id": 0}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Entity config not found")

        new_key = body.entity_key.strip()
        conflict = await db[COLLECTION].find_one(
            {
                "org_id": org_id,
                "id": {"$ne": entity_id},
                "entity_key": {"$regex": f"^{re.escape(new_key)}$", "$options": "i"},
            },
            {"_id": 0, "id": 1},
        )
        if conflict:
            raise HTTPException(status_code=409, detail="Another entity already uses this key")

        webhook_path = body.webhook_path.strip()
        if webhook_path and not webhook_path.startswith("/"):
            webhook_path = "/" + webhook_path

        update = {
            "entity_key": new_key,
            "display_name": (body.display_name or new_key).strip(),
            "kissflow_base_url": body.kissflow_base_url.strip().rstrip("/"),
            "account_id": body.account_id.strip(),
            "application_id": body.application_id.strip(),
            "process_id": body.process_id.strip(),
            "approval_matrix_id": body.approval_matrix_id.strip(),
            "webhook_path": webhook_path,
            "access_key_id": body.access_key_id.strip(),
            "enabled": bool(body.enabled),
            "sort_order": int(body.sort_order or 0),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("email"),
        }
        if (body.access_key_secret or "").strip():
            update["access_key_secret"] = body.access_key_secret.strip()

        await db[COLLECTION].update_one({"id": entity_id, "org_id": org_id}, {"$set": update})
        updated = await db[COLLECTION].find_one({"id": entity_id}, {"_id": 0})
        return _public_entity(updated or {**existing, **update})

    @api_router.delete("/itsm/admin/entities/{entity_id}")
    async def admin_delete_entity(entity_id: str, user: dict = Depends(get_current_user)):
        _require_admin(user)
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")
        result = await db[COLLECTION].delete_one(
            {"id": entity_id, "org_id": user.get("org_id") or ""}
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Entity config not found")
        return {"message": "Deleted"}

    @api_router.post("/itsm/admin/entities/{entity_id}/test-matrix")
    async def admin_test_matrix(entity_id: str, user: dict = Depends(get_current_user)):
        _require_admin(user)
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")
        doc = await db[COLLECTION].find_one(
            {"id": entity_id, "org_id": user.get("org_id") or ""}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Entity config not found")
        cfg = {
            "kissflow_base_url": (doc.get("kissflow_base_url") or "").rstrip("/"),
            "account_id": doc.get("account_id"),
            "application_id": doc.get("application_id"),
            "approval_matrix_id": doc.get("approval_matrix_id"),
            "access_key_id": doc.get("access_key_id"),
            "access_key_secret": doc.get("access_key_secret"),
            "source": "db",
        }
        result = await _fetch_matrix(cfg)
        return {
            "ok": True,
            "record_count": len(result.get("records") or []),
            "sub_type_count": len(result.get("subTypes") or []),
            "entity_key": doc.get("entity_key"),
        }

    @api_router.post("/itsm/admin/seed-defaults")
    async def admin_seed_defaults(user: dict = Depends(get_current_user)):
        """Create Refex / Extrovis / ModePro rows from current env if org has none."""
        _require_admin(user)
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")
        org_id = user.get("org_id") or ""
        existing = await _list_entity_docs(org_id)
        if existing:
            return {
                "seeded": 0,
                "message": "Entity configs already exist",
                "entities": [_public_entity(d) for d in existing],
            }

        created = []
        for i, name in enumerate(ENTITY_OPTIONS_FALLBACK):
            webhook = ENTITY_WEBHOOK_PATHS.get(name, KISSFLOW_WEBHOOK_PATH)
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "entity_key": name,
                "display_name": name,
                "kissflow_base_url": KISSFLOW_BASE_URL,
                "account_id": KISSFLOW_ACCOUNT_ID,
                "application_id": KISSFLOW_APPLICATION_ID,
                "process_id": KISSFLOW_PROCESS_ID,
                "approval_matrix_id": KISSFLOW_APPROVAL_MATRIX_ID,
                "webhook_path": webhook,
                "access_key_id": KISSFLOW_ACCESS_KEY_ID,
                "access_key_secret": KISSFLOW_ACCESS_KEY_SECRET,
                "enabled": True,
                "sort_order": i,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.get("email"),
            }
            await db[COLLECTION].insert_one(doc)
            doc.pop("_id", None)
            created.append(_public_entity(doc))
        return {"seeded": len(created), "entities": created}
