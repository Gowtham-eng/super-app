"""
Kissflow SCIM Client
Pushes users FROM RefexOne TO Kissflow's SCIM Server.

Key features:
- Kissflow custom extension schema for Employee ID, L2 Manager, Department etc.
- Rate limiting with configurable delay between requests
- Retry logic for 429 (Too Many Requests) responses
- Background async sync to avoid HTTP timeout on large user bases
- Reads config from DB (kissflow_scim_config) or falls back to env vars
"""
import os
import re
import asyncio
import logging
import httpx
from datetime import datetime, timezone

logger = logging.getLogger("kissflow_scim")

# Kissflow Account ID from the SCIM URL
KISSFLOW_ACCOUNT_ID = "AcCMptlq60zH"
KISSFLOW_EXTENSION_SCHEMA = f"urn:kissflow:scim:schemas:extension:{KISSFLOW_ACCOUNT_ID}:2:User"
ENTERPRISE_EXTENSION_SCHEMA = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"

# Rate limiting: delay between requests in seconds
REQUEST_DELAY = 0.25
# Retry config for 429 responses
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds to wait on 429


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
    """
    Build SCIM User payload for Kissflow.
    Uses Kissflow custom extension schema with exact field IDs from Kissflow's schema.
    
    Kissflow custom fields (urn:kissflow:scim:schemas:extension:AcCMptlq60zH:2:User):
    - Manager: complex {value, Email, Name} (L1 Manager)
    - L2_Manager: complex {value, Email, Name}
    - Employee_ID: string
    - Designation_1: string
    - Department_Code: string
    - Branch: string
    - Location_1: string
    - Office_Location: string
    - Employee_Status: string
    - Date_of_Exit: string
    - L1_Manager_Name: string
    - L1_Manager_Email: string
    """
    work_mobile = (user.get("work_mobile") or "").strip()
    personal_mobile = (user.get("employee_mobile") or user.get("mobile") or "").strip()

    def _clean_phone(phone):
        digits = "".join(c for c in phone if c.isdigit())
        if digits and digits != "0":
            if not digits.startswith("91") and len(digits) == 10:
                digits = f"91{digits}"
            return digits
        return ""

    work_digits = _clean_phone(work_mobile)
    personal_digits = _clean_phone(personal_mobile)
    # Avoid duplicates
    if personal_digits == work_digits:
        personal_digits = ""

    first_name = user.get("first_name") or (user.get("name", "").split(" ", 1)[0] if user.get("name") else "")
    last_name = user.get("last_name") or ""
    if not last_name and user.get("name") and " " in user.get("name", ""):
        last_name = user["name"].split(" ", 1)[1]

    display_name = user.get("name") or user.get("full_name") or f"{first_name} {last_name}".strip()

    schemas = [
        "urn:ietf:params:scim:schemas:core:2.0:User",
        KISSFLOW_EXTENSION_SCHEMA,
    ]

    payload = {
        "userName": user["email"],
        "name": {
            "givenName": first_name,
            "familyName": last_name,
        },
        "displayName": display_name,
        "nickName": display_name,
        "active": user.get("status", "active") == "active",
        "emails": [{"value": user["email"], "type": "work", "primary": True}],
        "title": user.get("designation") or "",
    }

    # Phone numbers - include both work and personal if available
    phone_numbers = []
    if work_digits:
        phone_numbers.append({"value": work_digits, "type": "work"})
    if personal_digits:
        phone_numbers.append({"value": personal_digits, "type": "mobile"})
    if phone_numbers:
        payload["phoneNumbers"] = phone_numbers

    # Kissflow custom extension - uses exact field IDs from Kissflow schema
    kf_ext = {}

    # Mobile Numbers — EXACT Kissflow field IDs (from User Management columns):
    #   EMPLOYEE_MOBILE_NUMBER   = personal mobile
    #   REFEX_WORK_MOBILE_NUMBER = work mobile
    # We also send a couple of safe aliases in case any other workflow references them.
    if work_digits:
        kf_ext["REFEX_WORK_MOBILE_NUMBER"] = work_digits
        kf_ext["Refex_Work_Mobile_Number"] = work_digits
    if personal_digits:
        kf_ext["EMPLOYEE_MOBILE_NUMBER"] = personal_digits
        kf_ext["Employee_Mobile_Number"] = personal_digits

    # Employee ID
    emp_id = user.get("adrenalin_employee_id", "")
    if emp_id:
        kf_ext["Employee_ID"] = emp_id

    # Designation
    designation = user.get("designation", "")
    if designation:
        kf_ext["Designation_1"] = designation

    # Department Code
    dept_code = user.get("department_code", "")
    if dept_code:
        kf_ext["Department_Code"] = dept_code

    # Department (full name)
    department = user.get("department", "")
    if department:
        kf_ext["Department"] = department

    # Company / Legal Entity (Refex Holding Pvt Ltd, STPL, etc.)
    company = user.get("company", "")
    if company:
        kf_ext["Company"] = company
        kf_ext["Company_Name"] = company
        kf_ext["Legal_Entity"] = company

    # Branch
    branch = user.get("branch_code") or user.get("business_line") or ""
    if branch:
        kf_ext["Branch"] = branch

    # Location
    location = user.get("location") or user.get("office_location") or ""
    if location:
        kf_ext["Location_1"] = location

    # Office Location
    office_loc = user.get("office_location", "")
    if office_loc:
        kf_ext["Office_Location"] = office_loc

    # Employee Status
    emp_status = user.get("employee_status_description") or user.get("employee_status") or ""
    if emp_status:
        kf_ext["Employee_Status"] = emp_status

    # Date of Exit
    date_exit = user.get("date_of_exit", "")
    if date_exit:
        kf_ext["Date_of_Exit"] = date_exit

    # Manager (L1) - complex type: needs Kissflow user ID in 'value' for lookup to work
    supervisor_email = user.get("supervisor_email", "")
    supervisor_name = user.get("supervisor_name", "")
    if supervisor_email:
        manager_obj = {
            "Email": supervisor_email,
            "Name": supervisor_name,
        }
        # If we have the manager's Kissflow ID, include it for proper lookup resolution
        supervisor_kf_id = user.get("_supervisor_kf_id", "")
        if supervisor_kf_id:
            manager_obj["value"] = supervisor_kf_id
        kf_ext["Manager"] = manager_obj
        kf_ext["L1_Manager_Email"] = supervisor_email
        kf_ext["L1_Manager_Name"] = supervisor_name

    # L2 Manager - complex type: needs Kissflow user ID in 'value' for lookup to work
    l2_email = user.get("l2_manager_email", "")
    l2_name = user.get("l2_manager_name", "")
    if l2_email:
        l2_obj = {
            "Email": l2_email,
            "Name": l2_name,
        }
        l2_kf_id = user.get("_l2_manager_kf_id", "")
        if l2_kf_id:
            l2_obj["value"] = l2_kf_id
        kf_ext["L2_Manager"] = l2_obj

    payload[KISSFLOW_EXTENSION_SCHEMA] = kf_ext

    # Standard SCIM Enterprise extension — Kissflow/Azure/OneLogin all respect `organization`
    enterprise_ext = {}
    if user.get("company"):
        enterprise_ext["organization"] = user.get("company")
    if user.get("department"):
        enterprise_ext["department"] = user.get("department")
    if user.get("adrenalin_employee_id"):
        enterprise_ext["employeeNumber"] = user.get("adrenalin_employee_id")
    if user.get("supervisor_email"):
        enterprise_ext["manager"] = {
            "value": user.get("_supervisor_kf_id", ""),
            "displayName": user.get("supervisor_name", ""),
        }
    if enterprise_ext:
        payload[ENTERPRISE_EXTENSION_SCHEMA] = enterprise_ext
        if ENTERPRISE_EXTENSION_SCHEMA not in schemas:
            schemas.append(ENTERPRISE_EXTENSION_SCHEMA)

    payload["schemas"] = schemas
    return payload


