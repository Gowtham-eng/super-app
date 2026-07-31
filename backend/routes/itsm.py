"""
ITSM ticket proxy — Kissflow approval matrix + webhook submit.
Mirrors itsm_ticket_mobile (without supporting documents).
"""
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
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
ENTITY_OPTIONS = ["Refex", "Extrovis", "ModePro"]
CRITICALITY_OPTIONS = ["Low", "Medium", "High", "Critical"]
SOURCE_VALUE = "Mobile"
APPROVAL_MATRIX_PAGE_SIZE = 500


class TicketSubmitRequest(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    entity: str = Field(..., min_length=1)
    location: str = Field(..., min_length=1)
    sub_type: str = Field(..., min_length=1)
    criticality: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


def _kissflow_headers() -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Access-Key-Id": KISSFLOW_ACCESS_KEY_ID,
        "X-Access-Key-Secret": KISSFLOW_ACCESS_KEY_SECRET,
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

    return {
        "id": record_id,
        "ticketType": _as_string(data.get("Ticket_Type")),
        "entity": _as_string(data.get("Entity")),
        "category": _as_string(data.get("Category")),
        "subCategory": _as_string(data.get("SubCategory")),
        "subType": _as_string(data.get("Sub_Type")),
        "type": _as_string(data.get("Type")),
        "criticality": _as_string(data.get("Criticality")),
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


def register_itsm_routes(api_router: APIRouter, get_current_user, db=None):
    """Register ITSM proxy routes (requires IAM auth)."""

    async def _user_kissflow_profile(user: dict) -> Dict[str, Any]:
        kissflow_user_id = None
        if db is not None and user.get("id"):
            full = await db.users.find_one(
                {"id": user["id"]},
                {"_id": 0, "kissflow_user_id": 1},
            )
            kissflow_user_id = (full or {}).get("kissflow_user_id")
        in_kissflow = bool(kissflow_user_id and str(kissflow_user_id).strip())
        return {
            "user_in_kissflow": in_kissflow,
            "kissflow_user_id": kissflow_user_id if in_kissflow else None,
        }

    @api_router.get("/itsm/config")
    async def itsm_config(user: dict = Depends(get_current_user)):
        return {
            "entityOptions": ENTITY_OPTIONS,
            "criticalityOptions": CRITICALITY_OPTIONS,
            "source": SOURCE_VALUE,
            "processId": KISSFLOW_PROCESS_ID,
        }

    @api_router.get("/itsm/kissflow-status")
    async def kissflow_status(user: dict = Depends(get_current_user)):
        """Kissflow reachability + whether the logged-in user exists in Kissflow."""
        user_profile = await _user_kissflow_profile(user)
        path = (
            f"/form/2/{KISSFLOW_ACCOUNT_ID}/{KISSFLOW_APPROVAL_MATRIX_ID}/list"
            f"?page_number=1&page_size=1"
            f"&_application_id={KISSFLOW_APPLICATION_ID}"
        )
        url = f"{KISSFLOW_BASE_URL}{path}"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, headers=_kissflow_headers())
            ok = 200 <= response.status_code < 300
            return {
                "ok": ok,
                "status_code": response.status_code,
                "base_url": KISSFLOW_BASE_URL,
                **user_profile,
            }
        except Exception as exc:
            logger.warning("Kissflow status check failed: %s", exc)
            return {
                "ok": False,
                "status_code": 0,
                "base_url": KISSFLOW_BASE_URL,
                "error": str(exc),
                **user_profile,
            }

    @api_router.get("/itsm/approval-matrix")
    async def get_approval_matrix(user: dict = Depends(get_current_user)):
        path = (
            f"/form/2/{KISSFLOW_ACCOUNT_ID}/{KISSFLOW_APPROVAL_MATRIX_ID}/list"
            f"?page_number=1&page_size={APPROVAL_MATRIX_PAGE_SIZE}"
            f"&_application_id={KISSFLOW_APPLICATION_ID}"
        )
        url = f"{KISSFLOW_BASE_URL}{path}"
        last_error: Optional[Exception] = None

        for attempt in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.get(url, headers=_kissflow_headers())
                if response.status_code >= 400:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Failed to load approval matrix ({response.status_code})",
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
                    "entityOptions": ENTITY_OPTIONS,
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

        webhook_body = {
            "process_id": KISSFLOW_PROCESS_ID,
            "Source": SOURCE_VALUE,
            "Name": name,
            "Email": email,
            "Entity": entity,
            "Location_user": location,
            "Sub_Type": sub_type,
            "Criticality": criticality,
            "Description": description,
        }

        url = f"{KISSFLOW_BASE_URL}{KISSFLOW_WEBHOOK_PATH}"
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    url, headers=_kissflow_headers(), json=webhook_body
                )
        except Exception as exc:
            logger.exception("ITSM webhook submit failed")
            raise HTTPException(
                status_code=502, detail=f"Unable to submit ticket: {exc}"
            ) from exc

        raw = None
        try:
            raw = response.json()
        except Exception:
            raw = response.text

        if 200 <= response.status_code < 300 and _raw_body_indicates_success(raw):
            return {"success": True, "message": "Submitted successfully"}

        if isinstance(raw, dict) and _raw_body_indicates_success(raw):
            return {"success": True, "message": raw.get("message") or "Submitted successfully"}

        if 200 <= response.status_code < 300:
            return {"success": True, "message": "Submitted successfully"}

        detail = "Unable to submit ticket."
        if isinstance(raw, dict):
            detail = raw.get("message") or raw.get("error") or detail
        raise HTTPException(status_code=502, detail=detail)
