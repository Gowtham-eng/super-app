"""Help Desk User-comment email via GCP comment-mail API (supportone SMTP)."""
from __future__ import annotations

import html
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger("itsm.comment_mail")

DEFAULT_COMMENT_MAIL_URL = "https://refex-comment-mail-dhwffeu7pq-el.a.run.app"
DEFAULT_COMMENT_MAIL_API_KEY = "cmk_7f3a9c2e1b84d6f0a5e8c193b2470d6e"
SUPPORT_TO = ["itsupport@extrovis.com"]
SUPPORT_CC = ["mohamedaasik.m@refex.co.in"]
EXTROVIS_COMMENT_FROM = "itsupport@extrovis.com"
KAVIS_COMMENT_FROM = "itsupport@kavispharma.com"
MODEPRO_COMMENT_FROM = "itsupport@modepro.com"
REFEXONE_LOGO_URL = "https://storage.googleapis.com/aasik-refex-report-assets/refexone-logo.png"


def comment_mail_url() -> str:
    return (os.environ.get("COMMENT_MAIL_URL") or DEFAULT_COMMENT_MAIL_URL).rstrip("/")


def comment_mail_api_key() -> str:
    return (os.environ.get("COMMENT_MAIL_API_KEY") or DEFAULT_COMMENT_MAIL_API_KEY).strip()


def comment_mail_subject(request_id: str) -> str:
    ticket = str(request_id or "").strip() or "Ticket"
    return f"Tech Help Desk - New Comment Added | Ticket {ticket}"


def assigned_greeting_name(*values: Any) -> str:
    """First human assignee first name — Dear Vishnu, not Dear IT Support."""
    for value in values:
        name = _first_human_assignee_name(value)
        if name:
            return name
    return "IT Support"


def _first_human_assignee_name(value: Any) -> str:
    if value is None or value == "" or value == "—":
        return ""
    if isinstance(value, (list, tuple)):
        for item in value:
            name = _first_human_assignee_name(item)
            if name:
                return name
        return ""
    if isinstance(value, dict):
        kind = str(value.get("Kind") or value.get("kind") or "").strip().lower()
        if kind in ("approle", "role"):
            return ""
        return _first_human_assignee_name(value.get("Name") or value.get("name") or "")
    text = str(value).strip()
    if "," in text:
        for part in text.split(","):
            name = _first_human_assignee_name(part.strip())
            if name:
                return name
        return ""
    text = text.replace(" (user)", "").replace(" (role)", "").strip()
    low = text.lower()
    if not text or "it agent" in low or "itsm bot" in low or low == "bot":
        return ""
    if "@" in text:
        return text.split("@", 1)[0].split(".")[0].split("_")[0].capitalize()
    return text.split()[0]


def _display(value: Any, fallback: str = "—") -> str:
    text = str(value or "").strip()
    return text or fallback


def format_comment_mail_date(value: Any = None) -> str:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.now(timezone.utc)
    try:
        local = dt.astimezone(ZoneInfo("Asia/Kolkata"))
        return local.strftime("%d %b %Y, %I:%M %p")
    except Exception:
        return dt.isoformat()


