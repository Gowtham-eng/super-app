"""Create a RefexOne user the first time a registered Google or Microsoft domain signs in."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import bcrypt


def _claim(claims: Optional[dict], *keys: str) -> str:
    claims = claims or {}
    for key in keys:
        value = str(claims.get(key) or "").strip()
        if value:
            return value
    return ""


def company_from_domain(domain: str) -> str:
    label = (domain or "").split(".", 1)[0].strip()
    return label[:1].upper() + label[1:] if label else ""


def build_sso_user(
    *,
    email: str,
    org_id: str,
    claims: Optional[dict],
    source: str,
    password_hash: str,
    extra: Optional[dict] = None,
) -> dict:
    email = (email or "").strip().lower()
    domain = email.split("@", 1)[1] if "@" in email else ""
    given = _claim(claims, "given_name", "givenName")
    family = _claim(claims, "family_name", "familyName", "surname")
    name = _claim(claims, "name", "displayName") or f"{given} {family}".strip() or email.split("@", 1)[0]
    if not given and " " in name:
        given = name.split(" ", 1)[0]
    if not family and " " in name:
        family = name.split(" ", 1)[1]
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password": password_hash,
        "name": name,
        "first_name": given or name.split(" ", 1)[0],
        "last_name": family,
        "org_id": org_id,
        "role": "user",
        "group_ids": [],
        "role_ids": [],
        "status": "active",
        "company": company_from_domain(domain)[:200],
        "source": source,
        "created_via": source,
        "created_at": now,
    }
    if extra:
        doc.update({k: v for k, v in extra.items() if v is not None})
    return doc


def _default_password_hash() -> str:
    default_pw = (os.environ.get("DEFAULT_USER_PASSWORD") or "Welcome@2026").strip() or "Welcome@2026"
    return bcrypt.hashpw(default_pw.encode(), bcrypt.gensalt()).decode()


async def create_registered_domain_user(
    db,
    *,
    email: str,
    org_id: str,
    claims: Optional[dict],
    source: str,
    extra: Optional[dict] = None,
) -> dict:
    doc = build_sso_user(
        email=email,
        org_id=org_id,
        claims=claims,
        source=source,
        password_hash=_default_password_hash(),
        extra=extra,
    )
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return doc
