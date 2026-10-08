"""Short-lived, single-use browser handoff for explicitly assigned OIDC apps."""

from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe
import re


LAUNCH_COOKIE = "__Host-refexone_oidc_launch"
LAUNCH_TTL_SECONDS = 300
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")


def create_launch_grant(user, app, now, entropy=token_urlsafe):
    if (not isinstance(user.get("id"), str) or not user["id"] or
            not isinstance(user.get("org_id"), str) or not user["org_id"]):
        raise ValueError("Invalid IAM principal")
    if (not isinstance(app.get("id"), str) or not app["id"] or
            app.get("org_id") != user["org_id"] or
            app.get("access_mode") != "assigned_only"):
        raise ValueError("Invalid assigned application")
    raw = entropy(32)
    if not isinstance(raw, str) or not _TOKEN.fullmatch(raw):
        raise ValueError("Invalid launch entropy")
    return raw, {
        "token_digest": sha256(raw.encode("ascii")).hexdigest(),
        "app_id": app["id"],
        "user_id": user["id"],
        "org_id": user["org_id"],
        "expires_at": now + timedelta(seconds=LAUNCH_TTL_SECONDS),
    }


async def consume_launch_grant(collection, raw, app_id, now):
    if not isinstance(raw, str) or not _TOKEN.fullmatch(raw):
        return None
    if not isinstance(app_id, str) or not app_id:
        return None
    return await collection.find_one_and_delete({
        "token_digest": sha256(raw.encode("ascii")).hexdigest(),
        "app_id": app_id,
        "expires_at": {"$gt": now},
    })