def build_comment_mail_html(
    *,
    request_id: str = "",
    requester_name: str = "",
    greeting_name: str = "",
    ticket_type: str = "",
    category: str = "",
    subject: str = "",
    author_name: str = "",
    comment: str = "",
    commented_at: str = "",
    attachment_count: int = 0,
) -> str:
    ticket = html.escape(_display(request_id))
    greeting = html.escape(_display(greeting_name or requester_name, "User"))
    subject_html = html.escape(_display(subject))
    author = html.escape(_display(author_name, "Help Desk"))
    when = html.escape(_display(commented_at or format_comment_mail_date(), ""))
    body = html.escape(_display(comment, "(Attachment only)")).replace("\n", "<br/>")
    files = (
        f'<div style="margin-top:10px;font-size:13px;color:#397A7A;">{int(attachment_count)} attachment(s) added on the ticket.</div>'
        if int(attachment_count or 0) > 0
        else ""
    )
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>Tech Help Desk - New Comment</title><style>@media only screen and (max-width:600px){{.wrapper{{width:100% !important;max-width:100% !important;border-radius:0 !important;}}.outer-pad{{padding:20px 8px !important;}}.header-title{{font-size:24px !important;line-height:30px !important;}}.details-title{{font-size:19px !important;line-height:25px !important;}}.assignment-status{{font-size:13px !important;line-height:20px !important;}}.logo-img{{width:180px !important;max-width:75% !important;}}.header-curve{{width:65% !important;}}.detail-label{{width:35% !important;min-width:35% !important;max-width:35% !important;box-sizing:border-box !important;word-break:normal !important;overflow-wrap:break-word !important;white-space:normal !important;}}.detail-value{{width:65% !important;min-width:65% !important;max-width:65% !important;box-sizing:border-box !important;word-break:break-word !important;overflow-wrap:anywhere !important;white-space:normal !important;}}.details-table{{width:100% !important;table-layout:fixed !important;}}.comment-title{{font-size:19px !important;line-height:25px !important;}}.comment-card{{padding:18px !important;}}.comment-text{{font-size:14px !important;line-height:23px !important;}}.footer-text{{font-size:12px !important;line-height:20px !important;}}}}</style></head><body style="margin:0;padding:0;background:#EEF4FA;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#334155;"><table width="100%" cellpadding="0" cellspacing="0" border="0" class="outer-pad" style="width:100%;background:#EEF4FA;padding:34px 10px;"><tr><td align="center"><table class="wrapper" width="700" cellpadding="0" cellspacing="0" border="0" style="width:700px;max-width:700px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(70,100,130,0.12);"><tr><td align="center" style="background:#FFFFFF;text-align:center;padding:15px 20px 0 20px;"><img class="logo-img" src="{REFEXONE_LOGO_URL}" alt="Refexone" width="200" style="display:block;width:200px;max-width:80%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none;"></td></tr><tr><td align="center" style="background:#FFFFFF;text-align:center;padding:0 20px 4px 20px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0 0 0;"><table class="header-curve" width="65%" cellpadding="0" cellspacing="0" border="0" style="width:65%;height:8px;"><tr><td style="height:8px;border-bottom:3px solid #58A6A6;border-radius:0 0 50% 50%;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr></table></td></tr><tr><td align="center" style="background:#FFFFFF;text-align:center;padding:4px 20px 8px 20px;"><h1 class="header-title" style="margin:0;font-size:27px;font-weight:700;line-height:34px;color:#315E89;">Tech Help Desk</h1><div class="assignment-status" style="margin-top:8px;text-align:center;font-size:14px;line-height:20px;color:#397A7A;font-weight:600;">💬 New Comment</div></td></tr><tr><td style="padding:22px 35px 16px;background:#FFFFFF;"><div style="font-size:16px;line-height:25px;color:#334155;">Dear<strong style="color:#315E89;"> {greeting}</strong>,</div><div style="margin-top:8px;font-size:14px;line-height:23px;color:#64748B;">A new comment has been added to your ticket. Please review the latest update and take the required action, if applicable.</div></td></tr><tr><td style="padding:10px 35px 26px;background:#FFFFFF;"><h2 class="details-title" style="color:#315E89;border-left:3px solid #58A6A6;padding-left:12px;font-size:22px;font-weight:700;line-height:28px;margin:0 0 18px 0;">Ticket Details</h2><table class="details-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #DCE7F1;table-layout:fixed;"><tr style="background:#F5FAFA;"><td class="detail-label" width="35%" style="width:35%;padding:12px;font-size:14px;font-weight:600;border:1px solid #DCE7F1;color:#35536F;">Request ID</td><td class="detail-value" style="width:65%;padding:12px;font-size:14px;font-weight:600;border:1px solid #DCE7F1;color:#397A7A;">{ticket}</td></tr><tr style="background-color:#FFFFFF;"><td class="detail-label" width="35%" style="width:35%;padding:13px;font-size:14px;font-weight:600;border:1px solid #DCE7F1;color:#1E3A5F;">Subject</td><td class="detail-value" style="width:65%;padding:13px;font-size:14px;border:1px solid #DCE7F1;color:#475569;">{subject_html}</td></tr></table></td></tr><tr><td class="section" style="padding:5px 35px 35px;"><h2 class="section-title" style="margin:0;padding:0 0 0 12px;border-left:5px solid #16A085;font-size:22px;font-weight:700;line-height:28px;color:#16A085;">💬 Latest Comment</h2><table width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-top:18px;background-color:#F4FBF8;border:1px solid #D5EEE6;border-radius:14px;"><tr><td class="comment-card" style="padding:24px;"><table class="comment-header" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;font-weight:700;color:#166534;">Commented By</td><td align="right" style="font-size:13px;color:#64748B;">{when}</td></tr></table><div style="margin-top:10px;font-size:15px;font-weight:600;color:#334155;">{author}</div><div class="comment-text" style="margin-top:18px;padding:18px;background-color:#ffffff;border-radius:10px;border:1px solid #DDEEE8;font-size:15px;line-height:27px;color:#475569;">{body}{files}</div></td></tr></table></td></tr><tr><td style="background:#222831;text-align:center;padding:18px 20px 22px 20px;"><div class="footer-text" style="font-size:14px;line-height:22px;color:#A3ACB8;">This is an automatically generated email.<br>Please do not reply directly to this message.</div></td></tr></table></td></tr></table></body></html>"""


