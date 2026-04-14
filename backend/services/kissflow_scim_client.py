"""
Kissflow SCIM Client
Pushes users FROM Refex Super App TO Kissflow's SCIM Server.
Reads config from DB (kissflow_scim_config) or falls back to env vars.
"""
import os
import logging
import httpx
from datetime import datetime, timezone

logger = logging.getLogger("kissflow_scim")


async def get_kissflow_scim_config(db, org_id: str) -> dict:
    """Get Kissflow SCIM config for an org. Falls back to env vars."""
    config = await db.kissflow_scim_config.find_one({"org_id": org_id}, {"_id": 0})
    if config and config.get("base_url") and config.get("token"):
        return config

    base_url = os.environ.get("KISSFLOW_SCIM_BASE_URL", "")
    token = os.environ.get("KISSFLOW_SCIM_TOKEN", "")
    if base_url and token:
        return {"base_url": base_url, "token": token, "org_id": org_id, "source": "env"}

    return None


async def save_kissflow_scim_config(db, org_id: str, base_url: str, token: str):
    """Save/update Kissflow SCIM config for an org in DB"""
    await db.kissflow_scim_config.update_one(
        {"org_id": org_id},
        {"$set": {
            "org_id": org_id,
            "base_url": base_url.rstrip("/") + "/",
            "token": token,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )


def _build_kissflow_user(user: dict) -> dict:
    """Build SCIM User payload for Kissflow"""
    phone = (user.get("work_mobile") or user.get("mobile") or "").strip()
    if phone and not phone.startswith("+") and not phone.startswith("91"):
        phone = f"91{phone}"

    first_name = user.get("first_name") or (user.get("name", "").split(" ", 1)[0] if user.get("name") else "")
    last_name = user.get("last_name") or (user.get("name", "").split(" ", 1)[1] if " " in user.get("name", "") else "")

    payload = {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "userName": user["email"],
        "name": {
            "givenName": first_name,
            "familyName": last_name,
        },
        "displayName": user.get("name") or user.get("full_name") or f"{first_name} {last_name}".strip(),
        "nickName": user.get("name") or user.get("full_name") or f"{first_name} {last_name}".strip(),
        "active": user.get("status", "active") == "active",
        "emails": [{"value": user["email"], "type": "work", "primary": True}],
        "title": user.get("designation") or "",
    }

    if phone:
        payload["phoneNumbers"] = [{"value": phone, "type": "work"}]

    supervisor_email = user.get("supervisor_email", "")
    if supervisor_email:
        payload["schemas"].append("urn:ietf:params:scim:schemas:extension:enterprise:2.0:User")
        payload["urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"] = {
            "manager": {
                "value": supervisor_email,
                "displayName": user.get("supervisor_name", ""),
            }
        }

    return payload


async def push_user_to_kissflow(client: httpx.AsyncClient, base_url: str, token: str, user: dict) -> dict:
    """Push a single user to Kissflow via SCIM. Creates if not exists, updates if exists."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/scim+json",
    }
    payload = _build_kissflow_user(user)
    email = user.get("email", "")

    try:
        filter_url = f"{base_url}Users?filter=userName eq \"{email}\""
        search_resp = await client.get(filter_url, headers=headers)

        if search_resp.status_code == 200:
            data = search_resp.json()
            resources = data.get("Resources", [])

            if resources:
                kf_user_id = resources[0].get("id")
                resp = await client.put(f"{base_url}Users/{kf_user_id}", json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    return {"action": "updated", "email": email, "kf_id": kf_user_id}
                else:
                    return {"action": "update_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}
            else:
                resp = await client.post(f"{base_url}Users", json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    kf_id = resp.json().get("id", "")
                    return {"action": "created", "email": email, "kf_id": kf_id}
                elif resp.status_code == 409:
                    return {"action": "already_exists", "email": email}
                else:
                    return {"action": "create_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}
        else:
            resp = await client.post(f"{base_url}Users", json=payload, headers=headers)
            if resp.status_code in (200, 201):
                kf_id = resp.json().get("id", "")
                return {"action": "created", "email": email, "kf_id": kf_id}
            else:
                return {"action": "error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}

    except Exception as e:
        return {"action": "exception", "email": email, "detail": str(e)[:300]}


async def deactivate_user_in_kissflow(client: httpx.AsyncClient, base_url: str, token: str, email: str) -> dict:
    """Deactivate a user in Kissflow via SCIM PATCH"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/scim+json",
    }
    try:
        filter_url = f"{base_url}Users?filter=userName eq \"{email}\""
        search_resp = await client.get(filter_url, headers=headers)

        if search_resp.status_code == 200:
            resources = search_resp.json().get("Resources", [])
            if resources:
                kf_user_id = resources[0].get("id")
                patch_payload = {
                    "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                    "Operations": [{"op": "replace", "path": "active", "value": False}],
                }
                resp = await client.patch(f"{base_url}Users/{kf_user_id}", json=patch_payload, headers=headers)
                if resp.status_code in (200, 204):
                    return {"action": "deactivated", "email": email, "kf_id": kf_user_id}
                else:
                    return {"action": "deactivate_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}
            else:
                return {"action": "not_found", "email": email}
        else:
            return {"action": "search_error", "email": email, "status": search_resp.status_code}

    except Exception as e:
        return {"action": "exception", "email": email, "detail": str(e)[:300]}


async def sync_to_kissflow(db, org_id: str, user_emails: list = None) -> dict:
    """
    Push users from IAM to Kissflow via SCIM.
    If user_emails is provided, only push those specific users.
    Otherwise push all active users.
    """
    config = await get_kissflow_scim_config(db, org_id)
    if not config:
        return {"error": "Kissflow SCIM not configured. Add KISSFLOW_SCIM_BASE_URL and KISSFLOW_SCIM_TOKEN to env or configure in DB."}

    base_url = config["base_url"].rstrip("/") + "/"
    token = config["token"]

    query = {"org_id": org_id}
    if user_emails:
        query["email"] = {"$in": user_emails}

    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(5000)

    result = {
        "total": len(users),
        "created": 0,
        "updated": 0,
        "deactivated": 0,
        "already_exists": 0,
        "errors": [],
        "skipped": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    async with httpx.AsyncClient(timeout=60) as client:
        for user in users:
            email = user.get("email", "")
            if not email or email.endswith("@abc.com"):
                result["skipped"] += 1
                continue

            if user.get("status") == "disabled":
                res = await deactivate_user_in_kissflow(client, base_url, token, email)
                if res["action"] == "deactivated":
                    result["deactivated"] += 1
                elif res["action"] == "not_found":
                    result["skipped"] += 1
                else:
                    result["errors"].append(f"{email}: {res.get('detail', res['action'])}")
            else:
                res = await push_user_to_kissflow(client, base_url, token, user)
                if res["action"] == "created":
                    result["created"] += 1
                elif res["action"] == "updated":
                    result["updated"] += 1
                elif res["action"] == "already_exists":
                    result["already_exists"] += 1
                else:
                    result["errors"].append(f"{email}: {res.get('detail', res['action'])}")

            kf_id = res.get("kf_id")
            if kf_id:
                await db.users.update_one(
                    {"email": email, "org_id": org_id},
                    {"$set": {"kissflow_user_id": kf_id, "kissflow_synced_at": datetime.now(timezone.utc).isoformat()}}
                )

    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    return result


async def push_single_user_to_kissflow(db, org_id: str, email: str) -> dict:
    """Push a single user to Kissflow. Used for real-time sync on admin edits."""
    config = await get_kissflow_scim_config(db, org_id)
    if not config:
        return {"error": "Kissflow SCIM not configured"}

    base_url = config["base_url"].rstrip("/") + "/"
    token = config["token"]

    user = await db.users.find_one({"email": email, "org_id": org_id}, {"_id": 0, "password": 0})
    if not user:
        return {"error": f"User {email} not found"}

    async with httpx.AsyncClient(timeout=30) as client:
        if user.get("status") == "disabled":
            res = await deactivate_user_in_kissflow(client, base_url, token, email)
        else:
            res = await push_user_to_kissflow(client, base_url, token, user)

    kf_id = res.get("kf_id")
    if kf_id:
        await db.users.update_one(
            {"email": email, "org_id": org_id},
            {"$set": {"kissflow_user_id": kf_id, "kissflow_synced_at": datetime.now(timezone.utc).isoformat()}}
        )

    return res
