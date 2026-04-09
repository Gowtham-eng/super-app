import os
import uuid
import logging
import httpx
import bcrypt
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

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

            # Data is [[emp1, emp2, ...]] - list inside a list
            employees = data["Data"][0] if isinstance(data["Data"][0], list) else data["Data"]
            if not employees:
                break

            all_employees.extend(employees)

            if len(employees) < page_size:
                break
            page += 1

    return all_employees


async def sync_employees(db, org_id: str) -> dict:
    """
    Sync employees from Adrenalin HR to IAM system.
    - New employees → create user with default password
    - Exited employees → disable user (keep existing app access)
    - Existing active employees → skip (don't modify)
    """
    result = {"created": 0, "disabled": 0, "skipped": 0, "total": 0, "errors": []}

    try:
        token = await get_adrenalin_token()
        employees = await fetch_all_employees(token)
        result["total"] = len(employees)
        logger.info(f"Fetched {len(employees)} employees from Adrenalin")
    except Exception as e:
        result["errors"].append(f"Failed to fetch employees: {str(e)}")
        return result

    password_hash = bcrypt.hashpw(_get_config()["default_password"].encode(), bcrypt.gensalt()).decode()

    for emp in employees:
        try:
            email = (emp.get("EMAIL_ADDRESS") or "").strip().lower()
            if not email or email.endswith("@abc.com"):
                continue

            emp_id = emp.get("EMPLOYEE_ID", "")
            first_name = emp.get("FIRST_NAME", "").strip()
            last_name = emp.get("LAST_NAME", "").strip()
            full_name = f"{first_name} {last_name}".strip()
            mobile = emp.get("REFEX_WORK_MOBILE_NUMBER") or emp.get("EMPLOYEE_MOBILE_NUMBER") or ""
            department = emp.get("DEPARTMENT_NAME", "")
            company = emp.get("REFEX_COMPANY_NAME", "")
            status = emp.get("EMPLOYMENT_STATUS_DESCRIPTION", "").lower()
            date_of_exit = emp.get("DATE_OF_EXIT", "").strip()

            existing_user = await db.users.find_one({"email": email, "org_id": org_id})

            if existing_user:
                # Employee exists in our system
                is_exited = status != "active" or bool(date_of_exit)

                if is_exited and existing_user.get("status") != "disabled":
                    # Disable user but keep their app access
                    await db.users.update_one(
                        {"id": existing_user["id"]},
                        {"$set": {
                            "status": "disabled",
                            "disabled_at": datetime.now(timezone.utc).isoformat(),
                            "disabled_reason": "Employee exited (Adrenalin sync)",
                            "adrenalin_employee_id": emp_id,
                        }}
                    )
                    result["disabled"] += 1
                    logger.info(f"Disabled user: {email} (exited)")
                else:
                    # Update HR fields if changed
                    await db.users.update_one(
                        {"id": existing_user["id"]},
                        {"$set": {
                            "adrenalin_employee_id": emp_id,
                            "department": department,
                            "company": company,
                            "mobile": mobile,
                            "hr_synced_at": datetime.now(timezone.utc).isoformat(),
                        }}
                    )
                    result["skipped"] += 1
            else:
                # New employee - only create if active
                is_active = status == "active" and not date_of_exit

                if is_active:
                    new_user = {
                        "id": str(uuid.uuid4()),
                        "email": email,
                        "password": password_hash,
                        "name": full_name,
                        "full_name": full_name,
                        "role": "user",
                        "org_id": org_id,
                        "status": "active",
                        "adrenalin_employee_id": emp_id,
                        "department": department,
                        "company": company,
                        "mobile": mobile,
                        "group_ids": [],
                        "role_ids": [],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "created_via": "adrenalin_sync",
                        "hr_synced_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await db.users.insert_one(new_user)
                    result["created"] += 1
                    logger.info(f"Created user: {email} ({full_name})")

        except Exception as e:
            err_msg = f"Error processing {emp.get('EMAIL_ADDRESS', 'unknown')}: {str(e)}"
            result["errors"].append(err_msg)
            logger.error(err_msg)

    return result