async def _request_with_retry(client: httpx.AsyncClient, method: str, url: str, headers: dict, json_data: dict = None) -> httpx.Response:
    """Make an HTTP request with retry logic for 429 rate limiting."""
    for attempt in range(MAX_RETRIES + 1):
        if method == "GET":
            resp = await client.get(url, headers=headers)
        elif method == "POST":
            resp = await client.post(url, json=json_data, headers=headers)
        elif method == "PUT":
            resp = await client.put(url, json=json_data, headers=headers)
        elif method == "PATCH":
            resp = await client.patch(url, json=json_data, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")

        if resp.status_code == 429 and attempt < MAX_RETRIES:
            wait = RETRY_DELAY * (attempt + 1)
            logger.warning(f"Rate limited (429) on {method} {url}, waiting {wait}s (attempt {attempt + 1}/{MAX_RETRIES})")
            await asyncio.sleep(wait)
            continue

        return resp

    return resp


async def push_user_to_kissflow(
    client: httpx.AsyncClient,
    base_url: str,
    token: str,
    user: dict,
    create_only: bool = False,
    update_only: bool = False,
) -> dict:
    """Push a single user to Kissflow via SCIM.
    If create_only=True, skip search and POST directly (faster for fresh sync).
    If update_only=True, never create — return not_found when user is missing in Kissflow.
    Otherwise, search first then create or update.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/scim+json",
    }
    payload = _build_kissflow_user(user)
    email = user.get("email", "")

    try:
        # Fast path: direct create (skip search) for fresh sync
        if create_only and not update_only:
            resp = await _request_with_retry(client, "POST", f"{base_url}Users", headers, payload)
            if resp.status_code in (200, 201):
                kf_id = resp.json().get("id", "")
                return {"action": "created", "email": email, "kf_id": kf_id}
            elif resp.status_code == 409:
                # Already exists - fall through to search+update
                pass
            else:
                return {"action": "create_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}

        # Search for existing user
        filter_url = f"{base_url}Users?filter=userName eq \"{email}\""
        search_resp = await _request_with_retry(client, "GET", filter_url, headers)

        if search_resp.status_code == 200:
            data = search_resp.json()
            resources = data.get("Resources", [])

            if resources:
                # User exists -> UPDATE (PUT)
                kf_user_id = resources[0].get("id")
                await asyncio.sleep(REQUEST_DELAY)
                resp = await _request_with_retry(client, "PUT", f"{base_url}Users/{kf_user_id}", headers, payload)
                if resp.status_code in (200, 201):
                    return {"action": "updated", "email": email, "kf_id": kf_user_id}
                else:
                    return {"action": "update_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}
            else:
                # User doesn't exist in Kissflow
                if update_only:
                    return {"action": "not_found", "email": email}
                # CREATE (POST)
                await asyncio.sleep(REQUEST_DELAY)
                resp = await _request_with_retry(client, "POST", f"{base_url}Users", headers, payload)
                if resp.status_code in (200, 201):
                    kf_id = resp.json().get("id", "")
                    return {"action": "created", "email": email, "kf_id": kf_id}
                elif resp.status_code == 409:
                    return {"action": "already_exists", "email": email}
                else:
                    return {"action": "create_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}

        elif search_resp.status_code in (401, 403):
            return {"action": "auth_error", "email": email, "status": search_resp.status_code, "detail": search_resp.text[:300]}
        else:
            if update_only:
                return {"action": "search_error", "email": email, "status": search_resp.status_code}
            # Search failed, try direct create
            await asyncio.sleep(REQUEST_DELAY)
            resp = await _request_with_retry(client, "POST", f"{base_url}Users", headers, payload)
            if resp.status_code in (200, 201):
                kf_id = resp.json().get("id", "")
                return {"action": "created", "email": email, "kf_id": kf_id}
            else:
                return {"action": "error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}

    except Exception as e:
        return {"action": "exception", "email": email, "detail": str(e)[:300]}


def _is_kissflow_app(app: dict) -> bool:
    blob = " ".join(
        str(app.get(k) or "")
        for k in ("name", "home_url", "acs_url", "entity_id", "description")
    ).lower()
    return "kissflow" in blob


async def get_kissflow_app_ids(db, org_id: str) -> list:
    """SAML + OIDC app ids that represent Kissflow in RefexOne."""
    ids = []
    for coll in ("saml_apps", "oidc_apps"):
        apps = await db[coll].find({"org_id": org_id}, {"_id": 0, "id": 1, "name": 1, "home_url": 1, "acs_url": 1, "entity_id": 1, "description": 1}).to_list(200)
        for app in apps:
            if _is_kissflow_app(app) and app.get("id"):
                ids.append({"collection": coll, "id": app["id"]})
    return ids


async def revoke_kissflow_access_in_refexone(db, org_id: str, *, user_id: str = None, email: str = None) -> dict:
    """
    Remove ONLY Kissflow app access inside RefexOne when the user is gone/disabled in Kissflow:
    - clear kissflow_user_id / kissflow_synced_at
    - remove user from Kissflow app approved_user_ids only

    Does NOT:
    - disable / delete the RefexOne user
    - change password, role, or org
    - remove access to any non-Kissflow apps
    - touch users who never had Kissflow access
    """
    if db is None:
        return {"revoked": False}
    query = {"org_id": org_id}
    if user_id:
        query = {"id": user_id}
    elif email:
        query["email"] = (email or "").strip().lower()
    else:
        return {"revoked": False}

    user = await db.users.find_one(
        query,
        {"_id": 0, "id": 1, "email": 1, "kissflow_user_id": 1, "status": 1},
    )
    if not user:
        return {"revoked": False, "reason": "user_not_found"}

    uid = user["id"]

    # Only act on users who already had Kissflow access — never touch others
    if not await user_has_kissflow_access(db, org_id, user):
        return {
            "revoked": False,
            "reason": "no_kissflow_access",
            "user_id": uid,
            "email": user.get("email"),
        }

    # Clear Kissflow linkage only (keep RefexOne account fully intact)
    await db.users.update_one(
        {"id": uid},
        {"$unset": {"kissflow_user_id": "", "kissflow_synced_at": ""}},
    )

    apps = await get_kissflow_app_ids(db, org_id)
    removed_from = []
    for app in apps:
        res = await db[app["collection"]].update_one(
            {"id": app["id"]},
            {"$pull": {"approved_user_ids": uid}},
        )
        if res.modified_count:
            removed_from.append(app["id"])

    logger.info(
        "Revoked Kissflow-only access in RefexOne for %s (kissflow apps=%s; RefexOne login/other apps unchanged)",
        user.get("email"),
        removed_from,
    )
    return {
        "revoked": True,
        "user_id": uid,
        "email": user.get("email"),
        "apps_updated": removed_from,
        "refexone_account_unchanged": True,
    }


async def user_has_kissflow_access(db, org_id: str, user: dict) -> bool:
    """True if user already has Kissflow linkage or is assigned to a Kissflow app."""
    if user.get("kissflow_user_id"):
        return True
    uid = user.get("id")
    if not uid:
        return False
    apps = await get_kissflow_app_ids(db, org_id)
    for app in apps:
        doc = await db[app["collection"]].find_one(
            {"id": app["id"], "approved_user_ids": uid},
            {"_id": 0, "id": 1},
        )
        if doc:
            return True
    return False


async def check_user_kissflow_access(db, org_id: str, email: str, user_id: str = None) -> dict:
    """
    Live-verify whether the user still has Kissflow login access (SCIM).
    If the user was deleted/deactivated in Kissflow, clear Kissflow access in RefexOne
    (kissflow_user_id + Kissflow app approved_user_ids).
    """
    email = (email or "").strip().lower()
    result = {
        "user_in_kissflow": False,
        "kissflow_user_id": None,
        "kissflow_active": False,
        "verified_via": None,
    }
    if not email:
        return result

    config = await get_kissflow_scim_config(db, org_id) if db is not None else None

    async def _revoke_local_access():
        if db is None:
            return None
        # Only removes Kissflow app assignment — never RefexOne login / other apps
        return await revoke_kissflow_access_in_refexone(
            db, org_id, user_id=user_id, email=email
        )

    if not config:
        # No SCIM — fall back to local flag only
        local_kf_id = None
        if db is not None:
            q = {"id": user_id} if user_id else {"email": email}
            local = await db.users.find_one(q, {"_id": 0, "kissflow_user_id": 1})
            local_kf_id = (local or {}).get("kissflow_user_id")
        has_local = bool(local_kf_id and str(local_kf_id).strip())
        result["user_in_kissflow"] = has_local
        result["kissflow_user_id"] = local_kf_id if has_local else None
        result["kissflow_active"] = has_local
        result["verified_via"] = "local_db"
        return result

    base_url = config["base_url"].rstrip("/") + "/"
    token = config["token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/scim+json",
    }
    filter_url = f'{base_url}Users?filter=userName eq "{email}"'

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            search_resp = await _request_with_retry(client, "GET", filter_url, headers)

        if search_resp.status_code != 200:
            # Do not trust stale local id when SCIM check fails closed for access redirect
            result["verified_via"] = "scim_error"
            result["error"] = f"scim_status_{search_resp.status_code}"
            return result

        resources = (search_resp.json() or {}).get("Resources") or []
        if not resources:
            # Deleted from Kissflow — revoke Kissflow app only (RefexOne account stays)
            revoke_res = await _revoke_local_access()
            result["verified_via"] = "scim"
            result["access_revoked"] = bool(revoke_res and revoke_res.get("revoked"))
            return result

        kf_user = resources[0]
        kf_id = kf_user.get("id")
        active = kf_user.get("active", True) is True
        if not active:
            revoke_res = await _revoke_local_access()
            result["verified_via"] = "scim"
            result["kissflow_user_id"] = kf_id
            result["kissflow_active"] = False
            result["access_revoked"] = bool(revoke_res and revoke_res.get("revoked"))
            return result

        # Active in Kissflow — keep/update local id
        if db is not None and kf_id:
            q = {"id": user_id} if user_id else {"email": email, "org_id": org_id}
            await db.users.update_one(
                q,
                {"$set": {
                    "kissflow_user_id": kf_id,
                    "kissflow_synced_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

        result["kissflow_user_id"] = kf_id
        result["kissflow_active"] = True
        result["user_in_kissflow"] = True
        result["verified_via"] = "scim"
        return result
    except Exception as exc:
        logger.warning("Kissflow access check failed for %s: %s", email, exc)
        result["verified_via"] = "scim_exception"
        result["error"] = str(exc)[:200]
        return result


async def deactivate_user_in_kissflow(client: httpx.AsyncClient, base_url: str, token: str, email: str) -> dict:
    """Deactivate a user in Kissflow via SCIM PATCH"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/scim+json",
    }
    try:
        filter_url = f"{base_url}Users?filter=userName eq \"{email}\""
        search_resp = await _request_with_retry(client, "GET", filter_url, headers)

        if search_resp.status_code == 200:
            resources = search_resp.json().get("Resources", [])
            if resources:
                kf_user_id = resources[0].get("id")
                patch_payload = {
                    "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                    "Operations": [{"op": "replace", "path": "active", "value": False}],
                }
                await asyncio.sleep(REQUEST_DELAY)
                resp = await _request_with_retry(client, "PATCH", f"{base_url}Users/{kf_user_id}", headers, patch_payload)
                if resp.status_code in (200, 204):
                    return {"action": "deactivated", "email": email, "kf_id": kf_user_id}
                else:
                    return {"action": "deactivate_error", "email": email, "status": resp.status_code, "detail": resp.text[:300]}
            else:
                return {"action": "not_found", "email": email}
        elif search_resp.status_code in (401, 403):
            return {"action": "auth_error", "email": email, "status": search_resp.status_code, "detail": search_resp.text[:300]}
        else:
            return {"action": "search_error", "email": email, "status": search_resp.status_code}

    except Exception as e:
        return {"action": "exception", "email": email, "detail": str(e)[:300]}


