"""
Adrenalin HRMS Sync Service
Syncs ALL employee fields from Adrenalin API + resolves L1/L2 Manager emails.
After sync, pushes created/updated users to Kissflow via SCIM.
"""
import os
import uuid
import logging
import httpx
import bcrypt
from datetime import datetime, timezone
from services.kissflow_scim_client import sync_to_kissflow

logger = logging.getLogger(__name__)


def _get_config():
    return {
        "base_url": os.environ.get("ADRENALIN_BASE_URL", ""),
        "username": os.environ.get("ADRENALIN_USERNAME", ""),
        "password": os.environ.get("ADRENALIN_PASSWORD", ""),
        "company_id": os.environ.get("ADRENALIN_COMPANY_ID", ""),
        "default_password": os.environ.get("DEFAULT_USER_PASSWORD", "Welcome@2026"),
    }


async def get_adrenalin_token() -> str:
    """Authenticate with Adrenalin and return bearer token"""
    cfg = _get_config()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{cfg['base_url']}/Authorization/UserLogin",
            json={"UserName": cfg["username"], "Password": cfg["password"], "CompanyId": cfg["company_id"]},
        )
        data = resp.json()
        if data.get("IsValid") and data.get("Data"):
            return data["Data"][0]
        raise Exception(f"Adrenalin auth failed: {data.get('ErrorMessage', 'Unknown error')}")


