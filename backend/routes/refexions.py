"""
Refexions web chat — Kissflow WhatsApp BOT Config menus, IT ticket create, policy send.

Secrets stay on the server. Bot-config GETs use Live Kissflow (dataset lives on
AcCMptlq60zH). Ticket create follows the active ITSM Setup environment.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any, Callable, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("refexions")

BOT_DATASET = "Whatsapp_BOT_Config"
ML_KEYWORD_URL = os.environ.get(
    "REFEXIONS_ML_URL",
    "https://keyword-matching-api-645830234926.asia-south1.run.app/api/v1/keyword-match",
)


DEFAULT_POLICY_SERVICE_URL = "https://policy-sender-645830234926.asia-south1.run.app"


def _policy_service_url() -> str:
    raw = (os.environ.get("REFEXIONS_POLICY_SERVICE_URL") or DEFAULT_POLICY_SERVICE_URL).strip()
    return raw.rstrip("/")


def _policy_send_url() -> str:
    base = _policy_service_url()
    if base.endswith("/v1/documents/send"):
        return base
    return f"{base}/v1/documents/send"


def _policy_api_key() -> str:
    return (os.environ.get("REFEXIONS_POLICY_API_KEY") or "").strip()


def _policy_template_id() -> str:
    return os.environ.get("REFEXIONS_POLICY_TEMPLATE_ID", "policy_share_v1") or "policy_share_v1"

FALLBACK_MAIN = ["Expense", "Travel", "IT HelpDesk", "Policies"]
FALLBACK_EXPENSE_SUB = ["Food", "Accommodation", "Local Conveyance", "Travel Ticket"]
FALLBACK_TRAVEL_SUB = ["Domestic", "International"]

POLICIES = [
    {
        "title": "Data Privacy",
        "description": "Data Privacy & Protection Policy",
        "document_id": "data_privacy_policy",
    },
    {
        "title": "Domestic Travel",
        "description": "Domestic Travel Policy",
        "document_id": "domestic_travel_policy",
    },
    {
        "title": "IT Asset Management",
        "description": "IT asset allocation and return",
        "document_id": "it_asset_policy",
    },
    {
        "title": "IT Data Security",
        "description": "Data handling and security rules",
        "document_id": "it_data_security_policy",
    },
    {
        "title": "IT Policy",
        "description": "General IT usage policy",
        "document_id": "it_policy",
    },
    {
        "title": "POSH",
        "description": "Prevention of Sexual Harassment",
        "document_id": "posh_policy",
    },
    {
        "title": "Recruitment",
        "description": "Hiring and recruitment process",
        "document_id": "recruitment_policy",
    },
    {
        "title": "Salary Advance",
        "description": "Applying for a salary advance",
        "document_id": "salary_advance_policy",
    },
]

SUBMENU_NAMES = {
    "expense": "02-SubMenu",
    "travel": "03-SubMenu",
}


class ItMatchRequest(BaseModel):
    mail_body: str = Field(..., min_length=1)


class ItCreateRequest(BaseModel):
    description: str = Field(..., min_length=1)
    sub_type: str = Field(..., min_length=1)
    name: Optional[str] = None
    email: Optional[str] = None
    entity: Optional[str] = None
    location: Optional[str] = None
    criticality: str = "Medium"


class PolicySendRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    title: Optional[str] = None
    user_email: Optional[str] = None


def _split_menu(value: Any) -> List[str]:
    text = str(value or "").replace("|", ",")
    return [part.strip() for part in text.split(",") if part.strip()]


def _unwrap_dataset(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, list):
        return [row for row in raw if isinstance(row, dict)]
    if isinstance(raw, dict):
        for key in ("Data", "data", "Values", "values", "Items", "items"):
            nested = raw.get(key)
            if isinstance(nested, list):
                return [row for row in nested if isinstance(row, dict)]
        if raw.get("Name") or raw.get("Main_Menu") or raw.get("Message"):
            return [raw]
    return []


def _row_name(row: Dict[str, Any]) -> str:
    return str(row.get("Name") or row.get("name") or "").strip()


def _pick_named_row(rows: List[Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    wanted = (name or "").strip().lower()
    for row in rows:
        if _row_name(row).lower() == wanted:
            return row
    return rows[0] if rows else None


def _map_entity(value: str) -> str:
    token = re.sub(r"[\s_-]+", " ", (value or "").strip().lower())
    if "extrovis" in token:
        return "Extrovis"
    if "modepro" in token or "mode pro" in token:
        return "ModePro"
    if "pharma" in token and "pack" in token:
        return "Pharma Pack"
    if "kavis" in token:
        return "Kavis"
    if "refex" in token:
        return "Refex"
    return (value or "").strip()


def _policy_by_id(document_id: str) -> Optional[Dict[str, str]]:
    wanted = (document_id or "").strip().lower()
    for row in POLICIES:
        if row["document_id"] == wanted:
            return row
    return None


def register_refexions_routes(api_router: APIRouter, get_current_user, resolve_config: Callable):
    from routes.itsm import CRITICALITY_OPTIONS, SOURCE_VALUE, _kissflow_headers

    async def _live_cfg(user: dict) -> Dict[str, Any]:
        org_id = user.get("org_id") or ""
        try:
            return await resolve_config(org_id, None, force_env="live")
        except HTTPException:
            return await resolve_config(org_id, None)

    async def _fetch_bot_rows(cfg: Dict[str, Any], name: str) -> List[Dict[str, Any]]:
        account = cfg.get("account_id") or ""
        base = (cfg.get("kissflow_base_url") or "").rstrip("/")
        if not account or not base:
            return []
        url = f"{base}/dataset/2/{account}/{BOT_DATASET}"
        headers = _kissflow_headers(cfg)
        params_list = [
            {"Name": name},
            {"$filter": f"Name eq '{name}'"},
        ]
        async with httpx.AsyncClient(timeout=45.0) as client:
            for params in params_list:
                try:
                    response = await client.get(url, headers=headers, params=params)
                except Exception as exc:
                    logger.warning("Refexions bot-config GET failed name=%s: %s", name, exc)
                    continue
                if response.status_code >= 400:
                    continue
                try:
                    raw = response.json()
                except Exception:
                    continue
                rows = _unwrap_dataset(raw)
                picked = [row for row in rows if _row_name(row).lower() == name.lower()] or rows
                if picked:
                    return picked
        return []

    @api_router.get("/refexions/main-menu")
    async def main_menu(user: dict = Depends(get_current_user)):
        cfg = await _live_cfg(user)
        rows = await _fetch_bot_rows(cfg, "01-MainMenu")
        row = _pick_named_row(rows, "01-MainMenu") or {}
        options = _split_menu(row.get("Main_Menu")) or list(FALLBACK_MAIN)
        return {
            "success": True,
            "source": "kissflow" if row else "fallback",
            "message": str(row.get("Message") or "Please choose from the following").strip(),
            "options": options,
            "environment": cfg.get("environment") or "live",
        }

    @api_router.get("/refexions/sub-menu")
    async def sub_menu(
        main: str = Query(..., min_length=1),
        user: dict = Depends(get_current_user),
    ):
        selected = (main or "").strip()
        key = selected.lower().replace(" ", "")
        name = SUBMENU_NAMES.get("expense" if "expense" in key else "travel" if "travel" in key else "")
        cfg = await _live_cfg(user)
        row: Dict[str, Any] = {}
        if name:
            rows = await _fetch_bot_rows(cfg, name)
            for candidate in rows:
                menu = str(candidate.get("Main_Menu") or "").strip()
                if not menu or menu.lower() == selected.lower() or selected.lower() in menu.lower():
                    row = candidate
                    break
            if not row and rows:
                row = rows[0]
        options = _split_menu(row.get("Sub_Menu"))
        if not options:
            if "expense" in key:
                options = list(FALLBACK_EXPENSE_SUB)
            elif "travel" in key:
                options = list(FALLBACK_TRAVEL_SUB)
        coming_soon = "expense" in key or "travel" in key
        return {
            "success": True,
            "source": "kissflow" if row else "fallback",
            "main": selected,
            "message": str(row.get("Message") or "Please select the application").strip(),
            "options": options,
            "intent": str(row.get("Intent") or "Create").strip(),
            "comingSoon": coming_soon,
            "comingSoonMessage": (
                "Receipt upload and OCR for Expense / Travel will land in the next release. "
                "Use the Expense or Travel app for now."
            ),
        }

    @api_router.get("/refexions/policies")
    async def list_policies(user: dict = Depends(get_current_user)):
        void = user  # auth required
        del void
        return {
            "success": True,
            "message": "Select a policy to email it to yourself.",
            "policies": POLICIES,
        }

    @api_router.post("/refexions/it/match")
    async def match_it_subtype(
        body: ItMatchRequest,
        user: dict = Depends(get_current_user),
    ):
        void = user
        del void
        text = (body.mail_body or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Please describe the issue.")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(ML_KEYWORD_URL, json={"mail_body": text})
            raw = {}
            try:
                raw = response.json()
            except Exception:
                raw = {}
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail="Could not classify this issue right now. Try again.",
                )
            sub_type = str(raw.get("sub_type") or raw.get("subType") or "").strip() or "Other"
            return {
                "success": True,
                "sub_type": sub_type,
                "matched_keyword": raw.get("matched_keyword") or raw.get("matchedKeyword") or "",
                "score": raw.get("score"),
                "status": raw.get("status") or "SUCCESS",
            }
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Refexions ML match failed")
            raise HTTPException(status_code=502, detail=f"Could not classify this issue: {exc}") from exc

    @api_router.post("/refexions/it/create")
    async def create_it_ticket(
        body: ItCreateRequest,
        user: dict = Depends(get_current_user),
    ):
        name = (body.name or user.get("name") or "").strip()
        email = (body.email or user.get("email") or "").strip()
        entity = _map_entity(
            body.entity
            or user.get("company")
            or user.get("legal_entity_code")
            or (user.get("organization") or {}).get("name")
            or ""
        )
        location = (
            body.location
            or user.get("location")
            or user.get("office_location")
            or user.get("branch_code")
            or ""
        ).strip()
        sub_type = (body.sub_type or "").strip()
        description = (body.description or "").strip()
        criticality = (body.criticality or "Medium").strip() or "Medium"
        if criticality not in CRITICALITY_OPTIONS:
            criticality = "Medium"
        if not name:
            raise HTTPException(status_code=400, detail="Your name is required to create a ticket.")
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Your login email is required to create a ticket.")
        if not entity:
            raise HTTPException(status_code=400, detail="Entity is required.")
        if not location:
            raise HTTPException(status_code=400, detail="Location is required.")
        if not sub_type:
            raise HTTPException(status_code=400, detail="Issue type is required.")
        if not description:
            raise HTTPException(status_code=400, detail="Please describe the issue.")

        cfg = await resolve_config(user.get("org_id") or "", entity)
        if not cfg.get("webhook_path") or not cfg.get("access_key_secret"):
            raise HTTPException(
                status_code=400,
                detail=f"ITSM webhook is not configured for entity '{entity}'.",
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
                response = await client.post(url, headers=_kissflow_headers(cfg), json=webhook_body)
            try:
                raw = response.json()
            except Exception:
                raw = response.text
            ok = 200 <= response.status_code < 300
        except Exception as exc:
            logger.exception("Refexions ticket create failed entity=%s", entity)
            raise HTTPException(status_code=502, detail=f"Unable to submit ticket: {exc}") from exc
        if not ok:
            detail = raw if isinstance(raw, str) else (raw.get("error") or raw.get("message") or str(raw))
            raise HTTPException(status_code=502, detail=str(detail)[:240] or "Unable to submit ticket.")
        request_id = None
        if isinstance(raw, dict):
            request_id = raw.get("Request_ID") or raw.get("requestId") or raw.get("_id")
        success = "Ticket created successfully. You may get a notification by email."
        if request_id:
            success = f"{success}\n\nRequest ID: {request_id}"
        return {
            "success": True,
            "message": success,
            "entity": entity,
            "sub_type": sub_type,
            "requestId": request_id,
        }

    @api_router.post("/refexions/policies/send")
    async def send_policy(
        body: PolicySendRequest,
        user: dict = Depends(get_current_user),
    ):
        policy = _policy_by_id(body.document_id)
        title = (body.title or (policy or {}).get("title") or "Policy").strip()
        email = (body.user_email or user.get("email") or "").strip()
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Your login email is required to send a policy.")
        service_url = _policy_service_url()
        api_key = _policy_api_key()
        if not service_url or not api_key:
            return {
                "success": False,
                "status": 503,
                "title": title,
                "email": email,
                "message": (
                    f"⚠️ Couldn't send *{title}* right now.\n\n"
                    "Please try again in a few minutes. If it keeps failing, contact Admin."
                ),
            }
        url = _policy_send_url()
        payload = {
            "template_id": _policy_template_id(),
            "document_id": body.document_id,
            "user_email": email,
            "to": email,
        }
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    url,
                    headers={"Content-Type": "application/json", "X-API-Key": api_key},
                    json=payload,
                )
        except Exception as exc:
            logger.exception("Refexions policy send failed")
            return {
                "success": False,
                "status": 502,
                "title": title,
                "email": email,
                "message": (
                    f"⚠️ Couldn't send *{title}* right now.\n\n"
                    "Please try again in a few minutes. If it keeps failing, contact Admin."
                ),
                "detail": str(exc),
            }
        raw = {}
        try:
            raw = response.json()
        except Exception:
            raw = {}
        delivered_to = str((raw or {}).get("to") or email).strip() or email
        remote_status = str((raw or {}).get("status") or "").strip().lower()
        ok = 200 <= response.status_code < 300 and remote_status in ("", "sent", "success", "ok")
        if ok:
            return {
                "success": True,
                "status": response.status_code,
                "title": title,
                "email": delivered_to,
                "document_id": (raw or {}).get("document_id") or body.document_id,
                "message_id": (raw or {}).get("message_id"),
                "message": (
                    f"✅ *{title}* sent successfully\n\n"
                    f"📧 Delivered to: {delivered_to}\n\n"
                    "Please check your inbox. If you don't see it within a few minutes, check your spam folder."
                ),
            }
        logger.warning(
            "Refexions policy send rejected status=%s body=%s",
            response.status_code,
            str(raw)[:240],
        )
        return {
            "success": False,
            "status": response.status_code,
            "title": title,
            "email": email,
            "message": (
                f"⚠️ Couldn't send *{title}* right now.\n\n"
                "Please try again in a few minutes. If it keeps failing, contact Admin."
            ),
        }