async def sync_to_kissflow(
    db,
    org_id: str,
    user_emails: list = None,
    *,
    only_existing: bool = True,
    create_missing: bool = False,
) -> dict:
    """
    Sync users between RefexOne and Kissflow via SCIM.

    Default (only_existing=True, create_missing=False):
      - Do NOT push all RefexOne users into Kissflow
      - Only update users who already have Kissflow access
        (kissflow_user_id or assigned to a Kissflow app)
      - If a user is missing/disabled in Kissflow, revoke Kissflow app access in RefexOne

    Set create_missing=True only when you intentionally want to provision new Kissflow accounts.
    """
    config = await get_kissflow_scim_config(db, org_id)
    if not config:
        return {"error": "Kissflow SCIM not configured. Add KISSFLOW_SCIM_BASE_URL and KISSFLOW_SCIM_TOKEN to env or configure in DB."}

    base_url = config["base_url"].rstrip("/") + "/"
    token = config["token"]

    query = {"org_id": org_id}
    if user_emails:
        query["email"] = {"$in": user_emails}

    candidates = await db.users.find(query, {"_id": 0, "password": 0}).to_list(5000)

    users = []
    if only_existing and not user_emails:
        # Restrict to users who already have Kissflow access in RefexOne
        for u in candidates:
            if await user_has_kissflow_access(db, org_id, u):
                users.append(u)
    elif only_existing and user_emails:
        for u in candidates:
            if await user_has_kissflow_access(db, org_id, u):
                users.append(u)
    else:
        users = candidates

    result = {
        "total": len(users),
        "created": 0,
        "updated": 0,
        "deactivated": 0,
        "already_exists": 0,
        "access_revoked": 0,
        "errors": [],
        "auth_errors": 0,
        "skipped": 0,
        "mode": "existing_only" if (only_existing and not create_missing) else "full",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    # Stop early on repeated auth errors
    consecutive_auth_errors = 0
    MAX_AUTH_ERRORS = 5
    update_only = only_existing and not create_missing

    async with httpx.AsyncClient(timeout=60) as client:
        for i, user in enumerate(users):
            email = user.get("email", "")
            if not email or email.endswith("@abc.com"):
                result["skipped"] += 1
                continue

            # Stop if too many auth errors (token expired/invalid)
            if consecutive_auth_errors >= MAX_AUTH_ERRORS:
                remaining = len(users) - i
                result["errors"].append(f"Stopped: {remaining} users skipped due to repeated auth errors. Check SCIM token.")
                result["skipped"] += remaining
                break

            # Rate limiting delay
            if i > 0:
                await asyncio.sleep(REQUEST_DELAY)

            if user.get("status") == "disabled":
                res = await deactivate_user_in_kissflow(client, base_url, token, email)
                if res["action"] == "deactivated":
                    result["deactivated"] += 1
                    consecutive_auth_errors = 0
                    # Also revoke RefexOne Kissflow app tile while disabled
                    await revoke_kissflow_access_in_refexone(
                        db, org_id, user_id=user.get("id"), email=email
                    )
                    result["access_revoked"] += 1
                elif res["action"] == "not_found":
                    await revoke_kissflow_access_in_refexone(
                        db, org_id, user_id=user.get("id"), email=email
                    )
                    result["access_revoked"] += 1
                    result["skipped"] += 1
                elif res["action"] == "auth_error":
                    result["auth_errors"] += 1
                    consecutive_auth_errors += 1
                else:
                    result["errors"].append(f"{email}: {res.get('detail', res['action'])}")
                    consecutive_auth_errors = 0
            else:
                res = await push_user_to_kissflow(
                    client,
                    base_url,
                    token,
                    user,
                    create_only=False,
                    update_only=update_only,
                )
                if res["action"] == "created":
                    result["created"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "updated":
                    result["updated"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "already_exists":
                    result["already_exists"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "not_found":
                    # Gone from Kissflow — remove Kissflow access in RefexOne
                    await revoke_kissflow_access_in_refexone(
                        db, org_id, user_id=user.get("id"), email=email
                    )
                    result["access_revoked"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "auth_error":
                    result["auth_errors"] += 1
                    consecutive_auth_errors += 1
                else:
                    result["errors"].append(f"{email}: {res.get('detail', res['action'])}")
                    consecutive_auth_errors = 0

            kf_id = res.get("kf_id")
            if kf_id and res.get("action") in ("created", "updated", "already_exists"):
                await db.users.update_one(
                    {"email": email, "org_id": org_id},
                    {"$set": {"kissflow_user_id": kf_id, "kissflow_synced_at": datetime.now(timezone.utc).isoformat()}}
                )

            # Log progress every 100 users
            processed = i + 1
            if processed % 100 == 0:
                logger.info(f"Kissflow sync progress: {processed}/{len(users)} (created={result['created']}, updated={result['updated']}, revoked={result['access_revoked']}, errors={len(result['errors'])})")

    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    return result


async def push_single_user_to_kissflow(db, org_id: str, email: str) -> dict:
    """
    Update an existing Kissflow user from RefexOne.
    Does NOT create new Kissflow accounts — only keeps access for users who already have it.
    """
    config = await get_kissflow_scim_config(db, org_id)
    if not config:
        return {"error": "Kissflow SCIM not configured"}

    base_url = config["base_url"].rstrip("/") + "/"
    token = config["token"]

    user = await db.users.find_one({"email": email, "org_id": org_id}, {"_id": 0, "password": 0})
    if not user:
        return {"error": f"User {email} not found"}

    # Skip users who never had Kissflow access — do not provision everyone
    if not await user_has_kissflow_access(db, org_id, user):
        return {
            "action": "skipped",
            "email": email,
            "detail": "User has no existing Kissflow access in RefexOne; not creating in Kissflow",
        }

    async with httpx.AsyncClient(timeout=30) as client:
        if user.get("status") == "disabled":
            res = await deactivate_user_in_kissflow(client, base_url, token, email)
            if res.get("action") in ("deactivated", "not_found"):
                await revoke_kissflow_access_in_refexone(
                    db, org_id, user_id=user.get("id"), email=email
                )
                res["access_revoked"] = True
        else:
            res = await push_user_to_kissflow(
                client, base_url, token, user, update_only=True
            )
            if res.get("action") == "not_found":
                await revoke_kissflow_access_in_refexone(
                    db, org_id, user_id=user.get("id"), email=email
                )
                res["access_revoked"] = True

    kf_id = res.get("kf_id")
    if kf_id and res.get("action") in ("created", "updated", "already_exists"):
        await db.users.update_one(
            {"email": email, "org_id": org_id},
            {"$set": {"kissflow_user_id": kf_id, "kissflow_synced_at": datetime.now(timezone.utc).isoformat()}}
        )

    return res



async def resolve_managers_in_kissflow(db, org_id: str) -> dict:
    """
    Second pass: Update Manager and L2_Manager lookup fields with Kissflow User IDs.
    This must run AFTER all users are created in Kissflow, because the Manager lookup
    requires the manager's Kissflow internal user ID.
    """
    config = await get_kissflow_scim_config(db, org_id)
    if not config:
        return {"error": "Kissflow SCIM not configured"}

    base_url = config["base_url"].rstrip("/") + "/"
    token = config["token"]

    # Build email -> kissflow_user_id mapping from our DB
    all_users = await db.users.find(
        {"org_id": org_id, "kissflow_user_id": {"$exists": True, "$ne": ""}},
        {"_id": 0, "email": 1, "kissflow_user_id": 1}
    ).to_list(5000)

    email_to_kf_id = {u["email"]: u["kissflow_user_id"] for u in all_users}
    logger.info(f"Manager resolution: {len(email_to_kf_id)} users with Kissflow IDs")

    # Get users who have managers that we can now resolve
    users_with_managers = await db.users.find(
        {
            "org_id": org_id,
            "kissflow_user_id": {"$exists": True, "$ne": ""},
            "$or": [
                {"supervisor_email": {"$exists": True, "$ne": ""}},
                {"l2_manager_email": {"$exists": True, "$ne": ""}},
            ]
        },
        {"_id": 0, "password": 0}
    ).to_list(5000)

    result = {"total": len(users_with_managers), "updated": 0, "skipped": 0, "errors": [], "auth_errors": 0}
    consecutive_auth_errors = 0

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/scim+json",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        for i, user in enumerate(users_with_managers):
            email = user.get("email", "")
            kf_user_id = user.get("kissflow_user_id", "")
            if not kf_user_id:
                result["skipped"] += 1
                continue

            if consecutive_auth_errors >= 5:
                result["errors"].append(f"Stopped: auth errors. Check token.")
                break

            supervisor_email = user.get("supervisor_email", "")
            l2_email = user.get("l2_manager_email", "")

            supervisor_kf_id = email_to_kf_id.get(supervisor_email, "")
            l2_kf_id = email_to_kf_id.get(l2_email, "")

            # Skip if no manager IDs to resolve
            if not supervisor_kf_id and not l2_kf_id:
                result["skipped"] += 1
                continue

            # Build PATCH payload for manager fields only
            kf_ext = {}
            if supervisor_kf_id:
                kf_ext["Manager"] = {
                    "value": supervisor_kf_id,
                    "Email": supervisor_email,
                    "Name": user.get("supervisor_name", ""),
                }
            if l2_kf_id:
                kf_ext["L2_Manager"] = {
                    "value": l2_kf_id,
                    "Email": l2_email,
                    "Name": user.get("l2_manager_name", ""),
                }

            # Use PUT to update the user with resolved manager IDs
            user["_supervisor_kf_id"] = supervisor_kf_id
            user["_l2_manager_kf_id"] = l2_kf_id
            payload = _build_kissflow_user(user)

            if i > 0:
                await asyncio.sleep(REQUEST_DELAY)

            try:
                resp = await _request_with_retry(client, "PUT", f"{base_url}Users/{kf_user_id}", headers, payload)
                if resp.status_code in (200, 201):
                    result["updated"] += 1
                    consecutive_auth_errors = 0
                elif resp.status_code in (401, 403):
                    result["auth_errors"] += 1
                    consecutive_auth_errors += 1
                else:
                    result["errors"].append(f"{email}: {resp.status_code} {resp.text[:100]}")
                    consecutive_auth_errors = 0
            except Exception as e:
                result["errors"].append(f"{email}: {str(e)[:100]}")

            if (i + 1) % 100 == 0:
                logger.info(f"Manager resolution progress: {i+1}/{len(users_with_managers)} (updated={result['updated']})")

    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    return result
