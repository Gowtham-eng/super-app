"""Launcher visibility helpers.

Reports apps are shown only to chief-position users (and org admins).

Override with env REPORTS_ALLOWED_EMAILS (comma-separated).
"""
from __future__ import annotations

import os
import re
from typing import Optional

ADMIN_ROLES = ("org_admin", "owner", "admin", "super_admin")
NE_EMBED_HOST = "refex-admin-ui"
_ITSM_NAME_RE = re.compile(
    r"itsm|tech support|it support|helpdesk|it helpdesk|it service",
    re.I,
)
_HONORIFIC_TITLE_RE = re.compile(r"^(mr|mrs|ms|miss|dr|sir|madam|mx)\.?$", re.I)
_CHIEF_TITLE_RE = re.compile(
    r"\bchief\b|\bceo\b|\bcfo\b|\bcoo\b|\bcto\b|\bcio\b|\bcmo\b|\bchro\b|\bciso\b|\bcxo\b",
    re.I,
)


def _email_set(env_name: str, defaults: tuple[str, ...] = ()) -> set[str]:
    raw = os.environ.get(env_name, "")
    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if emails:
        return set(emails)
    return {e.lower() for e in defaults}


def reports_allowed_emails() -> set[str]:
    return _email_set("REPORTS_ALLOWED_EMAILS")


def is_reports_app(app: Optional[dict] = None) -> bool:
    """True for Reports-category tiles and Notification Engine embed dashboards."""
    app = app or {}
    if str(app.get("category") or "").strip() == "Reports":
        return True
    url = str(app.get("home_url") or "").lower()
    return NE_EMBED_HOST in url and ("embed=1" in url or "/applications/" in url or "/dashboard" in url)


def is_kissflow_app(app: Optional[dict] = None) -> bool:
    """True for Kissflow SAML/helpdesk tiles. Never NE embed Reports."""
    app = app or {}
    if is_reports_app(app):
        return False
    blob = " ".join(
        str(app.get(k) or "")
        for k in ("name", "description", "home_url", "acs_url", "entity_id")
    ).lower()
    if "kissflow" in blob:
        return True
    app_id = str(app.get("id") or "").strip().lower()
    if app_id == "itsm-inapp":
        return True
    name = str(app.get("name") or "")
    desc = str(app.get("description") or "")
    return bool(_ITSM_NAME_RE.search(name) or _ITSM_NAME_RE.search(desc))


def _job_title(user: Optional[dict] = None) -> str:
    user = user or {}
    for key in ("designation", "job_title", "position"):
        title = str(user.get(key) or "").strip()
        if title:
            return title
    title = str(user.get("title") or "").strip()
    if title and not _HONORIFIC_TITLE_RE.match(title):
        return title
    return ""


def is_chief_position(user: Optional[dict] = None) -> bool:
    """True when HR designation / job title is a Chief / C-suite role."""
    user = user or {}
    parts = [
        _job_title(user),
        str(user.get("designation") or ""),
        str(user.get("job_title") or ""),
        str(user.get("position") or ""),
    ]
    title = str(user.get("title") or "").strip()
    if title and not _HONORIFIC_TITLE_RE.match(title):
        parts.append(title)
    blob = " ".join(p for p in parts if p).strip()
    return bool(blob) and bool(_CHIEF_TITLE_RE.search(blob))


def user_can_see_reports(user: Optional[dict] = None) -> bool:
    user = user or {}
    email = str(user.get("email") or "").strip().lower()
    if email and email in reports_allowed_emails():
        return True
    return is_chief_position(user)


def user_can_see_kissflow(user: Optional[dict] = None) -> bool:
    return True
