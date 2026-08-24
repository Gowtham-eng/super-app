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
import json
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

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
ENTITY_OPTIONS_FALLBACK = ["Refex", "Extrovis", "ModePro", "Kavis", "Pharma Pack"]
EXTROVIS_PROCESS_ID = os.environ.get(
    "ITSM_EXTROVIS_PROCESS_ID", "Live_IT_Service_Request_Extrovis_A00"
)
CRITICALITY_OPTIONS = ["Low", "Medium", "High", "Critical"]
SOURCE_VALUE = "Mobile"
APPROVAL_MATRIX_PAGE_SIZE = 500
COLLECTION = "itsm_entity_configs"
ENV_COLLECTION = "itsm_kissflow_environments"
LOCAL_TICKETS = "itsm_local_tickets"
VERIFY_ATTEMPTS = 3
VERIFY_DELAY_SEC = 2


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
        for key in ("Name", "name", "_id"):
            text = value.get(key)
            if text not in (None, ""):
                return str(text).strip()
        return ""
    if isinstance(value, list) and value:
        return _as_string(value[0])
    return str(value).strip()


def _field_text(value: Any) -> str:
    """Prefer long text over Kissflow Name/_id stubs."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        for key in (
            "Description",
            "description",
            "Text",
            "text",
            "Value",
            "value",
            "Content",
            "content",
            "Details",
            "details",
            "Name",
            "name",
        ):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip()
        return ""
    if isinstance(value, list):
        parts = [_field_text(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
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


# Process-report + reopen use the same Kissflow env as submit (development by default).
# Live Refex / Extrovis process + report IDs stay in ENTITY_REPORTS.
REPORT_BASE_URL = os.environ.get(
    "ITSM_REPORT_BASE_URL", KISSFLOW_BASE_URL
).rstrip("/")
REPORT_ACCOUNT_ID = os.environ.get("ITSM_REPORT_ACCOUNT_ID", KISSFLOW_ACCOUNT_ID)
REPORT_APPLICATION_ID = os.environ.get(
    "ITSM_REPORT_APPLICATION_ID", KISSFLOW_APPLICATION_ID
)
REPORT_ACCESS_KEY_ID = os.environ.get(
    "ITSM_REPORT_ACCESS_KEY_ID",
    KISSFLOW_ACCESS_KEY_ID,
)
REPORT_ACCESS_KEY_SECRET = os.environ.get(
    "ITSM_REPORT_ACCESS_KEY_SECRET",
    KISSFLOW_ACCESS_KEY_SECRET,
)
REPORT_PAGE_SIZE = 500
REPORT_MAX_PAGES = 50
ENTITY_REPORTS = {
    "refex": {
        "process_id": "Live_IT_Service_Request_A00",
        "report_id": "Service_Items_Refex_A00",
    },
    "extrovis": {
        "process_id": "Live_IT_Service_Request_Extrovis_A00",
        "report_id": "All_tickets_A00",
    },
}


def _uses_extrovis_flow(entity: Optional[str]) -> bool:
    """Refex → Refex webhook/process. All other entities → Extrovis webhook/process."""
    key = _normalize_entity_key(entity or "")
    if not key:
        return False
    return "refex" not in key


def _webhook_path_for_entity(entity: Optional[str]) -> str:
    if _uses_extrovis_flow(entity):
        return ENTITY_WEBHOOK_PATHS.get("Extrovis") or KISSFLOW_WEBHOOK_PATH
    return KISSFLOW_WEBHOOK_PATH


def _process_id_for_entity(entity: Optional[str]) -> str:
    if _uses_extrovis_flow(entity):
        return EXTROVIS_PROCESS_ID
    return KISSFLOW_PROCESS_ID


def _report_entity_key(entity: Optional[str]) -> str:
    return "extrovis" if _uses_extrovis_flow(entity) else "refex"


def _builtin_environments() -> Dict[str, Any]:
    """Dev vs live differ only by URL, account id, and access keys. Process/report/webhooks are shared."""
    ext_webhook = ENTITY_WEBHOOK_PATHS.get("Extrovis") or ""
    return {
        "active": "development",
        "shared": {
            "application_id": KISSFLOW_APPLICATION_ID,
            "approval_matrix_id": KISSFLOW_APPROVAL_MATRIX_ID,
            "refex": {
                "process_id": KISSFLOW_PROCESS_ID,
                "report_id": "Service_Items_Refex_A00",
                "webhook_path": KISSFLOW_WEBHOOK_PATH,
            },
            "extrovis": {
                "process_id": EXTROVIS_PROCESS_ID,
                "report_id": "All_tickets_A00",
                "webhook_path": ext_webhook,
            },
        },
        "development": {
            "kissflow_base_url": KISSFLOW_BASE_URL,
            "account_id": KISSFLOW_ACCOUNT_ID,
            "access_key_id": KISSFLOW_ACCESS_KEY_ID,
            "access_key_secret": KISSFLOW_ACCESS_KEY_SECRET,
        },
        "live": {
            "kissflow_base_url": os.environ.get(
                "ITSM_LIVE_BASE_URL", "https://refexgroup.kissflow.com"
            ).rstrip("/"),
            "account_id": os.environ.get("ITSM_LIVE_ACCOUNT_ID", "AcCMptlq60zH"),
            "access_key_id": os.environ.get("ITSM_LIVE_ACCESS_KEY_ID", ""),
            "access_key_secret": os.environ.get("ITSM_LIVE_ACCESS_KEY_SECRET", ""),
        },
    }


def _shared_from_legacy_block(block: Dict[str, Any]) -> Dict[str, Any]:
    builtin = _builtin_environments()["shared"]
    if not isinstance(block, dict):
        return builtin
    out = dict(builtin)
    if block.get("application_id"):
        out["application_id"] = block["application_id"]
    if block.get("approval_matrix_id"):
        out["approval_matrix_id"] = block["approval_matrix_id"]
    for slice_key in ("refex", "extrovis"):
        cur = dict(out.get(slice_key) or {})
        nxt = block.get(slice_key) if isinstance(block.get(slice_key), dict) else {}
        for field in ("process_id", "report_id", "webhook_path"):
            if nxt.get(field):
                cur[field] = str(nxt.get(field)).strip()
        out[slice_key] = cur
    return out


def _webhook_path_with_account(path: str, account_id: str) -> str:
    """Keep the same webhook token; swap only the account id segment for live vs development."""
    text = (path or "").strip()
    acc = (account_id or "").strip()
    if not text or not acc:
        return text
    return re.sub(r"/integration/2/[^/]+/", f"/integration/2/{acc}/", text)


def _entity_api_slice(shared: Dict[str, Any], entity: Optional[str]) -> Dict[str, str]:
    fallback = ENTITY_REPORTS["extrovis"] if _uses_extrovis_flow(entity) else ENTITY_REPORTS["refex"]
    raw = shared.get("extrovis") if _uses_extrovis_flow(entity) else shared.get("refex")
    if not isinstance(raw, dict):
        raw = {}
    return {
        "process_id": (raw.get("process_id") or fallback["process_id"]).strip(),
        "report_id": (raw.get("report_id") or fallback["report_id"]).strip(),
        "webhook_path": (raw.get("webhook_path") or "").strip(),
    }


def _public_connection(block: Dict[str, Any]) -> Dict[str, Any]:
    secret = block.get("access_key_secret") or ""
    return {
        "kissflow_base_url": block.get("kissflow_base_url") or "",
        "account_id": block.get("account_id") or "",
        "access_key_id": block.get("access_key_id") or "",
        "access_key_secret": secret,
        "has_secret": bool(secret),
    }


def _public_shared(shared: Dict[str, Any]) -> Dict[str, Any]:
    builtin = _builtin_environments()["shared"]
    merged = _merge_shared(builtin, shared if isinstance(shared, dict) else {})
    refex = merged.get("refex") if isinstance(merged.get("refex"), dict) else {}
    extrovis = merged.get("extrovis") if isinstance(merged.get("extrovis"), dict) else {}
    return {
        "application_id": merged.get("application_id") or "",
        "approval_matrix_id": merged.get("approval_matrix_id") or "",
        "refex": {
            "process_id": refex.get("process_id") or "",
            "report_id": refex.get("report_id") or "",
            "webhook_path": refex.get("webhook_path") or "",
        },
        "extrovis": {
            "process_id": extrovis.get("process_id") or "",
            "report_id": extrovis.get("report_id") or "",
            "webhook_path": extrovis.get("webhook_path") or "",
        },
    }


def _merge_connection(base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "kissflow_base_url": base.get("kissflow_base_url") or "",
        "account_id": base.get("account_id") or "",
        "access_key_id": base.get("access_key_id") or "",
        "access_key_secret": base.get("access_key_secret") or "",
    }
    for key in ("kissflow_base_url", "account_id", "access_key_id"):
        if incoming.get(key) is not None:
            out[key] = str(incoming.get(key) or "").strip()
    secret = (incoming.get("access_key_secret") or "").strip()
    if secret:
        out["access_key_secret"] = secret
    return out


def _merge_shared(base: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base)
    for key in ("application_id", "approval_matrix_id"):
        value = str(incoming.get(key) or "").strip()
        if value:
            out[key] = value
    for slice_key in ("refex", "extrovis"):
        cur = dict(out.get(slice_key) or {})
        nxt = incoming.get(slice_key) if isinstance(incoming.get(slice_key), dict) else {}
        for field in ("process_id", "report_id", "webhook_path"):
            value = str(nxt.get(field) or "").strip()
            if value:
                cur[field] = value
        out[slice_key] = cur
    return out


def _report_profile(entity: Optional[str], shared: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    if shared:
        sl = _entity_api_slice(shared, entity)
        if sl.get("process_id") and sl.get("report_id"):
            return {"process_id": sl["process_id"], "report_id": sl["report_id"]}
    mapped = _report_entity_key(entity)
    profile = ENTITY_REPORTS.get(mapped)
    if not profile:
        raise HTTPException(
            status_code=400,
            detail="Unable to resolve Kissflow report for this entity.",
        )
    return profile


def _kissflow_items(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in (
        "Data",
        "data",
        "Items",
        "items",
        "Activities",
        "activities",
        "Steps",
        "steps",
    ):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _kissflow_items(value)
            if nested:
                return nested
    return []


def _walk_progress_nodes(payload: Any) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []

    def walk(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                walk(item)
            return
        if not isinstance(node, dict):
            return
        found.append(node)
        for key in ("Steps", "steps", "Process", "process", "Activities", "activities"):
            if key in node:
                walk(node[key])

    walk(payload)
    return found


def _activity_instance_from_item(item: Dict[str, Any], instance_id: str = "") -> str:
    return _usable_activity_id(
        item.get("_activity_instance_id")
        or item.get("activityInstanceId")
        or item.get("Activity_Instance_ID")
        or item.get("_id"),
        instance_id,
    )


def _is_reopen_activity_item(item: Dict[str, Any], entity: Optional[str]) -> bool:
    def_id = _as_string(
        item.get("_activity_id") or item.get("Activity_ID") or item.get("activity_id")
    )
    wanted = REOPEN_STEP_ACTIVITY_IDS.get(_report_entity_key(entity), REOPEN_STEP_ACTIVITY_IDS["refex"])
    if def_id in wanted:
        return True
    step = _as_string(
        item.get("Name")
        or item.get("Activity_Name")
        or item.get("_current_step")
        or item.get("Current_Step")
        or item.get("Step_Name")
        or item.get("step_name")
    )
    return _is_reopen_hold_step(step)


def _is_tech_completed_step(item: Dict[str, Any]) -> bool:
    token = _status_token(str(item.get("Status") or item.get("status") or item.get("_status") or ""))
    if token != "completed":
        return False
    step = _as_string(
        item.get("Name")
        or item.get("Activity_Name")
        or item.get("Step_Name")
        or item.get("step_name")
        or item.get("ActivityName")
    ).lower()
    if not step:
        return True
    if any(
        part in step
        for part in (
            "manager",
            "head",
            "reopen",
            "feedback",
            "approver",
            "start",
            "end event",
            "l1",
            "l2",
        )
    ):
        return False
    # Prefer IT Agent / Tech Support / Solution / Pickup; accept other completed work steps.
    if any(part in step for part in ("tech", "agent", "solution", "pickup", "support")):
        return True
    # Progress payloads sometimes use short labels — allow any non-approval completed step.
    return True


async def _kf_get_json(
    cfg: Dict[str, Any],
    path: str,
    params: Optional[Dict[str, Any]] = None,
) -> Any:
    url = path if path.startswith("http") else f"{cfg['kissflow_base_url']}{path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, headers=_kissflow_headers(cfg), params=params or {})
    if response.status_code >= 400:
        logger.warning("Kissflow GET %s -> %s %s", path, response.status_code, (response.text or "")[:200])
        return None
    try:
        return response.json()
    except Exception:
        return None


def _pick_sendback_from_nodes(
    nodes: List[Dict[str, Any]],
    instance_id: str,
    exclude_ids: Optional[Set[str]] = None,
) -> str:
    """Latest completed IT Tech/Agent activity id for sendback body `_id`."""
    exclude = {x for x in (exclude_ids or set()) if x}
    exclude.add(instance_id)
    best = ""
    best_ts: Optional[datetime] = None
    for act in nodes:
        if not _is_tech_completed_step(act):
            continue
        aid = _usable_activity_id(
            act.get("_id")
            or act.get("Id")
            or act.get("_activity_instance_id")
            or act.get("activityInstanceId"),
            instance_id,
        )
        if not aid or aid in exclude:
            continue
        acted = _parse_datetime(
            act.get("ActedAt")
            or act.get("actedAt")
            or act.get("CompletedAt")
            or act.get("_modified_at")
            or act.get("ModifiedAt")
        )
        if acted and (best_ts is None or acted > best_ts):
            best_ts = acted
            best = aid
        elif not best:
            best = aid
    return best


async def _resolve_reopen_ids(
    cfg: Dict[str, Any],
    entity: Optional[str],
    instance_id: str,
    hinted_activity: str,
    hinted_sendback: str,
) -> tuple:
    """
    Build Kissflow sendback ids for:
      POST .../{process}/{instance_id}/{activity_instance_id}/sendback?_application_id=...
      body {"Note": "...", "_id": "<IT Agent completed activity>"}
    """
    process_id = cfg.get("process_id") or ""
    entity_key = _report_entity_key(entity)
    activity_id = _usable_activity_id(hinted_activity, instance_id)
    # Body _id must be IT Agent / IT Tech Support step — never ticket id and never reopen-step activity.
    sendback_id = _usable_activity_id(hinted_sendback, instance_id)
    if sendback_id and activity_id and sendback_id == activity_id:
        sendback_id = ""
    # Report StepFields already have both ids — do not call /activity (integration key 403).
    if activity_id and sendback_id:
        return activity_id, sendback_id
    params = {"_application_id": cfg.get("application_id") or REPORT_APPLICATION_ID}

    if not activity_id and process_id:
        for def_id in REOPEN_STEP_ACTIVITY_IDS.get(entity_key, []):
            payload = await _kf_get_json(
                cfg,
                f"/process/2/{cfg['account_id']}/{process_id}/pending/{def_id}",
                {
                    **params,
                    "page_number": 1,
                    "page_size": 500,
                    "skip_aggregation": "true",
                },
            )
            for item in _kissflow_items(payload):
                if _as_string(item.get("_id")) != instance_id:
                    continue
                activity_id = _usable_activity_id(
                    item.get("_activity_instance_id")
                    or item.get("activityInstanceId")
                    or item.get("Activity_Instance_ID"),
                    instance_id,
                )
                if activity_id:
                    break
            if activity_id:
                break

    acts: List[Dict[str, Any]] = []
    if process_id:
        payload = await _kf_get_json(
            cfg,
            f"/process/2/{cfg['account_id']}/{process_id}/{instance_id}/activity",
            params,
        )
        acts = _kissflow_items(payload)
        if not activity_id:
            for act in acts:
                token = _status_token(
                    str(act.get("Status") or act.get("status") or act.get("_status") or "")
                )
                if token in ("completed", "cancelled", "canceled", "skipped"):
                    continue
                if not _is_reopen_activity_item(act, entity):
                    continue
                activity_id = _usable_activity_id(
                    act.get("_id") or act.get("_activity_instance_id"),
                    instance_id,
                )
                if activity_id:
                    break
        if not sendback_id:
            sendback_id = _pick_sendback_from_nodes(
                acts, instance_id, exclude_ids={activity_id} if activity_id else set()
            )

    if not sendback_id and process_id:
        progress = await _kf_get_json(
            cfg,
            f"/process/2/{cfg['account_id']}/{process_id}/{instance_id}/progress",
            params,
        )
        sendback_id = _pick_sendback_from_nodes(
            _walk_progress_nodes(progress),
            instance_id,
            exclude_ids={activity_id} if activity_id else set(),
        )

    # Never fall back to ticket id or reopen activity id — Kissflow rejects those.
    if sendback_id in (instance_id, activity_id):
        sendback_id = ""
    return activity_id, sendback_id


def _extract_report_rows(payload: Any) -> tuple:
    if isinstance(payload, list):
        return [], payload
    if not isinstance(payload, dict):
        return [], []
    columns = payload.get("Columns") or payload.get("columns") or []
    data = (
        payload.get("Data")
        or payload.get("data")
        or payload.get("Items")
        or payload.get("items")
        or []
    )
    if isinstance(data, dict):
        data = data.get("Data") or data.get("items") or []
    if not isinstance(data, list):
        data = []
    return columns, data


async def _fetch_process_report(
    cfg: Dict[str, Any],
    profile: Dict[str, str],
    email: str,
    page_number: int,
    page_size: int,
    email_param: str,
    client: Optional[httpx.AsyncClient] = None,
) -> tuple:
    path = (
        f"/process-report/2/{cfg['account_id']}/{profile['process_id']}/{profile['report_id']}"
    )
    params = {
        email_param: email,
        "page_number": page_number,
        "page_size": page_size,
        "_application_id": cfg["application_id"],
    }
    url = f"{cfg['kissflow_base_url']}{path}"
    if client is not None:
        response = await client.get(url, headers=_kissflow_headers(cfg), params=params)
        return url, response
    async with httpx.AsyncClient(timeout=60.0) as owned:
        response = await owned.get(url, headers=_kissflow_headers(cfg), params=params)
    return url, response


REOPEN_STEP_ACTIVITY_IDS = {
    "refex": ["Activity_Ot8GrzZvSl", "Activity_OCGdY6c0WJ"],
    "extrovis": ["Activity_7rCa3_zSic"],
}

# Kissflow report columns use opaque Ids (verified in aasik_ITSM employee dashboard).
REPORT_FIELD_IDS = {
    "refex": {
        "request_id": ["Column_0jda6rzCc3"],
        "description": ["Column_E-ofBZkcFS"],
        "details": ["Column_FxDZhsWTFS"],
        "status": ["Column_0GDnNoEuA7"],
        "item_status": ["Column_WRiZDgVSqj"],
        "instance_id": ["Column_dMv896bJnp", "_id"],
        "system_status": ["Column_oJoMWOnj-_", "_status"],
        "current_step": ["Column_A855mbiBz_", "_current_step"],
        "last_completed_step": ["Column_aCVoojaJPz", "last_completed_step_name"],
        "reopened": ["Column_C7s_oevsgX", "Reopened_Ticket"],
        "solution": ["Column_ysyWJXmwHY", "It_Agent_Solution"],
        "employee_rating": ["Column_GqqqD56fd3", "Ratings_emp"],
        "created_at": ["Column_7-RiedjtKg", "_created_at"],
        "modified_at": ["Column_JOmYm9Frwx", "_modified_at"],
        "requested_at": ["Column_t8DXamLRRF"],
        "closure_minutes": ["Column_EJ_2bDMtnD", "Closure_Time"],
        "tat_minutes": ["Column_uzB76CIUdv", "TurnAround_Time_TAT"],
        # IT Tech Support StepField — sendback body `_id` (completed).
        "it_agent_activity": ["Column_M6Lo8-DcO7", "Column_PdcW660jHk"],
        "it_agent_pickup": ["Column_LVQSPzDsbD", "Column_9gnIPdxah5"],
        "it_agent_after_dependency": ["Column_tW6JKl_LzQ", "Column_GalsKhjIfg"],
        # IT Tech Reopen — sendback URL activity (in progress).
        "it_tech_reopen_activity": ["Column_yjgVKIjsC3", "Column_pCWmiiKhh4"],
        "activity_instance_id": ["Column_nbQxE91cIm", "_activity_instance_id"],
        "assigned_to": ["Column_Vz3Y600Rds", "_current_assigned_to"],
        "assigned_to_user": ["Column_QcF4GcVGi9", "Assigned_To_User"],
        "modified_by": ["Column_2ePerEzuLP", "_modified_by"],
        "requester_email": ["Column_TNDYy0NHqk", "Email", "Requester_Email", "Requestor_Email"],
        "created_by": ["Column_qpzG8v9AKq", "_created_by"],
    },
    "extrovis": {
        "request_id": ["Column_y4srngcUo1"],
        "description": ["Column_AS7UbLz7Mg"],
        "details": ["Column_cRjitc-UTx"],
        "status": ["Column_69zTtmtO92"],
        "item_status": ["Column_ps84EEKkEI"],
        "instance_id": ["Column_-Phjj_1WzB", "_id"],
        "system_status": ["Column_ApNmcvK7J8", "_status"],
        "current_step": ["Column_Yf9r2UCRuu", "_current_step"],
        "last_completed_step": ["Column_kiX5py9w4A", "last_completed_step_name"],
        "reopened": ["Column_U0QcqEXR63", "Reopened_Ticket"],
        "solution": ["Column_oCwk2a69nP", "It_Agent_Solution"],
        "employee_rating": ["Column_symlF_F64d", "Ratings_emp"],
        "created_at": ["Column_OuyTOsNWaK", "_created_at"],
        "modified_at": ["Column_QpPzei51U2", "_modified_at"],
        "requested_at": ["Column_zFPQcd-Rx8"],
        "closure_minutes": ["Column_mEZwE_B6CW", "Closure_Time"],
        "tat_minutes": ["Column_VO-1shRU1Q", "TurnAround_Time_TAT"],
        # IT Agent Solution StepField — sendback body `_id` (completed).
        "it_agent_activity": ["Column_hqa27TIa-1"],
        "it_agent_pickup": ["Column_7WajlrHQ7C"],
        "it_agent_after_dependency": ["Column_APHthsvL9P"],
        # ReOpen Window — sendback URL activity (in progress).
        "it_tech_reopen_activity": ["Column_9edMpjzOjb"],
        "activity_instance_id": ["Column_7S52b2A4AF", "_activity_instance_id"],
        "assigned_to": ["Column_7Fn1867jLF", "_current_assigned_to"],
        "assigned_to_user": ["Column_9uwhycudkA", "Assigned_To_User"],
        "modified_by": ["Column_FPFvrG0A9c", "_modified_by"],
        "requester_email": ["Column_Egh9ss0nVO", "Email", "Requester_Email", "Requestor_Email"],
        "created_by": ["Column_9D6907I8pY", "_created_by"],
    },
}


def _normalize_email(value: Any) -> str:
    text = _as_string(value).strip().lower()
    if "@" not in text:
        return ""
    return text.split()[0].strip("<>\",;'")


def _emails_from_value(value: Any) -> Set[str]:
    found: Set[str] = set()
    if value is None or value == "" or value == "—":
        return found
    if isinstance(value, str):
        email = _normalize_email(value)
        if email:
            found.add(email)
        return found
    if isinstance(value, list):
        for item in value:
            found |= _emails_from_value(item)
        return found
    if isinstance(value, dict):
        for key in ("Email", "email", "_email", "UserEmail", "Requester_Email"):
            found |= _emails_from_value(value.get(key))
        for key in ("Users", "users", "Members", "members"):
            found |= _emails_from_value(value.get(key))
    return found


def _row_owner_emails(data: Dict[str, Any], field_ids: Dict[str, Any]) -> Set[str]:
    found: Set[str] = set()
    found |= _emails_from_value(
        _raw_field(
            data,
            *field_ids.get("requester_email", []),
            "Email",
            "Requester_Email",
            "Requestor_Email",
            "RequesterEmail",
        )
    )
    found |= _emails_from_value(
        _raw_field(
            data,
            *field_ids.get("created_by", []),
            "_created_by",
            "Created_By",
            "createdBy",
        )
    )
    return found


def _row_dict(row: Any, columns: List[Any]) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    if isinstance(row, dict):
        data.update(row)
    elif isinstance(row, list):
        for i, col in enumerate(columns or []):
            if i >= len(row):
                break
            col_id = col.get("Id") if isinstance(col, dict) else str(col)
            data[str(col_id)] = row[i]
    else:
        return {}

    for i, col in enumerate(columns or []):
        if not isinstance(col, dict):
            continue
        col_id = str(col.get("Id") or col.get("id") or "")
        value = data.get(col_id)
        if value is None and isinstance(row, list) and i < len(row):
            value = row[i]
        if value is None:
            continue
        for name in (
            col.get("Name"),
            col.get("name"),
            col.get("Label"),
            col.get("DisplayName"),
            col.get("FieldId"),
        ):
            if name:
                data[str(name)] = value
    return data


def _lookup_field(data: Dict[str, Any], *candidates: str) -> str:
    lowered = {str(k).lower().replace(" ", "_"): v for k, v in data.items()}
    for name in candidates:
        if not name:
            continue
        key = name.lower().replace(" ", "_")
        if key in lowered:
            value = _field_text(lowered[key]) or _as_string(lowered[key])
            if value:
                return value
    return ""


def _raw_field(data: Dict[str, Any], *candidates: str) -> Any:
    lowered = {str(k).lower().replace(" ", "_"): v for k, v in data.items()}
    for name in candidates:
        if not name:
            continue
        key = name.lower().replace(" ", "_")
        if key in lowered and lowered[key] not in (None, ""):
            return lowered[key]
    return None


def _is_closed_status(status: str) -> bool:
    token = (status or "").strip().lower()
    return "closed" in token or "completed" in token or "reject" in token


def _looks_like_instance_id(token: str, instance_id: str) -> bool:
    value = (token or "").strip()
    if not value:
        return True
    if instance_id and value == instance_id:
        return True
    return bool(re.match(r"^Pk[A-Za-z0-9]{8,}$", value))


def _status_token(value: str) -> str:
    return re.sub(r"[\s_-]+", "", (value or "").strip().lower())


def _is_reopen_hold_step(step: str) -> bool:
    """Live reopen hold — Refex: IT Tech Reopen; Extrovis: Ticket Reopen / ReOpen Window."""
    text = (step or "").strip().lower()
    if not text or "reopened" in text:
        return False
    return (
        "it tech reopen" in text
        or "reopen window" in text
        or text == "ticket reopen"
        or ("ticket reopen" in text and "reopened" not in text)
        or "ticket can be reopened" in text
        or "employee feedback" in text
        or "employee verification" in text
    )


def _is_live_work_step(step: str) -> bool:
    text = (step or "").strip().lower()
    if not text:
        return False
    if "reopen" in text:
        return False
    return (
        "it agent pickup" in text
        or "it agent pick up" in text
        or "it agent solution" in text
        or "tech support" in text
        or text == "it tech"
        or "dependency" in text
    )


def _activity_entries(value: Any) -> List[Dict[str, Any]]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("[") or text.startswith("{"):
            try:
                value = json.loads(text)
            except Exception:
                return []
        else:
            return []
    if isinstance(value, dict):
        nested = value.get("Data") or value.get("data") or value.get("Items") or value.get("items")
        if isinstance(nested, list):
            value = nested
        else:
            return [value]
    if isinstance(value, list):
        out: List[Dict[str, Any]] = []
        for entry in value:
            if isinstance(entry, dict):
                out.append(entry)
            else:
                out.extend(_activity_entries(entry))
        return out
    return []


def _activity_entry_id(entry: Dict[str, Any]) -> str:
    raw = entry.get("_id") or entry.get("Id") or entry.get("id")
    if isinstance(raw, str) and raw.strip():
        aid = raw.strip()
    else:
        aid = _as_string(raw)
    if aid.startswith("Activity_") or aid.startswith("Employee_Confirmation_"):
        return ""
    return aid


def _usable_activity_id(value: Any, instance_id: str = "") -> str:
    aid = _as_string(value)
    if not aid:
        return ""
    if aid.startswith("Activity_") or aid.startswith("Employee_Confirmation_"):
        return ""
    if instance_id and aid == instance_id:
        return ""
    return aid


def _pick_open_reopen_activity_id(value: Any, instance_id: str = "") -> str:
    ranked: List[tuple] = []
    rank_map = {"inprogress": 0, "open": 1, "notpickedyet": 2, "": 3}
    for entry in _activity_entries(value):
        aid = _usable_activity_id(_activity_entry_id(entry), instance_id)
        if not aid:
            continue
        token = _status_token(str(entry.get("Status") or entry.get("status") or entry.get("_status") or ""))
        if token in ("completed", "cancelled", "canceled", "skipped"):
            continue
        if token not in rank_map:
            continue
        ranked.append((rank_map[token], aid))
    ranked.sort()
    return ranked[0][1] if ranked else ""


def _pick_inprogress_activity_id(value: Any) -> str:
    for entry in _activity_entries(value):
        token = _status_token(str(entry.get("Status") or entry.get("status") or ""))
        if token == "inprogress":
            aid = _activity_entry_id(entry)
            if aid:
                return aid
    return ""


def _pick_latest_completed_activity_id(value: Any) -> str:
    best = ""
    best_ts: Optional[datetime] = None
    fallback = ""
    fallback_ts: Optional[datetime] = None
    for entry in _activity_entries(value):
        aid = _activity_entry_id(entry)
        if not aid:
            continue
        acted = _datetime_from_value(entry.get("ActedAt") or entry.get("actedAt") or entry.get("CompletedAt"))
        token = _status_token(str(entry.get("Status") or entry.get("status") or entry.get("_status") or ""))
        if token == "completed":
            if acted and (best_ts is None or acted > best_ts):
                best_ts = acted
                best = aid
            elif not best:
                best = aid
            continue
        if token in ("cancelled", "canceled", "skipped", "inprogress", "open"):
            continue
        if acted and (fallback_ts is None or acted > fallback_ts):
            fallback_ts = acted
            fallback = aid
        elif not fallback:
            fallback = aid
    return best or fallback


def _sendback_id_from_report(
    data: Dict[str, Any],
    field_ids: Dict[str, List[str]],
    instance_id: str,
    reopen_activity_id: str = "",
) -> str:
    """
    Body `_id` = completed solver step:
      Refex → IT Tech Support (Column_M6Lo8-DcO7)
      Extrovis → IT Agent Solution (Column_hqa27TIa-1)
    """
    exclude = {instance_id, reopen_activity_id}
    for cols in (
        field_ids.get("it_agent_activity") or [],
        field_ids.get("it_agent_after_dependency") or [],
        field_ids.get("it_agent_pickup") or [],
    ):
        aid = _usable_activity_id(
            _pick_latest_completed_activity_id(_raw_field(data, *cols)),
            instance_id,
        )
        if aid and aid not in exclude:
            return aid
    return ""


def _is_system_actor(name: str) -> bool:
    token = (name or "").strip().lower()
    if not token:
        return False
    compact = re.sub(r"[\s_-]+", "", token)
    return (
        "itsmbot" in compact
        or compact == "bot"
        or compact.endswith("bot")
        or "system" in token
        or "automation" in token
        or "kissflow" in token
        or "auto complete" in token
        or "auto-completed" in token
        or "auto clos" in token
        or "autoclose" in compact
        or token in ("it agents", "it agent", "it manager", "it admin")
    )


def _is_workflow_role_name(name: str) -> bool:
    """Kissflow pool / approver roles — not the person who solved the ticket."""
    token = (name or "").strip().lower()
    if not token:
        return False
    if _is_system_actor(name):
        return True
    compact = re.sub(r"[\s_-]+", "", token)
    if compact in ("itmanager", "ithead", "itadmin", "itagents", "itagent"):
        return True
    if re.search(r"\bit\s*manager\b", token) or re.search(r"\bit\s*head\b", token):
        return True
    if re.search(r"\bit\s*admin\b", token):
        return True
    if token in (
        "it agent",
        "it agents",
        "it agent refex",
        "it agent extrovis",
        "it tech",
        "it tech support",
    ):
        return True
    return False


def _is_solver_activity_step(step: str) -> bool:
    text = (step or "").strip().lower()
    if not text:
        return True
    if any(part in text for part in ("manager", "head", "l1", "l2", "approver")):
        return False
    if "reopen" in text or "employee feedback" in text:
        return False
    return True


def _format_person(value: Any) -> str:
    """Kissflow user/role objects → human names (drops IT Manager / IT Head / BOT)."""
    if value is None or value == "" or value == "—":
        return ""
    if isinstance(value, str):
        text = value.strip()
        if "," in text:
            return _format_person([part.strip() for part in text.split(",") if part.strip()])
        return "" if _is_workflow_role_name(text) else text
    if isinstance(value, list):
        names: List[str] = []
        seen = set()
        for item in value:
            name = _format_person(item)
            key = name.lower()
            if name and key not in seen:
                seen.add(key)
                names.append(name)
        return ", ".join(names)
    if isinstance(value, dict):
        nested = (
            value.get("Users")
            or value.get("users")
            or value.get("Members")
            or value.get("members")
        )
        nested_names = _format_person(nested) if nested else ""
        name = _as_string(
            value.get("Name")
            or value.get("name")
            or value.get("Email")
            or value.get("email")
        )
        if _is_workflow_role_name(name):
            return nested_names
        if nested_names and (not name or _is_system_actor(name)):
            return nested_names
        if name and nested_names and nested_names.lower() != name.lower():
            return _format_person([name, nested_names])
        return "" if _is_workflow_role_name(name) else name
    return _as_string(value)


def _solver_from_solutions(value: Any) -> str:
    for entry in reversed(_activity_entries(value)):
        name = _format_person(
            entry.get("Column_agentName")
            or entry.get("Agent_Name")
            or entry.get("ActedBy")
            or entry.get("actedBy")
            or entry.get("Name")
        )
        if name:
            return name
    return ""


def _solver_from_agent_fields(data: Dict[str, Any], field_ids: Dict[str, List[str]], solution_value: Any = None) -> str:
    """Who solved — ActedBy on completed IT Tech Support / IT Agent Solution, never current assignee."""
    blobs = []
    for cols in (
        field_ids.get("it_agent_activity") or [],
        field_ids.get("it_agent_after_dependency") or [],
        field_ids.get("it_agent_pickup") or [],
    ):
        raw = _raw_field(data, *cols)
        if raw is not None:
            blobs.append(raw)
    for blob in blobs:
        name = _latest_it_agent_handler(blob, None)
        if name:
            return name
    return _solver_from_solutions(solution_value)


def _latest_it_agent_handler(activity_value: Any, solution_value: Any = None) -> str:
    """Latest human IT Agent / tech support ActedBy — never IT Manager / IT Head."""
    best_name = ""
    best_ts: Optional[datetime] = None
    for entry in _activity_entries(activity_value):
        token = _status_token(str(entry.get("Status") or entry.get("status") or entry.get("_status") or ""))
        if token in ("inprogress", "open", "cancelled", "canceled", "skipped"):
            continue
        step = str(
            entry.get("StepName")
            or entry.get("step")
            or entry.get("Name")
            or ""
        )
        if not _is_solver_activity_step(step):
            continue
        name = _format_person(
            entry.get("ActedBy")
            or entry.get("actedBy")
            or entry.get("AssignedTo")
            or entry.get("assignedTo")
        )
        if not name:
            continue
        acted = _datetime_from_value(entry.get("ActedAt") or entry.get("actedAt"))
        if acted and (best_ts is None or acted > best_ts):
            best_ts = acted
            best_name = name
        elif not best_name:
            best_name = name
    if best_name:
        return best_name
    return _solver_from_solutions(solution_value)


def _is_closed_row(status: str, current_step: str, workflow_status: str) -> bool:
    return (
        (status or "") == "Closed"
        or _is_reopen_hold_step(current_step)
        or _is_process_completed(workflow_status)
    )


def _assigned_to_display(
    assigned_raw: Any,
    assigned_user_raw: Any,
    solver: str,
    status: str,
    current_step: str,
    workflow_status: str,
    reopen_hold: bool = False,
) -> str:
    """Open/Reopened: live assignee. Closed / Reopen Window: solver only (not IT Head/Manager)."""
    if _is_closed_row(status, current_step, workflow_status) or reopen_hold:
        return solver or "—"

    live = _format_person(assigned_raw)
    if live:
        return live
    assigned_user = _format_person(assigned_user_raw)
    if assigned_user:
        return assigned_user
    if solver:
        return solver
    return "—"


def _closed_by_display(
    solver: str,
    status: str,
    current_step: str,
    workflow_status: str,
    reopen_hold: bool = False,
) -> str:
    if not (_is_closed_row(status, current_step, workflow_status) or reopen_hold):
        return "—"
    return solver or "—"


def _iso_or_none(value: Any) -> Optional[str]:
    dt = value if isinstance(value, datetime) else _datetime_from_value(value)
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _created_on_iso(data: Dict[str, Any], field_ids: Dict[str, List[str]]) -> Optional[str]:
    raw = _raw_field(
        data,
        *field_ids.get("requested_at", []),
        *field_ids.get("created_at", []),
        "_created_at",
    )
    return _iso_or_none(raw)


def _closed_on_iso(
    data: Dict[str, Any],
    field_ids: Dict[str, List[str]],
    status: str,
    current_step: str,
    workflow_status: str,
    reopen_hold: bool = False,
) -> Optional[str]:
    if not (_is_closed_row(status, current_step, workflow_status) or reopen_hold):
        return None
    best: Optional[datetime] = None
    for cols in (
        field_ids.get("it_agent_activity") or [],
        field_ids.get("it_agent_after_dependency") or [],
        field_ids.get("it_agent_pickup") or [],
    ):
        for acted in _activity_acted_ats(_raw_field(data, *cols)):
            if best is None or acted > best:
                best = acted
    if best:
        return best.isoformat()
    raw = _raw_field(
        data,
        *field_ids.get("modified_at", []),
        "_modified_at",
        *field_ids.get("created_at", []),
    )
    return _iso_or_none(raw)


def _has_inprogress_activity(value: Any) -> bool:
    entries = value if isinstance(value, list) else ([value] if isinstance(value, dict) else [])
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        token = _status_token(str(entry.get("Status") or entry.get("status") or ""))
        if token == "inprogress":
            return True
    return False


def _is_process_completed(workflow_status: str) -> bool:
    return _status_token(workflow_status) in ("completed", "complete", "withdrawn")


def _can_reopen_ticket(
    current_step: str,
    workflow_status: str,
    data: Dict[str, Any],
    field_ids: Dict[str, List[str]],
) -> bool:
    if _is_process_completed(workflow_status):
        return False
    if _is_live_work_step(current_step):
        return False
    if _is_reopen_hold_step(current_step):
        return True
    if (current_step or "").strip():
        return False
    return _has_inprogress_activity(
        _raw_field(data, *field_ids.get("it_tech_reopen_activity", []))
    )


def _parse_minutes(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        for key in (
            "Closure_Time",
            "closure_time",
            "TurnAround_Time_TAT",
            "value",
            "Minutes",
            "minutes",
        ):
            parsed = _parse_minutes(value.get(key))
            if parsed:
                return parsed
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _datetime_from_value(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts = ts / 1000.0
        elif ts > 1e10:
            ts = ts / 1000.0
        if ts > 1e9:
            try:
                return datetime.fromtimestamp(ts, tz=timezone.utc)
            except (OverflowError, OSError, ValueError):
                return None
        return None
    if isinstance(value, dict):
        for key in (
            "Date",
            "date",
            "DateTime",
            "dateTime",
            "Value",
            "value",
            "ISO",
            "iso",
            "$date",
            "_seconds",
        ):
            if value.get(key) not in (None, ""):
                parsed = _datetime_from_value(value.get(key))
                if parsed:
                    return parsed
        return None
    if isinstance(value, list) and value:
        return _datetime_from_value(value[0])
    text = str(value).strip()
    if not text:
        return None
    ms = re.match(r"^/Date\((\d+)\)/$", text)
    if ms:
        return _datetime_from_value(int(ms.group(1)))
    iso = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(iso)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%d %b %Y %I:%M %p",
        "%d %b %Y",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
    ):
        try:
            dt = datetime.strptime(text, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    return _datetime_from_value(value)


def _activity_acted_ats(value: Any, skip_reopen: bool = True) -> List[datetime]:
    found: List[datetime] = []
    for entry in _activity_entries(value):
        step = str(
            entry.get("StepName")
            or entry.get("step")
            or entry.get("Name")
            or ""
        ).lower()
        if skip_reopen and ("reopen" in step or "employee feedback" in step):
            continue
        acted = _datetime_from_value(entry.get("ActedAt") or entry.get("actedAt"))
        if acted:
            found.append(acted)
    return found


def _is_reopened_flag(value: Any) -> bool:
    """Reopened_Ticket is true only for Yes/true/1."""
    if value is True or value == 1:
        return True
    if value is False or value == 0 or value is None:
        return False
    token = _status_token(_field_text(value) or _as_string(value))
    if token in ("no", "false", "0", ""):
        return False
    return token in ("yes", "true", "1", "reopened")


def _parse_rating(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    if isinstance(value, dict):
        return _parse_rating(
            value.get("value") or value.get("Ratings_emp") or value.get("Ratings")
        )
    try:
        rating = int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None
    if 1 <= rating <= 5:
        return rating
    return None


def _employee_ticket_status(
    item_status: str,
    workflow_status: str,
    current_step: str,
    reopened: Any,
    last_completed_step: str = "",
    reopen_hold: bool = False,
) -> str:
    """Closed hold first; Reopened_Ticket=true → Reopened; else Open/Closed."""
    _ = last_completed_step
    item = _status_token(item_status)
    wf = _status_token(workflow_status)
    if item in ("yes", "no", "true", "false"):
        item = ""

    if item in ("rejected", "reject", "declined") or wf in ("rejected", "reject", "declined"):
        return "Closed"
    if wf in ("completed", "complete", "withdrawn"):
        return "Closed"
    if reopen_hold or _is_reopen_hold_step(current_step):
        return "Closed"
    if _is_reopened_flag(reopened):
        return "Reopened"
    if item in ("closed", "close", "completed", "resolved"):
        if wf in ("inprogress", "pending", "draft", "assigned"):
            return "Open"
        return "Closed"
    if wf in ("inprogress", "pending", "draft", "assigned"):
        return "Open"
    if item == "open" or current_step:
        return "Open"
    return "Open"


def _open_sla_breached(
    data: Dict[str, Any],
    field_ids: Dict[str, List[str]],
    status: str,
) -> bool:
    # Open + Reopened are live work (same as aasik active SLA KPI).
    if status not in ("Open", "Reopened"):
        return False
    item_status = _lookup_field(data, *field_ids["item_status"], "SLA_Breached", "slaBreached")
    if "breach" in item_status.lower():
        return True
    sla_minutes = _parse_minutes(
        _raw_field(data, *field_ids["closure_minutes"], *field_ids["tat_minutes"])
    )
    if not sla_minutes:
        return False
    start = None
    acted = _activity_acted_ats(_raw_field(data, *field_ids["it_agent_activity"]))
    if acted:
        start = max(acted)
    if start is None:
        start = (
            _parse_datetime(_raw_field(data, *field_ids["requested_at"]))
            or _parse_datetime(_raw_field(data, *field_ids["created_at"]))
        )
    if start is None:
        return False
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - start.astimezone(timezone.utc)).total_seconds() / 60.0
    return elapsed > sla_minutes


def _parse_report_ticket(
    row: Any,
    columns: List[Any],
    index: int,
    entity: Optional[str] = None,
) -> Dict[str, Any]:
    data = _row_dict(row, columns)
    field_ids = REPORT_FIELD_IDS.get(_report_entity_key(entity), REPORT_FIELD_IDS["refex"])
    instance_id = (
        _lookup_field(data, *field_ids["instance_id"], "Id", "Instance_Id", "instance_id")
        or f"ticket_{index}"
    )
    request_id = _lookup_field(
        data,
        *field_ids["request_id"],
        "Request_ID",
        "RequestId",
        "Request_Id",
        "Request ID",
        "Ticket_ID",
        "TicketId",
    )
    if _looks_like_instance_id(request_id, instance_id):
        request_id = ""
    description = _lookup_field(
        data,
        *field_ids["description"],
        "Description",
        "User_Description",
        "Requestor_Description",
    )
    item_status = _lookup_field(
        data,
        *field_ids["item_status"],
        "Statu_1",
        "Validation",
        "ItemStatus",
        "Ticket_Status",
        "Ticket Status",
    )
    solution = _lookup_field(
        data,
        *field_ids.get("solution", []),
        "It_Agent_Solution",
        "IT_Agent_Solution",
    )
    employee_rating = _parse_rating(
        _raw_field(data, *field_ids.get("employee_rating", []), "Ratings_emp")
    )
    workflow_status = _lookup_field(
        data,
        *field_ids["status"],
        *field_ids["system_status"],
        "Status",
        "Statu",
        "Current_Status",
        "Flow_Status",
    )
    current_step = _lookup_field(data, *field_ids["current_step"], "Current_Step")
    last_completed_step = _lookup_field(
        data,
        *field_ids.get("last_completed_step", []),
        "last_completed_step_name",
        "Last_Completed_Step",
    )
    reopened_raw = _raw_field(
        data, *field_ids["reopened"], "Reopened_Ticket", "Reopened", "reopenedTicket"
    )
    if reopened_raw is None:
        reopened_raw = _lookup_field(
            data, *field_ids["reopened"], "Reopened_Ticket", "Reopened"
        )
    status = _employee_ticket_status(
        item_status,
        workflow_status,
        current_step,
        reopened_raw,
        last_completed_step,
        reopen_hold=False,
    )
    reopen_activity_id = _pick_open_reopen_activity_id(
        _raw_field(data, *field_ids["it_tech_reopen_activity"]),
        instance_id,
    )
    activity_instance_id = reopen_activity_id or _usable_activity_id(
        _lookup_field(
            data,
            *field_ids.get("activity_instance_id", []),
            "_activity_instance_id",
            "Activity_Instance_ID",
        ),
        instance_id,
    )
    reopen_hold = bool(reopen_activity_id) or _is_reopen_hold_step(current_step)
    if reopen_hold and status != "Reopened":
        status = "Closed"
    sendback_id = _sendback_id_from_report(
        data, field_ids, instance_id, reopen_activity_id or activity_instance_id
    )
    solution_raw = _raw_field(
        data,
        *field_ids.get("solution", []),
        "It_Agent_Solution",
        "IT_Agent_Solution",
    )
    assigned_raw = _raw_field(
        data,
        *field_ids.get("assigned_to", []),
        "_current_assigned_to",
        "Assigned_To",
    )
    assigned_user_raw = _raw_field(
        data,
        *field_ids.get("assigned_to_user", []),
        "Assigned_To_User",
    )
    solver = _solver_from_agent_fields(data, field_ids, solution_raw)
    assigned_to = _assigned_to_display(
        assigned_raw,
        assigned_user_raw,
        solver,
        status,
        current_step,
        workflow_status,
        reopen_hold,
    )
    closed_by = _closed_by_display(
        solver,
        status,
        current_step,
        workflow_status,
        reopen_hold,
    )
    created_on = _created_on_iso(data, field_ids)
    closed_on = _closed_on_iso(
        data, field_ids, status, current_step, workflow_status, reopen_hold
    )
    owner_emails = _row_owner_emails(data, field_ids)
    requester_email = next(iter(sorted(owner_emails)), "")
    return {
        "id": instance_id,
        "requestId": request_id or "—",
        "description": description,
        "status": status,
        "solution": solution,
        "assignedTo": assigned_to or "—",
        "closedBy": closed_by or "—",
        "createdOn": created_on,
        "closedOn": closed_on,
        "employeeRating": employee_rating,
        "reopened": _is_reopened_flag(reopened_raw),
        "currentStep": current_step,
        "lastCompletedStep": last_completed_step,
        "activityInstanceId": activity_instance_id,
        "sendbackId": sendback_id,
        "canReopen": _can_reopen_ticket(current_step, workflow_status, data, field_ids),
        "slaBreached": _open_sla_breached(data, field_ids, status),
        "localStatus": "created",
        "requesterEmail": requester_email,
        "_ownerEmails": list(owner_emails),
    }


def _norm_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _public_local_ticket(doc: Dict[str, Any]) -> Dict[str, Any]:
    local_status = (doc.get("local_status") or "pending").strip().lower()
    kf_status = (doc.get("kissflow_status") or "").strip()
    if local_status == "failed":
        status = "Failed"
    elif local_status == "pending":
        status = "Pending"
    else:
        status = kf_status or "Created"
    instance_id = doc.get("kissflow_instance_id") or doc.get("id")
    return {
        "id": instance_id,
        "localId": doc.get("id"),
        "requestId": doc.get("kissflow_request_id") or "—",
        "description": doc.get("description") or "",
        "status": status,
        "localStatus": local_status,
        "solution": doc.get("solution") or "",
        "assignedTo": doc.get("assigned_to") or "—",
        "closedBy": doc.get("closed_by") or "—",
        "createdOn": doc.get("created_on") or doc.get("created_at"),
        "closedOn": doc.get("closed_on"),
        "employeeRating": _parse_rating(doc.get("employee_rating")),
        "reopened": bool(doc.get("reopened")),
        "canReopen": local_status == "created" and bool(doc.get("can_reopen")),
        "activityInstanceId": doc.get("kissflow_activity_instance_id") or "",
        "sendbackId": (
            doc.get("kissflow_sendback_id")
            if doc.get("kissflow_sendback_id") and doc.get("kissflow_sendback_id") != instance_id
            else ""
        ),
        "slaBreached": bool(doc.get("sla_breached")),
        "createdAt": doc.get("created_at"),
        "entity": doc.get("entity"),
    }


def _match_report_ticket(
    report_tickets: List[Dict[str, Any]],
    description: str,
    claimed_ids: Set[str],
) -> Optional[Dict[str, Any]]:
    want = _norm_text(description)
    if not want:
        return None
    for ticket in report_tickets:
        inst = str(ticket.get("id") or "")
        if inst and inst in claimed_ids:
            continue
        got = _norm_text(ticket.get("description") or "")
        if got and (want == got or want in got or got in want):
            return ticket
    return None


async def _load_kissflow_report_tickets(
    cfg: Dict[str, Any],
    profile: Dict[str, str],
    email: str,
    entity: Optional[str] = None,
) -> List[Dict[str, Any]]:
    columns: List[Any] = []
    collected: List[Any] = []
    working_param = ""

    async with httpx.AsyncClient(timeout=60.0) as client:
        for email_param in ("$requestor_email", "$Email"):
            try:
                _url, response = await _fetch_process_report(
                    cfg, profile, email, 1, REPORT_PAGE_SIZE, email_param, client
                )
            except Exception:
                continue
            if response.status_code >= 400:
                continue
            try:
                payload = response.json()
            except Exception:
                payload = {}
            columns, page_rows = _extract_report_rows(payload)
            if page_rows:
                working_param = email_param
                collected.extend(page_rows)
                break

        page = 2
        while working_param and page <= REPORT_MAX_PAGES:
            if len(collected) < REPORT_PAGE_SIZE * (page - 1):
                break
            try:
                _url, response = await _fetch_process_report(
                    cfg, profile, email, page, REPORT_PAGE_SIZE, working_param, client
                )
            except Exception:
                break
            if response.status_code >= 400:
                break
            try:
                payload = response.json()
            except Exception:
                payload = {}
            next_columns, page_rows = _extract_report_rows(payload)
            if next_columns:
                columns = next_columns
            if not page_rows:
                break
            collected.extend(page_rows)
            if len(page_rows) < REPORT_PAGE_SIZE:
                break
            page += 1

    logger.info(
        "ITSM report entity=%s filter=%s rows=%s",
        entity,
        working_param or "$requestor_email",
        len(collected),
    )
    parsed = [_parse_report_ticket(row, columns, i, entity) for i, row in enumerate(collected)]
    want = _normalize_email(email)
    if not want:
        return []
    mine = []
    for ticket in parsed:
        owners = {
            _normalize_email(item)
            for item in (ticket.get("_ownerEmails") or [])
            if item
        }
        owners.add(_normalize_email(ticket.get("requesterEmail")))
        owners.discard("")
        if want in owners:
            ticket.pop("_ownerEmails", None)
            mine.append(ticket)
    logger.info(
        "ITSM report entity=%s user=%s kept=%s of %s",
        entity,
        want,
        len(mine),
        len(parsed),
    )
    return mine


class ReopenTicketRequest(BaseModel):
    entity: str = Field(..., min_length=1)
    instance_id: str = Field(..., min_length=1)
    activity_instance_id: Optional[str] = None
    sendback_id: Optional[str] = None
    note: str = Field(..., min_length=1)


class EmployeeRatingRequest(BaseModel):
    entity: str = Field(..., min_length=1)
    instance_id: str = Field(..., min_length=1)
    activity_instance_id: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)


class KissflowEntityApis(BaseModel):
    process_id: str = ""
    report_id: str = ""
    webhook_path: str = ""


class KissflowConnectionBlock(BaseModel):
    kissflow_base_url: str = ""
    account_id: str = ""
    access_key_id: str = ""
    access_key_secret: Optional[str] = None


class KissflowSharedApis(BaseModel):
    application_id: str = ""
    approval_matrix_id: str = ""
    refex: KissflowEntityApis = Field(default_factory=KissflowEntityApis)
    extrovis: KissflowEntityApis = Field(default_factory=KissflowEntityApis)


class KissflowEnvironmentsUpsert(BaseModel):
    active: str = "development"
    shared: KissflowSharedApis = Field(default_factory=KissflowSharedApis)
    development: KissflowConnectionBlock
    live: KissflowConnectionBlock


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

    async def _load_environment_doc() -> Optional[Dict[str, Any]]:
        """One Kissflow env for the whole app — not per logged-in user's org_id."""
        if db is None:
            return None
        doc = await db[ENV_COLLECTION].find_one({"scope": "global"}, {"_id": 0})
        if doc:
            return doc
        docs = await db[ENV_COLLECTION].find({}, {"_id": 0}).sort("updated_at", -1).to_list(20)
        if not docs:
            return None
        return docs[0]

    async def _load_environments(org_id: str) -> Dict[str, Any]:
        builtin = _builtin_environments()
        if db is None:
            return builtin
        doc = await _load_environment_doc()
        if not doc:
            seeded = {
                "scope": "global",
                "org_id": org_id,
                **builtin,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": "system",
            }
            await db[ENV_COLLECTION].update_one(
                {"scope": "global"}, {"$set": seeded}, upsert=True
            )
            return builtin
        shared_src = doc.get("shared") if isinstance(doc.get("shared"), dict) else {}
        if not shared_src:
            shared_src = _shared_from_legacy_block(doc.get("development") or {})
        return {
            "active": (doc.get("active") or "development").strip().lower(),
            "shared": _merge_shared(builtin["shared"], shared_src),
            "development": _merge_connection(builtin["development"], doc.get("development") or {}),
            "live": _merge_connection(builtin["live"], doc.get("live") or {}),
        }

    def _dump_model(model) -> Dict[str, Any]:
        return model.model_dump() if hasattr(model, "model_dump") else model.dict()

    def _submit_defaults_for_entity(cfg: Dict[str, Any], entity: Optional[str]) -> Dict[str, Any]:
        """Keep Refex catalog/matrix; Refex webhook vs Extrovis webhook for every other entity."""
        out = dict(cfg)
        out["webhook_path"] = _webhook_path_for_entity(entity)
        out["process_id"] = _process_id_for_entity(entity)
        return out

    async def _resolve_config(org_id: str, entity: Optional[str]) -> Dict[str, Any]:
        """Active Kissflow env only — Live never falls back to Development keys/URL."""
        envs = await _load_environments(org_id)
        name = envs.get("active") if envs.get("active") in ("development", "live") else "development"
        builtin = _builtin_environments()
        same_builtin = builtin.get(name) if isinstance(builtin.get(name), dict) else {}
        conn = envs.get(name) if isinstance(envs.get(name), dict) else {}
        # Fill gaps only from the SAME named block (dev→dev defaults, live→live defaults).
        base_url = (
            (conn.get("kissflow_base_url") or same_builtin.get("kissflow_base_url") or "")
            .strip()
            .rstrip("/")
        )
        account_id = (
            conn.get("account_id") or same_builtin.get("account_id") or ""
        ).strip()
        access_key_id = (
            conn.get("access_key_id") or same_builtin.get("access_key_id") or ""
        ).strip()
        access_key_secret = (
            conn.get("access_key_secret") or same_builtin.get("access_key_secret") or ""
        ).strip()
        if not base_url or not account_id or not access_key_id or not access_key_secret:
            label = "Live" if name == "live" else "Development"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Kissflow {label} environment is incomplete. "
                    f"Set base URL, account ID, and access keys in ITSM Setup, then activate {label}."
                ),
            )
        shared = envs.get("shared") or {}
        sl = _entity_api_slice(shared, entity)
        webhook = sl["webhook_path"] or _webhook_path_for_entity(entity)
        resolved = {
            "environment": name,
            "kissflow_base_url": base_url,
            "account_id": account_id,
            "application_id": shared.get("application_id") or KISSFLOW_APPLICATION_ID,
            "process_id": sl["process_id"] or _process_id_for_entity(entity),
            "report_id": sl["report_id"],
            "approval_matrix_id": shared.get("approval_matrix_id") or KISSFLOW_APPROVAL_MATRIX_ID,
            "webhook_path": _webhook_path_with_account(webhook, account_id),
            "access_key_id": access_key_id,
            "access_key_secret": access_key_secret,
            "source": "environment",
        }
        if entity and db is not None:
            docs = await _list_entity_docs(org_id, enabled_only=True)
            want = _normalize_entity_key(entity)
            for d in docs:
                key = _normalize_entity_key(d.get("entity_key") or "")
                display = _normalize_entity_key(d.get("display_name") or "")
                if want and (want == key or want == display):
                    if d.get("webhook_path"):
                        resolved["webhook_path"] = _webhook_path_with_account(
                            d.get("webhook_path"), account_id
                        )
                    resolved["entity_key"] = d.get("entity_key")
                    resolved["source"] = "environment+entity"
                    break
        logger.info(
            "ITSM resolve env=%s base=%s account=%s entity=%s",
            name,
            base_url,
            account_id,
            entity or "",
        )
        return resolved

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
        org_id = user.get("org_id") or ""
        entities = await _entity_options(org_id)
        active_env = "development"
        base_url = ""
        try:
            cfg = await _resolve_config(org_id, None)
            active_env = cfg.get("environment") or "development"
            base_url = cfg.get("kissflow_base_url") or ""
        except HTTPException:
            envs = await _load_environments(org_id)
            active_env = (
                envs.get("active")
                if envs.get("active") in ("development", "live")
                else "development"
            )
        return {
            "entityOptions": entities,
            "criticalityOptions": CRITICALITY_OPTIONS,
            "source": SOURCE_VALUE,
            "processId": KISSFLOW_PROCESS_ID,
            "activeEnvironment": active_env,
            "kissflowBaseUrl": base_url,
            "has_entity_configs": bool(
                await _list_entity_docs(org_id, enabled_only=True)
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
                "activeEnvironment": cfg.get("environment") or "development",
                **user_profile,
            }
        except Exception as exc:
            logger.warning("Kissflow status check failed: %s", exc)
            return {
                "ok": False,
                "status_code": 0,
                "base_url": cfg["kissflow_base_url"],
                "activeEnvironment": cfg.get("environment") or "development",
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
        result["activeEnvironment"] = cfg.get("environment") or "development"
        result["kissflowBaseUrl"] = cfg.get("kissflow_base_url") or ""
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
        active_env = cfg.get("environment") or "development"

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

        now = datetime.now(timezone.utc).isoformat()
        ticket_id = str(uuid.uuid4())
        local_doc = {
            "id": ticket_id,
            "org_id": user.get("org_id") or "",
            "user_id": user.get("id") or "",
            "email": email,
            "name": name,
            "entity": entity,
            "location": location,
            "sub_type": sub_type,
            "criticality": criticality,
            "description": description,
            "local_status": "pending",
            "kissflow_env": active_env,
            "kissflow_request_id": "",
            "kissflow_instance_id": "",
            "kissflow_status": "",
            "created_at": now,
            "updated_at": now,
        }
        if db is not None:
            await db[LOCAL_TICKETS].insert_one(dict(local_doc))

        url = f"{cfg['kissflow_base_url']}{cfg['webhook_path']}"
        raw = None
        webhook_ok = False
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    url, headers=_kissflow_headers(cfg), json=webhook_body
                )
            try:
                raw = response.json()
            except Exception:
                raw = response.text
            webhook_ok = 200 <= response.status_code < 300
        except Exception as exc:
            logger.exception("ITSM webhook submit failed for entity=%s", entity)
            local_doc["local_status"] = "failed"
            local_doc["error"] = str(exc)
            local_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            if db is not None:
                await db[LOCAL_TICKETS].update_one({"id": ticket_id}, {"$set": {
                    "local_status": "failed",
                    "error": str(exc),
                    "updated_at": local_doc["updated_at"],
                }})
            return {
                "success": False,
                "status": "failed",
                "message": "Unable to submit ticket to Kissflow.",
                "entity": entity,
                "ticket": _public_local_ticket(local_doc),
            }

        # Kissflow often returns success even when the item was not created.
        # Confirm against the process report before marking created.
        matched = None
        report_profile = None
        try:
            report_profile = {
                "process_id": cfg.get("process_id") or "",
                "report_id": cfg.get("report_id") or "",
            }
            if not report_profile["report_id"]:
                report_profile = _report_profile(entity)
        except HTTPException:
            report_profile = None

        if webhook_ok and report_profile and db is not None:
            claimed = {
                d.get("kissflow_instance_id")
                for d in await db[LOCAL_TICKETS].find(
                    {
                        "user_id": user.get("id") or "",
                        "local_status": "created",
                        "kissflow_instance_id": {"$nin": ["", None]},
                    },
                    {"_id": 0, "kissflow_instance_id": 1},
                ).to_list(1000)
            }
            claimed.discard(None)
            claimed.discard("")
            for _attempt in range(VERIFY_ATTEMPTS):
                await asyncio.sleep(VERIFY_DELAY_SEC)
                report_tickets = await _load_kissflow_report_tickets(
                    cfg, report_profile, email, entity
                )
                matched = _match_report_ticket(report_tickets, description, claimed)
                if matched:
                    break

        if matched:
            local_doc["local_status"] = "created"
            local_doc["kissflow_request_id"] = matched.get("requestId") or ""
            local_doc["kissflow_instance_id"] = matched.get("id") or ""
            local_doc["kissflow_status"] = matched.get("status") or "Created"
            local_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
            local_doc["can_reopen"] = bool(matched.get("canReopen"))
            local_doc["kissflow_current_step"] = matched.get("currentStep") or ""
            if db is not None:
                await db[LOCAL_TICKETS].update_one({"id": ticket_id}, {"$set": {
                    "local_status": "created",
                    "kissflow_request_id": local_doc["kissflow_request_id"],
                    "kissflow_instance_id": local_doc["kissflow_instance_id"],
                    "kissflow_status": local_doc["kissflow_status"],
                    "can_reopen": local_doc["can_reopen"],
                    "kissflow_current_step": local_doc["kissflow_current_step"],
                    "updated_at": local_doc["updated_at"],
                    "webhook_http_ok": webhook_ok,
                }})
            return {
                "success": True,
                "status": "created",
                "message": "Ticket created in Kissflow.",
                "entity": entity,
                "ticket": _public_local_ticket(local_doc),
            }

        local_doc["local_status"] = "failed"
        local_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        local_doc["error"] = "Not found in Kissflow report after submit"
        if db is not None:
            await db[LOCAL_TICKETS].update_one({"id": ticket_id}, {"$set": {
                "local_status": "failed",
                "updated_at": local_doc["updated_at"],
                "error": local_doc["error"],
                "webhook_http_ok": webhook_ok,
                "webhook_raw": str(raw)[:500] if raw is not None else "",
            }})
        return {
            "success": False,
            "status": "failed",
            "message": "Kissflow did not create the ticket. It is marked as failed.",
            "entity": entity,
            "ticket": _public_local_ticket(local_doc),
        }

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

    @api_router.get("/itsm/admin/environments")
    async def admin_get_environments(user: dict = Depends(get_current_user)):
        _require_admin(user)
        envs = await _load_environments(user.get("org_id") or "")
        active = envs.get("active") if envs.get("active") in ("development", "live") else "development"
        return {
            "active": active,
            "shared": _public_shared(envs.get("shared") or {}),
            "development": _public_connection(envs["development"]),
            "live": _public_connection(envs["live"]),
        }

    @api_router.put("/itsm/admin/environments")
    async def admin_save_environments(
        body: KissflowEnvironmentsUpsert,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")
        org_id = user.get("org_id") or ""
        builtin = _builtin_environments()
        existing = (await _load_environment_doc()) or {}
        active = (body.active or "development").strip().lower()
        if active not in ("development", "live"):
            raise HTTPException(status_code=400, detail="active must be development or live")
        existing_shared = existing.get("shared") if isinstance(existing.get("shared"), dict) else {}
        if not existing_shared:
            existing_shared = _shared_from_legacy_block(existing.get("development") or {})
        shared = _merge_shared(
            _merge_shared(builtin["shared"], existing_shared),
            _dump_model(body.shared),
        )
        development = _merge_connection(
            _merge_connection(builtin["development"], existing.get("development") or {}),
            _dump_model(body.development),
        )
        live = _merge_connection(
            _merge_connection(builtin["live"], existing.get("live") or {}),
            _dump_model(body.live),
        )
        if active == "live" and (
            not live.get("kissflow_base_url")
            or not live.get("account_id")
            or not live.get("access_key_id")
            or not live.get("access_key_secret")
        ):
            raise HTTPException(
                status_code=400,
                detail="Live is incomplete. Fill Live URL, account ID, and access keys before activating Live.",
            )
        doc = {
            "scope": "global",
            "org_id": org_id,
            "active": active,
            "shared": shared,
            "development": development,
            "live": live,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": user.get("email"),
        }
        await db[ENV_COLLECTION].update_one(
            {"scope": "global"},
            {"$set": doc},
            upsert=True,
        )
        logger.info(
            "ITSM environments saved by=%s org=%s active=%s live_host=%s",
            user.get("email"),
            org_id,
            active,
            live.get("kissflow_base_url") or "",
        )
        return {
            "ok": True,
            "active": active,
            "shared": _public_shared(shared),
            "development": _public_connection(development),
            "live": _public_connection(live),
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
            webhook = _webhook_path_for_entity(name)
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "entity_key": name,
                "display_name": name,
                "kissflow_base_url": KISSFLOW_BASE_URL,
                "account_id": KISSFLOW_ACCOUNT_ID,
                "application_id": KISSFLOW_APPLICATION_ID,
                "process_id": _process_id_for_entity(name),
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

    @api_router.get("/itsm/reports")
    async def list_my_tickets(
        entity: str = Query(...),
        page_number: int = Query(1, ge=1),
        page_size: int = Query(REPORT_PAGE_SIZE, ge=1, le=500),
        user: dict = Depends(get_current_user),
    ):
        email = (user.get("email") or "").strip()
        if not email:
            raise HTTPException(status_code=400, detail="User email is required to load tickets.")
        if db is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

        cfg = await _resolve_config(user.get("org_id") or "", entity)
        active_env = cfg.get("environment") or "development"
        report_profile = {
            "process_id": cfg.get("process_id") or "",
            "report_id": cfg.get("report_id") or _report_profile(entity)["report_id"],
        }

        user_id = user.get("id") or ""
        email_rx = {"$regex": f"^{re.escape(email)}$", "$options": "i"}
        local_query: Dict[str, Any] = {
            "entity": {"$regex": f"^{re.escape(entity.strip())}$", "$options": "i"},
        }
        if user_id:
            local_query["$or"] = [{"user_id": user_id}, {"email": email_rx}]
        else:
            local_query["email"] = email_rx
        all_local = await db[LOCAL_TICKETS].find(
            local_query,
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)

        def _local_env(doc: Dict[str, Any]) -> str:
            return str(doc.get("kissflow_env") or "").strip().lower()

        # Only local rows for the active Kissflow env (pending/failed may be untagged once).
        local_docs = []
        for doc in all_local:
            env = _local_env(doc)
            status = (doc.get("local_status") or "").lower()
            if env in ("development", "live"):
                if env == active_env:
                    local_docs.append(doc)
            elif status in ("pending", "failed"):
                local_docs.append(doc)

        report_tickets: List[Dict[str, Any]] = []
        report_error = ""
        try:
            report_tickets = await _load_kissflow_report_tickets(
                cfg, report_profile, email, entity
            )
        except Exception as exc:
            report_error = str(exc)
            logger.warning(
                "ITSM dashboard Kissflow report failed env=%s base=%s: %s",
                active_env,
                cfg.get("kissflow_base_url"),
                exc,
            )

        claimed = {
            str(d.get("kissflow_instance_id") or "")
            for d in local_docs
            if (d.get("local_status") == "created" and d.get("kissflow_instance_id"))
        }
        claimed.discard("")

        matched_local_ids: Set[str] = set()
        for doc in local_docs:
            local_status = (doc.get("local_status") or "").lower()
            inst = str(doc.get("kissflow_instance_id") or "")
            matched = None
            if inst:
                matched = next((t for t in report_tickets if str(t.get("id") or "") == inst), None)
            if matched is None and local_status in ("pending", "failed", "created"):
                skip_ids = set(claimed)
                if inst:
                    skip_ids.discard(inst)
                matched = _match_report_ticket(report_tickets, doc.get("description") or "", skip_ids)
            if not matched:
                continue
            matched_local_ids.add(str(doc.get("id") or ""))
            req_id = matched.get("requestId") or ""
            if req_id in ("", "—"):
                req_id = doc.get("kissflow_request_id") or ""
            matched_status = matched.get("status") or doc.get("kissflow_status") or "Created"
            matched_reopened = bool(matched.get("reopened"))
            # Keep local Reopened until Kissflow Reopened_Ticket catches up after sendback.
            if doc.get("reopened") and matched_status == "Open" and not matched.get("reopened"):
                matched_status = "Reopened"
                matched_reopened = True
            updates = {
                "local_status": "created",
                "kissflow_env": active_env,
                "kissflow_request_id": req_id,
                "kissflow_instance_id": matched.get("id") or inst,
                "kissflow_status": matched_status,
                "solution": matched.get("solution") or doc.get("solution") or "",
                "assigned_to": matched.get("assignedTo") or doc.get("assigned_to") or "—",
                "closed_by": matched.get("closedBy") or doc.get("closed_by") or "—",
                "created_on": matched.get("createdOn") or doc.get("created_on") or doc.get("created_at"),
                "closed_on": matched.get("closedOn") or doc.get("closed_on"),
                "employee_rating": matched.get("employeeRating")
                if matched.get("employeeRating") is not None
                else doc.get("employee_rating"),
                "reopened": matched_reopened,
                "sla_breached": bool(matched.get("slaBreached")),
                "can_reopen": bool(matched.get("canReopen")),
                "kissflow_current_step": matched.get("currentStep") or "",
                "kissflow_activity_instance_id": matched.get("activityInstanceId") or "",
                "kissflow_sendback_id": matched.get("sendbackId") or "",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            doc.update(updates)
            claimed.add(str(doc.get("kissflow_instance_id") or ""))
            await db[LOCAL_TICKETS].update_one({"id": doc["id"]}, {"$set": updates})

        # Active Kissflow report is the source of truth; only add in-flight local rows
        # that are not already present in the report.
        tickets: List[Dict[str, Any]] = list(report_tickets)
        seen_ids = {str(t.get("id") or "") for t in tickets}
        for doc in local_docs:
            local_status = (doc.get("local_status") or "").lower()
            inst = str(doc.get("kissflow_instance_id") or "")
            if inst and inst in seen_ids:
                continue
            if local_status in ("pending", "failed"):
                tickets.append(_public_local_ticket(doc))
                continue
            # Created locally for this env but not yet visible in the report.
            if local_status == "created" and _local_env(doc) == active_env and str(doc.get("id") or "") not in matched_local_ids:
                pub = _public_local_ticket(doc)
                rid = str(pub.get("id") or "")
                if rid and rid not in seen_ids:
                    tickets.append(pub)
                    seen_ids.add(rid)

        return {
            "entity": entity,
            "requestorEmail": email,
            "activeEnvironment": active_env,
            "kissflowBaseUrl": cfg.get("kissflow_base_url") or "",
            "reportError": report_error or None,
            "tickets": tickets,
            "count": len(tickets),
            "pageNumber": page_number,
            "pageSize": page_size,
        }

    @api_router.post("/itsm/reports/reopen")
    async def reopen_ticket(
        body: ReopenTicketRequest,
        user: dict = Depends(get_current_user),
    ):
        cfg = await _resolve_config(user.get("org_id") or "", body.entity)
        instance_id = (body.instance_id or "").strip()
        note = (body.note or "").strip()
        if not instance_id:
            raise HTTPException(status_code=400, detail="Ticket id is required")
        if not note:
            raise HTTPException(status_code=400, detail="Please enter why you need to reopen this ticket.")
        requester_email = str(user.get("email") or "").strip()
        requester_name = (
            str(user.get("name") or "").strip()
            or " ".join(
                part
                for part in (
                    str(user.get("first_name") or "").strip(),
                    str(user.get("last_name") or "").strip(),
                )
                if part
            )
            or requester_email
        )
        kissflow_note = note
        identity_bits = []
        if requester_name:
            identity_bits.append(f"Requester: {requester_name}")
        if requester_email:
            identity_bits.append(f"Email: {requester_email}")
        if identity_bits:
            kissflow_note = f"{note}\n\n" + "\n".join(identity_bits)
        # Frontend may hint ids; backend always resolves to match Kissflow format:
        # POST .../{instance}/{reopen_activity}/sendback?_application_id=...
        # body {"Note":"...","_id":"<IT Agent completed activity>"}
        process_id = cfg.get("process_id") or _report_profile(body.entity)["process_id"]
        cfg = {**cfg, "process_id": process_id}
        activity_instance_id, sendback_id = await _resolve_reopen_ids(
            cfg,
            body.entity,
            instance_id,
            (body.activity_instance_id or "").strip(),
            (body.sendback_id or "").strip(),
        )
        if not activity_instance_id:
            raise HTTPException(
                status_code=400,
                detail="This ticket is not on the reopen step, or the reopen task id could not be found.",
            )
        if not sendback_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not find the IT support activity id for sendback. "
                    "Expected body like {_id: IT-Agent-activity, Note: reason}."
                ),
            )
        url = (
            f"{cfg['kissflow_base_url']}/process/2/{cfg['account_id']}/"
            f"{process_id}/{instance_id}/{activity_instance_id}/sendback"
        )
        params = {"_application_id": cfg.get("application_id") or REPORT_APPLICATION_ID}
        payload = {"Note": kissflow_note, "_id": sendback_id}
        logger.info(
            "ITSM reopen Kissflow POST %s?_application_id=%s payload=%s",
            url,
            params["_application_id"],
            payload,
        )
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    headers=_kissflow_headers(cfg),
                    params=params,
                    json=payload,
                )
        except Exception as exc:
            logger.exception("ITSM sendback failed instance=%s", instance_id)
            raise HTTPException(status_code=502, detail=f"Unable to reopen ticket: {exc}") from exc

        raw = None
        try:
            raw = response.json()
        except Exception:
            raw = response.text

        success_text = ""
        if isinstance(raw, dict):
            success_text = str(
                raw.get("Success") or raw.get("success") or raw.get("message") or raw.get("en_message") or ""
            ).strip()
        if 200 <= response.status_code < 300:
            if success_text and re.search(r"fail|error", success_text, re.I):
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"{success_text} "
                        f"(Kissflow sendback _id={sendback_id}, activity={activity_instance_id})"
                    ).strip(),
                )
            # Immediately mark as Reopened so KPI updates before Kissflow report refreshes.
            if db is not None:
                now = datetime.now(timezone.utc).isoformat()
                await db[LOCAL_TICKETS].update_many(
                    {
                        "user_id": user.get("id") or "",
                        "kissflow_instance_id": instance_id,
                    },
                    {"$set": {
                        "kissflow_status": "Reopened",
                        "reopened": True,
                        "can_reopen": False,
                        "reopen_note": kissflow_note,
                        "updated_at": now,
                    }},
                )
            return {
                "success": True,
                "message": success_text or "Sent back successfully",
                "instanceId": instance_id,
                "status": "Reopened",
            }

        detail = "Unable to reopen ticket."
        if isinstance(raw, dict):
            detail = (
                raw.get("message")
                or raw.get("error")
                or raw.get("Error")
                or raw.get("Success")
                or detail
            )
        elif raw:
            detail = str(raw)[:240]
        raise HTTPException(
            status_code=502,
            detail=(
                f"{detail} "
                f"(Kissflow POST .../{instance_id}/{activity_instance_id}/sendback "
                f"body _id={sendback_id})"
            ).strip(),
        )

    @api_router.post("/itsm/reports/rating")
    async def submit_employee_rating(
        body: EmployeeRatingRequest,
        user: dict = Depends(get_current_user),
    ):
        cfg = await _resolve_config(user.get("org_id") or "", body.entity)
        instance_id = (body.instance_id or "").strip()
        if not instance_id:
            raise HTTPException(status_code=400, detail="Ticket id is required")
        rating = int(body.rating)
        if db is not None:
            existing = await db[LOCAL_TICKETS].find_one(
                {
                    "user_id": user.get("id") or "",
                    "kissflow_instance_id": instance_id,
                },
                {"_id": 0, "employee_rating": 1, "can_reopen": 1},
            )
            if existing and _parse_rating(existing.get("employee_rating")):
                raise HTTPException(status_code=400, detail="Rating is already submitted for this ticket.")

        activity_instance_id = (body.activity_instance_id or "").strip() or instance_id
        process_id = cfg.get("process_id") or _report_profile(body.entity)["process_id"]
        url = (
            f"{cfg['kissflow_base_url']}/process/2/{cfg['account_id']}/"
            f"{process_id}/{instance_id}/{activity_instance_id}"
        )
        params = {"_application_id": cfg.get("application_id") or REPORT_APPLICATION_ID}
        payload = {"_id": instance_id, "Ratings_emp": rating}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    headers=_kissflow_headers(cfg),
                    params=params,
                    json=payload,
                )
        except Exception as exc:
            logger.exception("ITSM employee rating failed instance=%s", instance_id)
            raise HTTPException(status_code=502, detail=f"Unable to save rating: {exc}") from exc

        raw = None
        try:
            raw = response.json()
        except Exception:
            raw = response.text

        if 200 <= response.status_code < 300:
            saved = rating
            if isinstance(raw, dict):
                saved = _parse_rating(raw.get("Ratings_emp")) or rating
            if db is not None:
                now = datetime.now(timezone.utc).isoformat()
                await db[LOCAL_TICKETS].update_many(
                    {
                        "user_id": user.get("id") or "",
                        "kissflow_instance_id": instance_id,
                    },
                    {"$set": {"employee_rating": saved, "updated_at": now}},
                )
            return {
                "success": True,
                "rating": saved,
                "instanceId": instance_id,
            }

        detail = "Unable to save rating."
        if isinstance(raw, dict):
            detail = (
                raw.get("message")
                or raw.get("error")
                or raw.get("Error")
                or raw.get("Success")
                or detail
            )
        elif raw:
            detail = str(raw)[:240]
        raise HTTPException(status_code=502, detail=str(detail))