async def fetch_all_employees(token: str) -> list:
    """Fetch all employees from Adrenalin with pagination"""
    cfg = _get_config()
    all_employees = []
    page = 1
    page_size = 100

    async with httpx.AsyncClient(timeout=60) as client:
        while True:
            resp = await client.post(
                f"{cfg['base_url']}/Employee/GetEmployeeDetails",
                json={"PAGE_NUMBER": page, "PAGE_SIZE": page_size},
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            data = resp.json()
            if not data.get("IsValid") or not data.get("Data"):
                break

            employees = data["Data"][0] if isinstance(data["Data"][0], list) else data["Data"]
            if not employees:
                break

            all_employees.extend(employees)

            if len(employees) < page_size:
                break
            page += 1

    return all_employees


def _build_emp_lookup(employees: list) -> dict:
    """Build EMPLOYEE_ID -> employee dict lookup for supervisor resolution"""
    lookup = {}
    for emp in employees:
        eid = (emp.get("EMPLOYEE_ID") or "").strip()
        if eid:
            lookup[eid] = emp
    return lookup


def _resolve_manager(emp_code: str, lookup: dict) -> dict:
    """Resolve supervisor employee code to get their email and name"""
    if not emp_code or emp_code not in lookup:
        return {"email": "", "name": "", "employee_id": emp_code or ""}
    mgr = lookup[emp_code]
    email = (mgr.get("EMAIL_ADDRESS") or "").strip().lower()
    first = (mgr.get("FIRST_NAME") or "").strip()
    last = (mgr.get("LAST_NAME") or "").strip()
    return {
        "email": email if not email.endswith("@abc.com") else "",
        "name": f"{first} {last}".strip(),
        "employee_id": emp_code,
    }


def _extract_all_hr_fields(emp: dict, lookup: dict) -> dict:
    """Extract ALL Adrenalin fields + resolve L1 and L2 managers"""
    # L1 Manager (direct supervisor)
    l1_code = (emp.get("SUPERVISOR_EMPLOYEE_CODE") or "").strip()
    l1 = _resolve_manager(l1_code, lookup)

    # L2 Manager (supervisor's supervisor)
    l2 = {"email": "", "name": "", "employee_id": ""}
    if l1_code and l1_code in lookup:
        l2_code = (lookup[l1_code].get("SUPERVISOR_EMPLOYEE_CODE") or "").strip()
        l2 = _resolve_manager(l2_code, lookup)

    return {
        # Core identity
        "adrenalin_employee_id": (emp.get("EMPLOYEE_ID") or "").strip(),
        "title": (emp.get("TITLE") or "").strip(),
        "first_name": (emp.get("FIRST_NAME") or "").strip(),
        "last_name": (emp.get("LAST_NAME") or "").strip(),
        "sex": (emp.get("SEX") or "").strip(),
        "date_of_birth": (emp.get("DATE_OF_BIRTH") or "").strip(),
        "pan_number": (emp.get("PAN_NUMBER") or "").strip(),

        # Contact
        "email": (emp.get("EMAIL_ADDRESS") or "").strip().lower(),
        "personal_email": (emp.get("PERSONAL_EMAIL_ID") or "").strip().lower(),
        "mobile": (emp.get("REFEX_WORK_MOBILE_NUMBER") or emp.get("EMPLOYEE_MOBILE_NUMBER") or "").strip(),
        "employee_mobile": (emp.get("EMPLOYEE_MOBILE_NUMBER") or "").strip(),
        "work_mobile": (emp.get("REFEX_WORK_MOBILE_NUMBER") or "").strip(),
        "employee_pincode": (emp.get("EMPLOYEE_PINCODE") or "").strip(),

        # Organization
        "department": (emp.get("DEPARTMENT_NAME") or "").strip(),
        "department_code": (emp.get("DEPARTMENT_CODE") or "").strip(),
        "designation": (emp.get("DESIGNATION") or "").strip(),
        "grade": (emp.get("GRADE_NAME") or "").strip(),
        "company": (emp.get("REFEX_COMPANY_NAME") or "").strip(),
        "legal_entity_code": (emp.get("LEGAL_ENTITY_CODE") or "").strip(),
        "business_line": (emp.get("BUSINESS_LINE") or "").strip(),
        "branch_code": (emp.get("BRANCH_CODE") or "").strip(),
        "location": (emp.get("REFEX_LOCATION") or "").strip(),
        "office_location": (emp.get("OFFICE_LOCATION") or "").strip(),

        # Employment status
        "employee_status": (emp.get("EMPLOYEE_STATUS") or "").strip(),
        "employee_status_description": (emp.get("EMPLOYEE_STATUS_DESCRIPTION") or "").strip(),
        "employment_status": (emp.get("EMPLOYMENT_STATUS") or ""),
        "employment_status_description": (emp.get("EMPLOYMENT_STATUS_DESCRIPTION") or "").strip(),

        # Dates
        "joining_date": (emp.get("JOINING_DATE") or "").strip(),
        "date_of_exit": (emp.get("DATE_OF_EXIT") or "").strip(),
        "emp_added_on": (emp.get("EMP_ADDED_ON") or "").strip(),

        # L1 Manager (direct supervisor)
        "supervisor_employee_code": l1_code,
        "supervisor_email": l1["email"],
        "supervisor_name": l1["name"],

        # L2 Manager (supervisor's supervisor)
        "l2_manager_employee_code": l2["employee_id"],
        "l2_manager_email": l2["email"],
        "l2_manager_name": l2["name"],
    }


async def sync_employees(db, org_id: str) -> dict:
    """
    Sync ALL employee fields from Adrenalin HR to IAM system.
    - New employees -> create user with default password
    - Exited employees -> disable user (keep existing app access)
    - Existing employees -> update ALL HR fields
    - Resolves L1 Manager (supervisor) and L2 Manager (supervisor's supervisor) emails
    """
    result = {"created": 0, "disabled": 0, "updated": 0, "skipped": 0, "total": 0, "errors": []}

    try:
        token = await get_adrenalin_token()
        employees = await fetch_all_employees(token)
        result["total"] = len(employees)
        logger.info(f"Fetched {len(employees)} employees from Adrenalin")
    except Exception as e:
        result["errors"].append(f"Failed to fetch employees: {str(e)}")
        return result

    # Build lookup for supervisor resolution
    lookup = _build_emp_lookup(employees)
    logger.info(f"Built employee lookup with {len(lookup)} entries for manager resolution")

    password_hash = bcrypt.hashpw(_get_config()["default_password"].encode(), bcrypt.gensalt()).decode()

    for emp in employees:
        try:
            hr = _extract_all_hr_fields(emp, lookup)
            email = hr["email"]

            if not email or email.endswith("@abc.com"):
                continue

            full_name = f"{hr['first_name']} {hr['last_name']}".strip()
            status_desc = hr["employment_status_description"].lower()
            date_of_exit = hr["date_of_exit"]

            existing_user = await db.users.find_one({"email": email, "org_id": org_id})

            # Common HR fields to store on every user
            hr_update = {
                "adrenalin_employee_id": hr["adrenalin_employee_id"],
                "title": hr["title"],
                "first_name": hr["first_name"],
                "last_name": hr["last_name"],
                "name": full_name,
                "full_name": full_name,
                "sex": hr["sex"],
                "date_of_birth": hr["date_of_birth"],
                "pan_number": hr["pan_number"],
                "personal_email": hr["personal_email"],
                "mobile": hr["mobile"],
                "employee_mobile": hr["employee_mobile"],
                "work_mobile": hr["work_mobile"],
                "employee_pincode": hr["employee_pincode"],
                "department": hr["department"],
                "department_code": hr["department_code"],
                "designation": hr["designation"],
                "grade": hr["grade"],
                "company": hr["company"],
                "legal_entity_code": hr["legal_entity_code"],
                "business_line": hr["business_line"],
                "branch_code": hr["branch_code"],
                "location": hr["location"],
                "office_location": hr["office_location"],
                "employee_status": hr["employee_status"],
                "employee_status_description": hr["employee_status_description"],
                "employment_status": hr["employment_status"],
                "employment_status_description": hr["employment_status_description"],
                "joining_date": hr["joining_date"],
                "date_of_exit": hr["date_of_exit"],
                "emp_added_on": hr["emp_added_on"],
                "supervisor_employee_code": hr["supervisor_employee_code"],
                "supervisor_email": hr["supervisor_email"],
                "supervisor_name": hr["supervisor_name"],
                "l2_manager_employee_code": hr["l2_manager_employee_code"],
                "l2_manager_email": hr["l2_manager_email"],
                "l2_manager_name": hr["l2_manager_name"],
                "hr_synced_at": datetime.now(timezone.utc).isoformat(),
            }

            if existing_user:
                is_exited = status_desc != "active" or bool(date_of_exit)

                if is_exited and existing_user.get("status") != "disabled":
                    hr_update["status"] = "disabled"
                    hr_update["disabled_at"] = datetime.now(timezone.utc).isoformat()
                    hr_update["disabled_reason"] = "Employee exited (Adrenalin sync)"
                    await db.users.update_one({"id": existing_user["id"]}, {"$set": hr_update})
                    result["disabled"] += 1
                    logger.info(f"Disabled user: {email} (exited)")
                else:
                    await db.users.update_one({"id": existing_user["id"]}, {"$set": hr_update})
                    result["updated"] += 1
            else:
                is_active = status_desc == "active" and not date_of_exit
                if is_active:
                    new_user = {
                        "id": str(uuid.uuid4()),
                        "email": email,
                        "password": password_hash,
                        "role": "user",
                        "org_id": org_id,
                        "status": "active",
                        "group_ids": [],
                        "role_ids": [],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_via": "adrenalin_sync",
                        **hr_update,
                    }
                    await db.users.insert_one(new_user)
                    result["created"] += 1
                    logger.info(f"Created user: {email} ({full_name})")

        except Exception as e:
            err_msg = f"Error processing {emp.get('EMAIL_ADDRESS', 'unknown')}: {str(e)}"
            result["errors"].append(err_msg)
            logger.error(err_msg)

    # After HR sync, push created/updated users to Kissflow
    kissflow_result = None
    try:
        if result["created"] > 0 or result["updated"] > 0 or result["disabled"] > 0:
            logger.info(f"Triggering Kissflow SCIM push after HR sync ({result['created']} created, {result['updated']} updated, {result['disabled']} disabled)")
            kissflow_result = await sync_to_kissflow(db, org_id)
            result["kissflow_sync"] = kissflow_result
            logger.info(f"Kissflow push result: created={kissflow_result.get('created', 0)}, updated={kissflow_result.get('updated', 0)}, errors={len(kissflow_result.get('errors', []))}")
        else:
            result["kissflow_sync"] = {"skipped": True, "reason": "No changes from HR sync"}
    except Exception as e:
        err_msg = f"Kissflow SCIM push failed: {str(e)}"
        result["kissflow_sync"] = {"error": err_msg}
        logger.error(err_msg)

    return result
