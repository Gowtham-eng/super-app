"""
Kissflow SCIM Client
Pushes users FROM Refex Super App TO Kissflow's SCIM Server.

Key features:
- Kissflow custom extension schema for Employee ID, L2 Manager, Department etc.
- Rate limiting with configurable delay between requests
- Retry logic for 429 (Too Many Requests) responses
- Background async sync to avoid HTTP timeout on large user bases
- Reads config from DB (kissflow_scim_config) or falls back to env vars
"""
import os
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
    phone = (user.get("work_mobile") or user.get("mobile") or "").strip()
    # Clean phone: remove non-digits, add 91 prefix if needed
    phone_digits = "".join(c for c in phone if c.isdigit())
    if phone_digits and phone_digits != "0":
        if not phone_digits.startswith("91") and len(phone_digits) == 10:
            phone_digits = f"91{phone_digits}"
    else:
        phone_digits = ""

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

    if phone_digits:
        payload["phoneNumbers"] = [{"value": phone_digits, "type": "work"}]

    # Kissflow custom extension - uses exact field IDs from Kissflow schema
    kf_ext = {}

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

    # Manager (L1) - complex type with Email and Name sub-attributes
    supervisor_email = user.get("supervisor_email", "")
    supervisor_name = user.get("supervisor_name", "")
    if supervisor_email:
        kf_ext["Manager"] = {
            "Email": supervisor_email,
            "Name": supervisor_name,
        }
        kf_ext["L1_Manager_Email"] = supervisor_email
        kf_ext["L1_Manager_Name"] = supervisor_name

    # L2 Manager - complex type with Email and Name sub-attributes
    l2_email = user.get("l2_manager_email", "")
    l2_name = user.get("l2_manager_name", "")
    if l2_email:
        kf_ext["L2_Manager"] = {
            "Email": l2_email,
            "Name": l2_name,
        }

    payload[KISSFLOW_EXTENSION_SCHEMA] = kf_ext
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


async def push_user_to_kissflow(client: httpx.AsyncClient, base_url: str, token: str, user: dict, create_only: bool = False) -> dict:
    """Push a single user to Kissflow via SCIM. 
    If create_only=True, skip search and POST directly (faster for fresh sync).
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
        if create_only:
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
                # User doesn't exist -> CREATE (POST)
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


async def sync_to_kissflow(db, org_id: str, user_emails: list = None) -> dict:
    """
    Push users from IAM to Kissflow via SCIM.
    If user_emails is provided, only push those specific users.
    Otherwise push all active users.
    Includes rate limiting and retry logic.
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
        "auth_errors": 0,
        "skipped": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    # Stop early on repeated auth errors
    consecutive_auth_errors = 0
    MAX_AUTH_ERRORS = 5

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
                elif res["action"] == "not_found":
                    result["skipped"] += 1
                elif res["action"] == "auth_error":
                    result["auth_errors"] += 1
                    consecutive_auth_errors += 1
                else:
                    result["errors"].append(f"{email}: {res.get('detail', res['action'])}")
                    consecutive_auth_errors = 0
            else:
                # Use create_only mode if user has no kissflow_user_id (faster - skips search)
                is_fresh = not user.get("kissflow_user_id")
                res = await push_user_to_kissflow(client, base_url, token, user, create_only=is_fresh)
                if res["action"] == "created":
                    result["created"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "updated":
                    result["updated"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "already_exists":
                    result["already_exists"] += 1
                    consecutive_auth_errors = 0
                elif res["action"] == "auth_error":
                    result["auth_errors"] += 1
                    consecutive_auth_errors += 1
                else:
                    result["errors"].append(f"{email}: {res.get('detail', res['action'])}")
                    consecutive_auth_errors = 0

            kf_id = res.get("kf_id")
            if kf_id:
                await db.users.update_one(
                    {"email": email, "org_id": org_id},
                    {"$set": {"kissflow_user_id": kf_id, "kissflow_synced_at": datetime.now(timezone.utc).isoformat()}}
                )

            # Log progress every 100 users
            processed = i + 1
            if processed % 100 == 0:
                logger.info(f"Kissflow sync progress: {processed}/{len(users)} (created={result['created']}, updated={result['updated']}, errors={len(result['errors'])})")

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
