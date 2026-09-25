"""
Refexions web chat — Kissflow WhatsApp BOT Config menus, IT ticket create, policy send.

FAQ answers and Refexions API keys live in Refexions Setup (Mongo), not Kissflow.
Ticket create still uses ITSM Setup Live Kissflow keys. Production does not need
a copy of local .env. Set REFEXIONS_TICKET_ENV=development only for local webhook checks.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("refexions")

BOT_DATASET = "Whatsapp_BOT_Config"


def _policy_service_url(cfg: Optional[Dict[str, Any]] = None) -> str:
    from routes.itsm import resolve_refexions_policy_service_url

    return resolve_refexions_policy_service_url(cfg)


def _policy_send_url(cfg: Optional[Dict[str, Any]] = None) -> str:
    base = _policy_service_url(cfg)
    if base.endswith("/v1/documents/send"):
        return base
    return f"{base}/v1/documents/send"


def _policy_api_key(cfg: Optional[Dict[str, Any]] = None) -> str:
    from routes.itsm import resolve_refexions_policy_api_key

    candidates: List[str] = []
    if isinstance(cfg, dict):
        candidates.append(str(cfg.get("refexions_policy_api_key") or "").strip())
        shared = cfg.get("shared")
        if isinstance(shared, dict):
            candidates.append(str(shared.get("refexions_policy_api_key") or "").strip())
    candidates.append(resolve_refexions_policy_api_key(cfg))
    return next((key for key in candidates if key), "")


def _policy_template_id() -> str:
    from services.refexions_store import DEFAULT_POLICY_TEMPLATE_ID, cached_setting

    saved = cached_setting("policy_template_id")
    if saved:
        return saved
    return os.environ.get("REFEXIONS_POLICY_TEMPLATE_ID", DEFAULT_POLICY_TEMPLATE_ID) or DEFAULT_POLICY_TEMPLATE_ID


def _policy_recipient_email(*values: Any) -> str:
    from routes.itsm import _normalize_email

    for value in values:
        email = _normalize_email(value)
        if email and "@" in email:
            return email
        text = str(value or "").strip()
        match = re.search(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", text, re.I)
        if match:
            return match.group(0).lower()
    return ""


def _policy_send_payload(document_id: str, email: str) -> Dict[str, str]:
    return {
        "template_id": _policy_template_id(),
        "document_id": (document_id or "").strip(),
        "user_email": email,
    }


def _policy_send_ok(status_code: int, raw: Any) -> bool:
    if not (200 <= int(status_code) < 300):
        return False
    if not isinstance(raw, dict):
        return True
    if raw.get("detail") or raw.get("error"):
        return False
    token = str(raw.get("status") or "").strip().lower()
    return token not in {"error", "failed", "fail", "rejected"}


def _ticket_kissflow_env() -> str:
    """Which Kissflow account Refexions ticket create uses.

    Live is the default so production never inherits local development .env
    host/keys. Set REFEXIONS_TICKET_ENV=development only for localhost checks.
    """
    raw = (os.environ.get("REFEXIONS_TICKET_ENV") or "").strip().lower()
    if raw in ("dev", "development"):
        return "development"
    if raw in ("live", "prod", "production"):
        return "live"
    return "live"


def _ticket_subject(description: str, sub_type: str, subject: str = "") -> str:
    explicit = (subject or "").strip()
    if explicit:
        return explicit[:80]
    line = (description or "").strip().splitlines()[0].strip() if description else ""
    text = line or (sub_type or "").strip() or "IT HelpDesk request"
    return text[:80]

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
    subject: str = ""
    name: Optional[str] = None
    email: Optional[str] = None
    entity: Optional[str] = None
    location: Optional[str] = None
    criticality: str = "Medium"
    attachments: List[str] = Field(default_factory=list)


class PolicySendRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    title: Optional[str] = None
    user_email: Optional[str] = None


class FaqMatchRequest(BaseModel):
    text: str = Field(..., min_length=1)


class RefexionsSetupSave(BaseModel):
    policy_api_key: Optional[str] = None
    ml_url: Optional[str] = None
    policy_service_url: Optional[str] = None
    policy_template_id: Optional[str] = None
    faqs: Optional[List[Dict[str, Any]]] = None
    policies: Optional[List[Dict[str, Any]]] = None
    menus: Optional[Dict[str, Any]] = None


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


def register_refexions_routes(
    api_router: APIRouter,
    get_current_user,
    resolve_config: Callable,
    db=None,
):
    from routes.itsm import CRITICALITY_OPTIONS, _kissflow_headers, _ticket_webhook_body, _uses_extrovis_flow
    from services.refexions_store import (
        chat_main_menu,
        chat_policies,
        chat_sub_menu,
        enabled_faqs,
        load_setup,
        match_faq,
        policy_by_id,
        public_doc,
        save_setup,
    )

    def _require_admin(user: dict):
        if user.get("role") not in ("org_admin", "admin", "super_admin", "owner"):
            raise HTTPException(status_code=403, detail="Admin only")

    def _legacy_settings() -> Dict[str, str]:
        from routes.itsm import (
            resolve_refexions_ml_url,
            resolve_refexions_policy_api_key,
            resolve_refexions_policy_service_url,
        )

        return {
            "policy_api_key": resolve_refexions_policy_api_key(),
            "ml_url": resolve_refexions_ml_url(),
            "policy_service_url": resolve_refexions_policy_service_url(),
            "policy_template_id": _policy_template_id(),
        }

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
        async with httpx.AsyncClient(timeout=8.0) as client:
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
        void = user
        del void
        doc = await load_setup(db, _legacy_settings())
        return chat_main_menu(doc)

    @api_router.get("/refexions/sub-menu")
    async def sub_menu(
        main: str = Query(..., min_length=1),
        user: dict = Depends(get_current_user),
    ):
        void = user
        del void
        doc = await load_setup(db, _legacy_settings())
        return chat_sub_menu(doc, main)

    @api_router.get("/refexions/policies")
    async def list_policies(user: dict = Depends(get_current_user)):
        void = user  # auth required
        del void
        doc = await load_setup(db, _legacy_settings())
        return chat_policies(doc)

    @api_router.get("/refexions/faq")
    async def list_faq(user: dict = Depends(get_current_user)):
        void = user
        del void
        doc = await load_setup(db, _legacy_settings())
        rows = enabled_faqs(doc)
        return {
            "success": True,
            "faqs": [
                {
                    "id": row.get("id"),
                    "question": row.get("question"),
                    "answer": row.get("answer"),
                    "link": row.get("link") or "",
                }
                for row in rows
            ],
        }

    @api_router.post("/refexions/faq/match")
    async def match_faq_route(
        body: FaqMatchRequest,
        user: dict = Depends(get_current_user),
    ):
        void = user
        del void
        text = (body.text or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Please type a question.")
        doc = await load_setup(db, _legacy_settings())
        hit = match_faq(text, enabled_faqs(doc))
        if not hit:
            return {
                "success": True,
                "matched": False,
                "message": "I do not have an FAQ for that. Pick one of the options below.",
            }
        return {
            "success": True,
            "matched": True,
            "id": hit.get("id"),
            "question": hit.get("question"),
            "answer": hit.get("answer"),
            "link": hit.get("link") or "",
            "message": hit.get("answer"),
        }

    @api_router.get("/refexions/admin/setup")
    async def get_refexions_setup(user: dict = Depends(get_current_user)):
        _require_admin(user)
        doc = await load_setup(db, _legacy_settings())
        payload = public_doc(doc)
        payload["success"] = True
        payload["persisted"] = doc.get("persisted") or "memory"
        return payload

    @api_router.put("/refexions/admin/setup")
    async def put_refexions_setup(
        body: RefexionsSetupSave,
        user: dict = Depends(get_current_user),
    ):
        _require_admin(user)
        saved = await save_setup(db, body.model_dump(exclude_unset=True), keep_blank_key=True)
        payload = public_doc(saved)
        payload["success"] = True
        payload["persisted"] = saved.get("persisted") or "memory"
        return payload

    @api_router.post("/refexions/admin/setup/refresh-menus")
    async def refresh_refexions_menus(user: dict = Depends(get_current_user)):
        _require_admin(user)
        from services.refexions_store import DEFAULT_COMING_SOON, default_menus

        current = await load_setup(db, _legacy_settings())
        menus = dict(current.get("menus") or default_menus())
        cfg = await _live_cfg(user)
        now = datetime.now(timezone.utc).isoformat()
        pulled: List[str] = []

        main_rows = await _fetch_bot_rows(cfg, "01-MainMenu")
        main_row = _pick_named_row(main_rows, "01-MainMenu") or {}
        if main_row:
            prev_main = menus.get("main") if isinstance(menus.get("main"), dict) else {}
            menus["main"] = {
                "message": str(
                    main_row.get("Message")
                    or prev_main.get("message")
                    or "Please choose from the following"
                ).strip(),
                "options": _split_menu(main_row.get("Main_Menu")) or list(FALLBACK_MAIN),
                "source": "kissflow",
                "refreshed_at": now,
            }
            pulled.append("main")

        for kind, dataset, fallback in (
            ("expense", SUBMENU_NAMES["expense"], FALLBACK_EXPENSE_SUB),
            ("travel", SUBMENU_NAMES["travel"], FALLBACK_TRAVEL_SUB),
        ):
            rows = await _fetch_bot_rows(cfg, dataset)
            row: Dict[str, Any] = {}
            for candidate in rows:
                menu = str(candidate.get("Main_Menu") or "").strip()
                if not menu or kind in menu.lower() or menu.lower() == kind:
                    row = candidate
                    break
            if not row and rows:
                row = rows[0]
            if not row:
                continue
            prev = menus.get(kind) if isinstance(menus.get(kind), dict) else {}
            menus[kind] = {
                "message": str(
                    row.get("Message") or prev.get("message") or "Please select the application"
                ).strip(),
                "options": _split_menu(row.get("Sub_Menu")) or list(fallback),
                "source": "kissflow",
                "refreshed_at": now,
                "comingSoon": True,
                "comingSoonMessage": prev.get("comingSoonMessage") or DEFAULT_COMING_SOON,
            }
            pulled.append(kind)

        saved = await save_setup(db, {"menus": menus}, keep_blank_key=True)
        payload = public_doc(saved)
        payload["success"] = True
        payload["persisted"] = saved.get("persisted") or "memory"
        payload["refreshed"] = pulled
        if not pulled:
            payload["warning"] = "Kissflow did not return menu rows. Kept the stored copy."
        return payload

    @api_router.post("/refexions/it/match")
    async def match_it_subtype(
        body: ItMatchRequest,
        user: dict = Depends(get_current_user),
    ):
        text = (body.mail_body or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Please describe the issue.")
        try:
            from routes.itsm import resolve_refexions_ml_url

            shared = None
            try:
                shared = await _live_cfg(user)
            except Exception:
                shared = None
            ml_url = resolve_refexions_ml_url(shared)
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(ml_url, json={"mail_body": text})
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
        email = _policy_recipient_email(body.email, user.get("email"))
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
        asked_subject = (body.subject or "").strip()
        if _uses_extrovis_flow(entity) and not asked_subject:
            raise HTTPException(status_code=400, detail="Subject is required.")

        from services.itsm_ticket_attachments import normalize_attachment_urls

        attachment_urls = normalize_attachment_urls(body.attachments)

        ticket_env = _ticket_kissflow_env()
        cfg = await resolve_config(
            user.get("org_id") or "",
            entity,
            force_env=ticket_env,
        )
        if not cfg.get("webhook_path") or not cfg.get("access_key_secret"):
            raise HTTPException(
                status_code=400,
                detail=f"ITSM webhook is not configured for entity '{entity}'.",
            )
        webhook_body = _ticket_webhook_body(
            process_id=cfg["process_id"],
            name=name,
            email=email,
            entity=entity,
            location=location,
            sub_type=sub_type,
            criticality=criticality,
            description=description,
            subject=_ticket_subject(description, sub_type, asked_subject),
            attachments=attachment_urls,
        )
        url = f"{cfg['kissflow_base_url']}{cfg['webhook_path']}"
        host = (cfg.get("kissflow_base_url") or "").replace("https://", "").replace("http://", "").split("/")[0]
        logger.info(
            "Refexions ticket create env=%s host=%s entity=%s",
            cfg.get("environment"),
            host,
            entity,
        )
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
        env_name = cfg.get("environment") or ticket_env
        success = "Ticket created successfully. You may get a notification by email."
        if request_id:
            success = f"{success}\n\nRequest ID: {request_id}"
        if host:
            success = f"{success}\n\nKissflow: {env_name} ({host})"
        return {
            "success": True,
            "message": success,
            "entity": entity,
            "sub_type": sub_type,
            "requestId": request_id,
            "environment": env_name,
            "kissflowHost": host,
        }

    @api_router.post("/refexions/policies/send")
    async def send_policy(
        body: PolicySendRequest,
        user: dict = Depends(get_current_user),
    ):
        setup_doc = await load_setup(db, _legacy_settings())
        policy = policy_by_id(body.document_id, setup_doc) or _policy_by_id(body.document_id)
        title = (body.title or (policy or {}).get("title") or "Policy").strip()
        email = _policy_recipient_email(body.user_email, user.get("email"))
        if not email:
            raise HTTPException(status_code=400, detail="Your login email is required to send a policy.")
        cfg = {}
        try:
            cfg = await _live_cfg(user)
        except Exception as exc:
            logger.warning("Refexions policy send: Kissflow cfg unavailable: %s", exc)
        service_url = _policy_service_url(cfg)
        api_key = _policy_api_key(cfg)
        if not service_url or not api_key:
            logger.error(
                "Refexions policy send skipped: policy API key is not set "
                "(Refexions Setup → Policy API key)"
            )
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
        url = _policy_send_url(cfg)
        payload = _policy_send_payload(body.document_id, email)
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
        ok = _policy_send_ok(response.status_code, raw)
        logger.info(
            "Refexions policy send document=%s to=%s status=%s ok=%s",
            body.document_id,
            email,
            response.status_code,
            ok,
        )
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
