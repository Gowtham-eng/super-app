"""Email the platform team when a user-facing flow fails.

Defaults go to the launch watch list. Override with FAILURE_ALERT_EMAILS
(comma-separated). The same entity and error is sent at most once every
10 minutes so a down integration is noticed immediately without a mail flood.
"""
from __future__ import annotations

import asyncio
import html
import logging
import os
import re
import time
from typing import Optional

logger = logging.getLogger("failure_alerts")

DEFAULT_FAILURE_ALERT_EMAILS = (
    "aravind.srinivasan@refex.co.in",
    "gowtham.s@refex.co.in",
    "pravinkumar.raja@refex.co.in",
    "sathishkumar.r@refex.co.in",
    "raghul.je@refex.co.in",
    "murugesh.k@refex.co.in",
    "mohamedaasik.m@refex.co.in",

)

_COOLDOWN_SEC = float(os.environ.get("FAILURE_ALERT_COOLDOWN_SEC", "600") or "600")
_recent: dict[str, float] = {}
_WEBHOOK_TOKEN_RE = re.compile(r"(/webhook/)[^/\s\"']+", re.I)


def failure_alert_emails() -> list[str]:
    raw = os.environ.get("FAILURE_ALERT_EMAILS", "")
    emails = [part.strip().lower() for part in raw.split(",") if part.strip()]
    if emails:
        return emails
    return [item.lower() for item in DEFAULT_FAILURE_ALERT_EMAILS]


def redact_secrets(text: str) -> str:
    return _WEBHOOK_TOKEN_RE.sub(r"\1…", text or "")


def _cooldown_key(source: str, entity: str, detail: str) -> str:
    return "|".join(
        [
            (source or "").strip().lower(),
            (entity or "").strip().lower(),
            redact_secrets(detail or "")[:180].strip().lower(),
        ]
    )


def _allow_send(key: str) -> bool:
    now = time.monotonic()
    previous = _recent.get(key)
    if previous is not None and now - previous < _COOLDOWN_SEC:
        return False
    _recent[key] = now
    return True


def reset_failure_alert_cooldown() -> None:
    _recent.clear()


def build_failure_alert_email(
    *,
    source: str,
    summary: str,
    entity: str = "",
    environment: str = "",
    requester: str = "",
    detail: str = "",
) -> str:
    rows = [
        ("What failed", source),
        ("Summary", summary),
        ("Entity", entity or "—"),
        ("Environment", environment or "—"),
        ("Requester", requester or "—"),
        ("Detail", redact_secrets(detail) or "—"),
    ]
    body = "".join(
        "<tr>"
        f'<td style="padding: 8px 12px 8px 0; color: #64748b; vertical-align: top;">{html.escape(label)}</td>'
        f'<td style="padding: 8px 0; color: #1e293b; font-weight: 600;">{html.escape(value)}</td>'
        "</tr>"
        for label, value in rows
    )
    return f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: #ef4444; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">RefexOne</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0; font-size: 14px;">Failure alert</p>
      </div>
      <div style="background: white; padding: 32px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
          A user-facing action failed. Check this before users report that the system is down.
        </p>
        <table style="width: 100%; border-collapse: collapse;">{body}</table>
      </div>
      <div style="padding: 16px 32px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Sent from RefexOne</p>
      </div>
    </div>
    """


async def notify_failure(
    *,
    source: str,
    summary: str,
    entity: str = "",
    environment: str = "",
    requester: str = "",
    detail: str = "",
) -> bool:
    """Send one alert. Never raises. Returns False when skipped or SMTP fails."""
    key = _cooldown_key(source, entity, detail or summary)
    if not _allow_send(key):
        logger.info("Failure alert suppressed (cooldown) source=%s entity=%s", source, entity)
        return False
    recipients = failure_alert_emails()
    safe_detail = redact_secrets(detail)
    subject = f"RefexOne failure: {source}"
    if entity:
        subject = f"{subject} ({entity})"
    html_body = build_failure_alert_email(
        source=source,
        summary=summary,
        entity=entity,
        environment=environment,
        requester=requester,
        detail=safe_detail,
    )
    try:
        from services.email_service import send_email

        sent = await send_email(recipients, subject[:180], html_body)
        if not sent:
            logger.error("Failure alert was not sent source=%s entity=%s", source, entity)
        return bool(sent)
    except Exception:
        logger.exception("Failure alert crashed source=%s entity=%s", source, entity)
        return False


def schedule_failure_alert(
    *,
    source: str,
    summary: str,
    entity: str = "",
    environment: str = "",
    requester: str = "",
    detail: str = "",
) -> None:
    """Queue the email without delaying the user's error response."""
    try:
        asyncio.get_running_loop().create_task(
            notify_failure(
                source=source,
                summary=summary,
                entity=entity,
                environment=environment,
                requester=requester,
                detail=detail,
            )
        )
    except RuntimeError:
        logger.exception("Failure alert skipped: no running event loop")
