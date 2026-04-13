"""
SCIM v2 Server Implementation (RFC 7643 / 7644)
Provides /api/scim/v2/* endpoints for Kissflow (or any SCIM client) to sync users & groups.
"""
import os
import re
import uuid
import bcrypt
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

logger = logging.getLogger("scim")

router = APIRouter(prefix="/api/scim/v2")

# Will be set by server.py on startup
db = None

SCIM_SCHEMAS = {
    "user": "urn:ietf:params:scim:schemas:core:2.0:User",
    "enterprise_user": "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User",
    "refex_user": "urn:ietf:params:scim:schemas:extension:refex:2.0:User",
    "group": "urn:ietf:params:scim:schemas:core:2.0:Group",
    "list": "urn:ietf:params:scim:api:messages:2.0:ListResponse",
    "error": "urn:ietf:params:scim:api:messages:2.0:Error",
    "sp_config": "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
    "schema": "urn:ietf:params:scim:schemas:core:2.0:Schema",
    "resource_type": "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
}


def get_base_url():
    return os.environ.get("PUBLIC_URL", "").rstrip("/")


# ─── Auth ────────────────────────────────────────────────────

async def verify_scim_token(authorization: Optional[str] = Header(None)):
    """Validate SCIM bearer token and return the associated org"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization format")

    token_value = parts[1]
    token_doc = await db.scim_tokens.find_one(
        {"token": token_value, "active": True}, {"_id": 0}
    )
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid or inactive SCIM token")

    return token_doc


# ─── Helpers ─────────────────────────────────────────────────

def user_to_scim(user: dict, base_url: str) -> dict:
    """Convert internal user doc to SCIM User resource with ALL Adrenalin fields"""
    given = user.get("first_name") or (user.get("name") or "").split(" ", 1)[0]
    family = user.get("last_name") or ((user.get("name") or "").split(" ", 1)[1] if " " in (user.get("name") or "") else "")

    # Build emails list
    emails = [{"value": user["email"], "type": "work", "primary": True}]
    if user.get("personal_email") and not user["personal_email"].endswith("@abc.com") and not user["personal_email"].endswith("@test.com"):
        emails.append({"value": user["personal_email"], "type": "home", "primary": False})

    # Build phone numbers
    phones = []
    if user.get("work_mobile"):
        phones.append({"value": user["work_mobile"], "type": "work"})
    if user.get("employee_mobile") and user.get("employee_mobile") != user.get("work_mobile"):
        phones.append({"value": user["employee_mobile"], "type": "mobile"})

    scim_user = {
        "schemas": [SCIM_SCHEMAS["user"], SCIM_SCHEMAS["enterprise_user"], SCIM_SCHEMAS["refex_user"]],
        "id": user["id"],
        "externalId": user.get("adrenalin_employee_id", user["id"]),
        "userName": user["email"],
        "name": {
            "formatted": user.get("name") or user.get("full_name") or "",
            "familyName": family,
            "givenName": given,
            "honorificPrefix": user.get("title", ""),
        },
        "displayName": user.get("name") or user.get("full_name") or "",
        "active": user.get("status", "active") == "active",
        "emails": emails,
        "phoneNumbers": phones,
        "title": user.get("designation", ""),
        "addresses": [{
            "type": "work",
            "postalCode": user.get("employee_pincode", ""),
            "locality": user.get("location", ""),
        }] if user.get("employee_pincode") or user.get("location") else [],

        # Enterprise User Extension (standard SCIM)
        SCIM_SCHEMAS["enterprise_user"]: {
            "employeeNumber": user.get("adrenalin_employee_id", ""),
            "department": user.get("department", ""),
            "organization": user.get("company", ""),
            "division": user.get("business_line", ""),
            "costCenter": user.get("department_code", ""),
            "manager": {
                "value": user.get("supervisor_employee_code", ""),
                "displayName": user.get("supervisor_name", ""),
                "$ref": "",
            } if user.get("supervisor_employee_code") else None,
        },

        # Refex Custom Extension (all Adrenalin-specific fields)
        SCIM_SCHEMAS["refex_user"]: {
            # Identity
            "sex": user.get("sex", ""),
            "dateOfBirth": user.get("date_of_birth", ""),
            "panNumber": user.get("pan_number", ""),

            # Organization details
            "departmentCode": user.get("department_code", ""),
            "grade": user.get("grade", ""),
            "legalEntityCode": user.get("legal_entity_code", ""),
            "businessLine": user.get("business_line", ""),
            "branchCode": user.get("branch_code", ""),
            "location": user.get("location", ""),
            "officeLocation": user.get("office_location", ""),

            # Employment status
            "employeeStatus": user.get("employee_status", ""),
            "employeeStatusDescription": user.get("employee_status_description", ""),
            "employmentStatus": str(user.get("employment_status", "")),
            "employmentStatusDescription": user.get("employment_status_description", ""),

            # Dates
            "joiningDate": user.get("joining_date", ""),
            "dateOfExit": user.get("date_of_exit", ""),
            "empAddedOn": user.get("emp_added_on", ""),

            # L1 Manager (Direct Supervisor)
            "supervisorEmployeeCode": user.get("supervisor_employee_code", ""),
            "supervisorEmail": user.get("supervisor_email", ""),
            "supervisorName": user.get("supervisor_name", ""),

            # L2 Manager (Supervisor's Supervisor)
            "l2ManagerEmployeeCode": user.get("l2_manager_employee_code", ""),
            "l2ManagerEmail": user.get("l2_manager_email", ""),
            "l2ManagerName": user.get("l2_manager_name", ""),
        },

        "meta": {
            "resourceType": "User",
            "created": user.get("created_at", ""),
            "lastModified": user.get("hr_synced_at", user.get("created_at", "")),
            "location": f"{base_url}/api/scim/v2/Users/{user['id']}",
        },
    }

    # Clean up null manager in enterprise extension
    if scim_user[SCIM_SCHEMAS["enterprise_user"]]["manager"] is None:
        del scim_user[SCIM_SCHEMAS["enterprise_user"]]["manager"]

    return scim_user


def group_to_scim(group: dict, members: list, base_url: str) -> dict:
    """Convert internal group doc to SCIM Group resource"""
    return {
        "schemas": [SCIM_SCHEMAS["group"]],
        "id": group["id"],
        "displayName": group["name"],
        "members": [
            {"value": m["id"], "display": m.get("name", m.get("email", "")),
             "$ref": f"{base_url}/api/scim/v2/Users/{m['id']}"}
            for m in members
        ],
        "meta": {
            "resourceType": "Group",
            "created": group.get("created_at", ""),
            "lastModified": group.get("updated_at", group.get("created_at", "")),
            "location": f"{base_url}/api/scim/v2/Groups/{group['id']}",
        },
    }


def scim_error(status: int, detail: str, scim_type: str = None):
    body = {
        "schemas": [SCIM_SCHEMAS["error"]],
        "detail": detail,
        "status": str(status),
    }
    if scim_type:
        body["scimType"] = scim_type
    raise HTTPException(status_code=status, detail=body)


def parse_scim_filter(filter_str: str) -> dict:
    """Parse simple SCIM filter like 'userName eq "john@example.com"' or 'userName eq 'john@example.com''"""
    if not filter_str:
        return {}
    # Support: attr eq "value" or attr eq 'value' (SCIM spec allows both quote styles)
    # Try double quotes first
    m = re.match(r'(\w+)\s+eq\s+"([^"]*)"', filter_str.strip())
    if not m:
        # Try single quotes
        m = re.match(r"(\w+)\s+eq\s+'([^']*)'", filter_str.strip())
    if m:
        attr, val = m.group(1), m.group(2)
        field_map = {"userName": "email", "displayName": "name", "externalId": "adrenalin_employee_id"}
        mongo_field = field_map.get(attr, attr)
        return {mongo_field: val}
    return {}


# ─── Discovery Endpoints ─────────────────────────────────────

@router.get("/ServiceProviderConfig")
async def service_provider_config():
    return {
        "schemas": [SCIM_SCHEMAS["sp_config"]],
        "documentationUri": "https://tools.ietf.org/html/rfc7644",
        "patch": {"supported": True},
        "bulk": {"supported": False, "maxOperations": 0, "maxPayloadSize": 0},
        "filter": {"supported": True, "maxResults": 200},
        "changePassword": {"supported": False},
        "sort": {"supported": False},
        "etag": {"supported": False},
        "authenticationSchemes": [
            {
                "name": "OAuth Bearer Token",
                "description": "Authentication using a bearer token",
                "specUri": "https://tools.ietf.org/html/rfc6750",
                "type": "oauthbearertoken",
                "primary": True,
            }
        ],
    }


@router.get("/Schemas")
async def get_schemas():
    base_url = get_base_url()
    return {
        "schemas": [SCIM_SCHEMAS["list"]],
        "totalResults": 3,
        "itemsPerPage": 3,
        "startIndex": 1,
        "Resources": [
            {
                "id": SCIM_SCHEMAS["user"],
                "name": "User",
                "description": "User Account",
                "attributes": [
                    {"name": "userName", "type": "string", "multiValued": False, "required": True, "mutability": "readWrite", "uniqueness": "server"},
                    {"name": "name", "type": "complex", "multiValued": False, "required": False, "mutability": "readWrite",
                     "subAttributes": [
                         {"name": "givenName", "type": "string", "mutability": "readWrite"},
                         {"name": "familyName", "type": "string", "mutability": "readWrite"},
                         {"name": "formatted", "type": "string", "mutability": "readWrite"},
                         {"name": "honorificPrefix", "type": "string", "mutability": "readWrite"},
                     ]},
                    {"name": "displayName", "type": "string", "multiValued": False, "required": False, "mutability": "readWrite"},
                    {"name": "emails", "type": "complex", "multiValued": True, "required": True, "mutability": "readWrite"},
                    {"name": "active", "type": "boolean", "multiValued": False, "required": False, "mutability": "readWrite"},
                    {"name": "phoneNumbers", "type": "complex", "multiValued": True, "required": False, "mutability": "readWrite"},
                    {"name": "title", "type": "string", "multiValued": False, "required": False, "mutability": "readWrite"},
                    {"name": "addresses", "type": "complex", "multiValued": True, "required": False, "mutability": "readWrite"},
                ],
                "meta": {"resourceType": "Schema", "location": f"{base_url}/api/scim/v2/Schemas/{SCIM_SCHEMAS['user']}"},
            },
            {
                "id": SCIM_SCHEMAS["refex_user"],
                "name": "Refex User Extension",
                "description": "Refex-specific employee fields from Adrenalin HRMS (includes L1/L2 managers)",
                "attributes": [
                    {"name": "sex", "type": "string", "mutability": "readWrite"},
                    {"name": "dateOfBirth", "type": "string", "mutability": "readWrite"},
                    {"name": "panNumber", "type": "string", "mutability": "readWrite"},
                    {"name": "departmentCode", "type": "string", "mutability": "readWrite"},
                    {"name": "grade", "type": "string", "mutability": "readWrite"},
                    {"name": "legalEntityCode", "type": "string", "mutability": "readWrite"},
                    {"name": "businessLine", "type": "string", "mutability": "readWrite"},
                    {"name": "branchCode", "type": "string", "mutability": "readWrite"},
                    {"name": "location", "type": "string", "mutability": "readWrite"},
                    {"name": "officeLocation", "type": "string", "mutability": "readWrite"},
                    {"name": "employeeStatus", "type": "string", "mutability": "readWrite"},
                    {"name": "employeeStatusDescription", "type": "string", "mutability": "readWrite"},
                    {"name": "employmentStatus", "type": "string", "mutability": "readWrite"},
                    {"name": "employmentStatusDescription", "type": "string", "mutability": "readWrite"},
                    {"name": "joiningDate", "type": "string", "mutability": "readWrite"},
                    {"name": "dateOfExit", "type": "string", "mutability": "readWrite"},
                    {"name": "empAddedOn", "type": "string", "mutability": "readWrite"},
                    {"name": "supervisorEmployeeCode", "type": "string", "mutability": "readWrite"},
                    {"name": "supervisorEmail", "type": "string", "mutability": "readWrite"},
                    {"name": "supervisorName", "type": "string", "mutability": "readWrite"},
                    {"name": "l2ManagerEmployeeCode", "type": "string", "mutability": "readWrite"},
                    {"name": "l2ManagerEmail", "type": "string", "mutability": "readWrite"},
                    {"name": "l2ManagerName", "type": "string", "mutability": "readWrite"},
                ],
                "meta": {"resourceType": "Schema", "location": f"{base_url}/api/scim/v2/Schemas/{SCIM_SCHEMAS['refex_user']}"},
            },
            {
                "id": SCIM_SCHEMAS["group"],
                "name": "Group",
                "description": "Group",
                "attributes": [
                    {"name": "displayName", "type": "string", "multiValued": False, "required": True, "mutability": "readWrite"},
                    {"name": "members", "type": "complex", "multiValued": True, "required": False, "mutability": "readWrite"},
                ],
                "meta": {"resourceType": "Schema", "location": f"{base_url}/api/scim/v2/Schemas/{SCIM_SCHEMAS['group']}"},
            },
        ],
    }


@router.get("/ResourceTypes")
async def get_resource_types():
    base_url = get_base_url()
    return {
        "schemas": [SCIM_SCHEMAS["list"]],
        "totalResults": 2,
        "itemsPerPage": 2,
        "startIndex": 1,
        "Resources": [
            {
                "schemas": [SCIM_SCHEMAS["resource_type"]],
                "id": "User",
                "name": "User",
                "endpoint": "/Users",
                "schema": SCIM_SCHEMAS["user"],
                "schemaExtensions": [
                    {"schema": SCIM_SCHEMAS["enterprise_user"], "required": False},
                    {"schema": SCIM_SCHEMAS["refex_user"], "required": False},
                ],
                "meta": {"resourceType": "ResourceType", "location": f"{base_url}/api/scim/v2/ResourceTypes/User"},
            },
            {
                "schemas": [SCIM_SCHEMAS["resource_type"]],
                "id": "Group",
                "name": "Group",
                "endpoint": "/Groups",
                "schema": SCIM_SCHEMAS["group"],
                "meta": {"resourceType": "ResourceType", "location": f"{base_url}/api/scim/v2/ResourceTypes/Group"},
            },
        ],
    }


# ─── Users ───────────────────────────────────────────────────

@router.get("/Users")
async def list_users(
    request: Request,
    filter: Optional[str] = None,
    startIndex: int = 1,
    count: int = 100,
    authorization: Optional[str] = Header(None),
):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()

    query = {"org_id": org_id}
    query.update(parse_scim_filter(filter))

    total = await db.users.count_documents(query)
    skip = max(0, startIndex - 1)
    users = await db.users.find(query, {"_id": 0, "password": 0}).skip(skip).limit(count).to_list(count)

    return {
        "schemas": [SCIM_SCHEMAS["list"]],
        "totalResults": total,
        "itemsPerPage": count,
        "startIndex": startIndex,
        "Resources": [user_to_scim(u, base_url) for u in users],
    }


@router.get("/Users/{user_id}")
async def get_user(user_id: str, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    base_url = get_base_url()

    user = await db.users.find_one(
        {"id": user_id, "org_id": token_doc["org_id"]}, {"_id": 0, "password": 0}
    )
    if not user:
        scim_error(404, "User not found")

    return user_to_scim(user, base_url)


@router.post("/Users", status_code=201)
async def create_user(request: Request, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()
    body = await request.json()

    username = body.get("userName", "")
    if not username:
        scim_error(400, "userName is required", "invalidValue")

    # Check if user already exists
    existing = await db.users.find_one({"email": username.lower(), "org_id": org_id})
    if existing:
        scim_error(409, "User already exists", "uniqueness")

    name_obj = body.get("name", {})
    given = name_obj.get("givenName", "")
    family = name_obj.get("familyName", "")
    full_name = body.get("displayName") or f"{given} {family}".strip() or username

    emails = body.get("emails", [])
    email = username.lower()
    for e in emails:
        if e.get("primary"):
            email = e.get("value", username).lower()
            break

    phones = body.get("phoneNumbers", [])
    mobile = phones[0].get("value", "") if phones else ""

    enterprise = body.get(SCIM_SCHEMAS["enterprise_user"], {})
    department = enterprise.get("department", "")
    company = enterprise.get("organization", "")
    emp_number = enterprise.get("employeeNumber", "")

    default_password = os.environ.get("DEFAULT_USER_PASSWORD", "Welcome@2026")
    password_hash = bcrypt.hashpw(default_password.encode(), bcrypt.gensalt()).decode()

    new_user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password": password_hash,
        "name": full_name,
        "full_name": full_name,
        "role": "user",
        "org_id": org_id,
        "status": "active" if body.get("active", True) else "disabled",
        "adrenalin_employee_id": body.get("externalId", emp_number),
        "department": department,
        "company": company,
        "mobile": mobile,
        "designation": body.get("title", ""),
        "group_ids": [],
        "role_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_via": "scim",
    }
    await db.users.insert_one(new_user)
    logger.info(f"SCIM: Created user {email}")

    result = await db.users.find_one({"id": new_user["id"]}, {"_id": 0, "password": 0})
    return user_to_scim(result, base_url)


@router.put("/Users/{user_id}")
async def replace_user(user_id: str, request: Request, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()
    body = await request.json()

    existing = await db.users.find_one({"id": user_id, "org_id": org_id}, {"_id": 0})
    if not existing:
        scim_error(404, "User not found")

    name_obj = body.get("name", {})
    given = name_obj.get("givenName", "")
    family = name_obj.get("familyName", "")
    full_name = body.get("displayName") or f"{given} {family}".strip()

    enterprise = body.get(SCIM_SCHEMAS["enterprise_user"], {})

    update = {
        "name": full_name or existing.get("name"),
        "full_name": full_name or existing.get("full_name"),
        "status": "active" if body.get("active", True) else "disabled",
        "designation": body.get("title", existing.get("designation", "")),
        "department": enterprise.get("department", existing.get("department", "")),
        "company": enterprise.get("organization", existing.get("company", "")),
        "hr_synced_at": datetime.now(timezone.utc).isoformat(),
    }

    phones = body.get("phoneNumbers", [])
    if phones:
        update["mobile"] = phones[0].get("value", "")

    if body.get("externalId"):
        update["adrenalin_employee_id"] = body["externalId"]

    # Handle deactivation
    if not body.get("active", True) and existing.get("status") != "disabled":
        update["disabled_at"] = datetime.now(timezone.utc).isoformat()
        update["disabled_reason"] = "Deactivated via SCIM"

    await db.users.update_one({"id": user_id}, {"$set": update})
    logger.info(f"SCIM: Updated user {user_id}")

    result = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return user_to_scim(result, base_url)


@router.patch("/Users/{user_id}")
async def patch_user(user_id: str, request: Request, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()
    body = await request.json()

    existing = await db.users.find_one({"id": user_id, "org_id": org_id}, {"_id": 0})
    if not existing:
        scim_error(404, "User not found")

    update = {}
    for op in body.get("Operations", []):
        operation = op.get("op", "").lower()
        path = op.get("path", "")
        value = op.get("value")

        if path == "active" or (not path and isinstance(value, dict) and "active" in value):
            active = value if isinstance(value, bool) else value.get("active", True)
            update["status"] = "active" if active else "disabled"
            if not active and existing.get("status") != "disabled":
                update["disabled_at"] = datetime.now(timezone.utc).isoformat()
                update["disabled_reason"] = "Deactivated via SCIM"

        elif path == "displayName" or path == "name.formatted":
            update["name"] = value
            update["full_name"] = value

        elif path == "name.givenName":
            family = existing.get("name", "").split(" ", 1)
            family = family[1] if len(family) > 1 else ""
            update["name"] = f"{value} {family}".strip()

        elif path == "name.familyName":
            given = existing.get("name", "").split(" ", 1)[0]
            update["name"] = f"{given} {value}".strip()

        elif path == "title":
            update["designation"] = value

        elif path == f'{SCIM_SCHEMAS["enterprise_user"]}:department':
            update["department"] = value

    if update:
        update["hr_synced_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": user_id}, {"$set": update})
        logger.info(f"SCIM: Patched user {user_id}: {list(update.keys())}")

    result = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    return user_to_scim(result, base_url)


@router.delete("/Users/{user_id}", status_code=204)
async def delete_user(user_id: str, authorization: Optional[str] = Header(None)):
    """SCIM DELETE = deactivate (not hard delete, preserves access records)"""
    token_doc = await verify_scim_token(authorization)

    existing = await db.users.find_one({"id": user_id, "org_id": token_doc["org_id"]})
    if not existing:
        scim_error(404, "User not found")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "status": "disabled",
            "disabled_at": datetime.now(timezone.utc).isoformat(),
            "disabled_reason": "Deleted via SCIM",
        }}
    )
    logger.info(f"SCIM: Deactivated user {user_id}")
    return None


# ─── Groups ──────────────────────────────────────────────────

@router.get("/Groups")
async def list_groups(
    request: Request,
    filter: Optional[str] = None,
    startIndex: int = 1,
    count: int = 100,
    authorization: Optional[str] = Header(None),
):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()

    query = {"org_id": org_id}
    if filter:
        m = re.match(r'displayName\s+eq\s+"([^"]*)"', filter.strip())
        if m:
            query["name"] = m.group(1)

    total = await db.groups.count_documents(query)
    skip = max(0, startIndex - 1)
    groups = await db.groups.find(query, {"_id": 0}).skip(skip).limit(count).to_list(count)

    resources = []
    for g in groups:
        member_ids = g.get("member_ids", [])
        members = []
        if member_ids:
            members = await db.users.find(
                {"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}
            ).to_list(500)
        resources.append(group_to_scim(g, members, base_url))

    return {
        "schemas": [SCIM_SCHEMAS["list"]],
        "totalResults": total,
        "itemsPerPage": count,
        "startIndex": startIndex,
        "Resources": resources,
    }


@router.get("/Groups/{group_id}")
async def get_group(group_id: str, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    base_url = get_base_url()

    group = await db.groups.find_one(
        {"id": group_id, "org_id": token_doc["org_id"]}, {"_id": 0}
    )
    if not group:
        scim_error(404, "Group not found")

    member_ids = group.get("member_ids", [])
    members = []
    if member_ids:
        members = await db.users.find(
            {"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}
        ).to_list(500)

    return group_to_scim(group, members, base_url)


@router.post("/Groups", status_code=201)
async def create_group(request: Request, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()
    body = await request.json()

    display_name = body.get("displayName", "")
    if not display_name:
        scim_error(400, "displayName is required")

    group_id = str(uuid.uuid4())
    member_ids = [m["value"] for m in body.get("members", []) if m.get("value")]

    new_group = {
        "id": group_id,
        "name": display_name,
        "description": f"Created via SCIM",
        "org_id": org_id,
        "member_ids": member_ids,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.groups.insert_one(new_group)

    # Update users' group_ids
    if member_ids:
        await db.users.update_many(
            {"id": {"$in": member_ids}},
            {"$addToSet": {"group_ids": group_id}}
        )

    logger.info(f"SCIM: Created group {display_name} ({group_id})")
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    members = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500) if member_ids else []
    return group_to_scim(group, members, base_url)


@router.patch("/Groups/{group_id}")
async def patch_group(group_id: str, request: Request, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)
    org_id = token_doc["org_id"]
    base_url = get_base_url()
    body = await request.json()

    group = await db.groups.find_one({"id": group_id, "org_id": org_id}, {"_id": 0})
    if not group:
        scim_error(404, "Group not found")

    for op in body.get("Operations", []):
        operation = op.get("op", "").lower()
        path = op.get("path", "")
        value = op.get("value")

        if path == "displayName" and operation == "replace":
            await db.groups.update_one({"id": group_id}, {"$set": {"name": value}})

        elif "members" in (path or ""):
            if operation == "add":
                member_vals = value if isinstance(value, list) else [value]
                new_ids = [m.get("value") for m in member_vals if m.get("value")]
                if new_ids:
                    await db.groups.update_one({"id": group_id}, {"$addToSet": {"member_ids": {"$each": new_ids}}})
                    await db.users.update_many({"id": {"$in": new_ids}}, {"$addToSet": {"group_ids": group_id}})

            elif operation == "remove":
                if path and "value eq" in path:
                    m = re.search(r'value eq "([^"]*)"', path)
                    if m:
                        uid = m.group(1)
                        await db.groups.update_one({"id": group_id}, {"$pull": {"member_ids": uid}})
                        await db.users.update_one({"id": uid}, {"$pull": {"group_ids": group_id}})

    await db.groups.update_one({"id": group_id}, {"$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    logger.info(f"SCIM: Patched group {group_id}")

    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    member_ids = group.get("member_ids", [])
    members = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500) if member_ids else []
    return group_to_scim(group, members, base_url)


@router.delete("/Groups/{group_id}", status_code=204)
async def delete_group(group_id: str, authorization: Optional[str] = Header(None)):
    token_doc = await verify_scim_token(authorization)

    group = await db.groups.find_one({"id": group_id, "org_id": token_doc["org_id"]})
    if not group:
        scim_error(404, "Group not found")

    # Remove group from all users
    await db.users.update_many(
        {"group_ids": group_id},
        {"$pull": {"group_ids": group_id}}
    )
    await db.groups.delete_one({"id": group_id})
    logger.info(f"SCIM: Deleted group {group_id}")
    return None