def resolve_comment_mail_identity(entity: str = "") -> Dict[str, Any]:
    """From and Cc follow the ticket entity. To is chosen by the caller."""
    token = "".join(ch for ch in str(entity or "").strip().lower() if ch.isalnum())
    if token.startswith("kavis"):
        return {
            "from": KAVIS_COMMENT_FROM,
            "cc": ["Jon.Hudanich@kavispharma.com", "Vidhya.Kumar@kavispharma.com"],
        }
    if token.startswith("modepro"):
        return {
            "from": MODEPRO_COMMENT_FROM,
            "cc": ["pradip.kakade@modepro.com"],
        }
    return {
        "from": EXTROVIS_COMMENT_FROM,
        "cc": [EXTROVIS_COMMENT_FROM],
    }


def _mail_address(value: str) -> str:
    return str(value or "").strip().lower()


def entity_comment_to(identity: Dict[str, Any]) -> list:
    """User-side To. Kavis and ModePro must not fall back to itsupport@extrovis.com."""
    return [str(item).strip() for item in (identity.get("cc") or []) if str(item).strip()]


def build_employee_comment_mail_payload(
    *,
    request_id: str,
    author_name: str,
    comment: str,
    attachment_count: int = 0,
    requester_name: str = "",
    ticket_type: str = "",
    category: str = "",
    subject: str = "",
    assigned_to: str = "",
    entity: str = "",
    requester_email: str = "",
    commenter_email: str = "",
) -> Dict[str, Any]:
    identity = resolve_comment_mail_identity(entity)
    to = entity_comment_to(identity)
    requester = _mail_address(requester_email)
    commenter = _mail_address(commenter_email)
    # Agent comment: the ticket requester is the To. User comment, or a missing
    # requester address, stays on the entity list.
    agent_to_user = bool(requester and commenter and requester != commenter)
    if agent_to_user:
        to = [requester_email.strip()]
    cc = [item for item in identity["cc"] if not agent_to_user or _mail_address(item) != requester]
    return {
        "to": to,
        "cc": cc,
        "subject": comment_mail_subject(request_id),
        "html": build_comment_mail_html(
            request_id=request_id,
            requester_name=requester_name,
            greeting_name=assigned_greeting_name(assigned_to),
            ticket_type=ticket_type,
            category=category,
            subject=subject,
            author_name=author_name,
            comment=comment,
            commented_at=format_comment_mail_date(),
            attachment_count=attachment_count,
        ),
        "from": identity["from"],
    }


async def queue_employee_comment_mail(
    *,
    request_id: str,
    author_name: str,
    comment: str,
    attachment_count: int = 0,
    requester_name: str = "",
    ticket_type: str = "",
    category: str = "",
    subject: str = "",
    assigned_to: str = "",
    entity: str = "",
    requester_email: str = "",
    commenter_email: str = "",
) -> Optional[Dict[str, Any]]:
    payload = build_employee_comment_mail_payload(
        request_id=request_id,
        author_name=author_name,
        comment=comment,
        attachment_count=attachment_count,
        requester_name=requester_name,
        ticket_type=ticket_type,
        category=category,
        subject=subject,
        assigned_to=assigned_to,
        entity=entity,
        requester_email=requester_email,
        commenter_email=commenter_email,
    )
    url = f"{comment_mail_url()}/v1/send"
    try:
        import httpx

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": comment_mail_api_key(),
                },
                json=payload,
            )
        if response.status_code >= 300:
            logger.warning(
                "Comment notify mail failed status=%s request_id=%s",
                response.status_code,
                request_id,
            )
            return {"ok": False, "status": response.status_code}
        return {"ok": True}
    except Exception as exc:
        logger.warning("Comment notify mail skipped request_id=%s: %s", request_id, exc)
        return {"ok": False, "error": str(exc)}


def schedule_employee_comment_mail(**kwargs: Any) -> None:
    """Never fail the comment save if Cloud Run / SMTP is down."""
    try:
        import asyncio

        loop = asyncio.get_running_loop()

        async def _safe_send() -> None:
            try:
                await queue_employee_comment_mail(**kwargs)
            except Exception as exc:
                logger.warning(
                    "Comment notify mail skipped request_id=%s: %s",
                    kwargs.get("request_id") or "",
                    exc,
                )

        task = loop.create_task(_safe_send())
        task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
    except Exception as exc:
        logger.warning("Comment notify mail skipped: %s", exc)
