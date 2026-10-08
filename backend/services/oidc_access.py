"""OIDC application access decision from authenticated server-owned records."""

from datetime import datetime, timezone

OIDC_ACCESS_MODES = frozenset({"open", "assigned_only"})


def oidc_token_unexpired(record, now):
    """MongoDB can return a stored UTC datetime without tzinfo."""
    expires_at = record.get("expires_at") if isinstance(record, dict) else None
    if not isinstance(expires_at, datetime) or not isinstance(now, datetime):
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > now


def oidc_app_access(user, app, group_role_ids=()):
    """Return access without using client-provided names, email, or role claims."""
    if not user or not app or user.get("org_id") != app.get("org_id"):
        return False
    mode = app.get("access_mode", "open")
    if not isinstance(mode, str) or mode not in OIDC_ACCESS_MODES:
        return False
    if mode == "open":
        if app.get("restricted"):
            return user.get("role") in ("org_admin", "owner", "admin")
        return True
    if user.get("status") != "active":
        return False
    user_id = user.get("id")
    if not isinstance(user_id, str) or not user_id:
        return False
    approved = app.get("approved_user_ids") or []
    groups = app.get("allowed_group_ids") or []
    roles = app.get("allowed_role_ids") or []
    if not all(
        isinstance(values, list) and all(isinstance(value, str) for value in values)
        for values in (approved, groups, roles)
    ):
        return False
    if user_id in approved:
        return True
    user_groups = user.get("group_ids") or []
    user_roles = user.get("role_ids") or []
    if not all(
        isinstance(values, list) and all(isinstance(value, str) for value in values)
        for values in (user_groups, user_roles)
    ) or not all(isinstance(value, str) for value in group_role_ids):
        return False
    return bool(
        set(groups).intersection(user_groups)
        or set(roles).intersection(user_roles)
        or set(roles).intersection(group_role_ids)
    )
