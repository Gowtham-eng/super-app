#!/usr/bin/env python3
"""
Configure Notification Engine embed dashboards as Refex One OIDC apps (Mongo only).

Does NOT modify server.py, AppLauncher, or SAML/Kissflow apps.

Usage (on a machine with production Mongo access):
  cd backend
  source .venv/bin/activate
  export MONGO_URL='mongodb://...'
  export DB_NAME='superapp_db'
  python ../scripts/configure_ne_reports_oidc.py --dry-run
  python ../scripts/configure_ne_reports_oidc.py --apply
  python ../scripts/configure_ne_reports_oidc.py --apply --return-to local
  python ../scripts/configure_ne_reports_oidc.py --apply --assign-emails dinesh@refex.co.in,ceo@refex.co.in

Admin UI alternative: see scripts/NE_REPORTS_OIDC_SETUP.md
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

try:
    from pymongo import MongoClient
except ImportError:
    print("Install pymongo in backend venv: pip install pymongo", file=sys.stderr)
    sys.exit(1)

NE_BASE = "https://refex-admin-ui-dhwffeu7pq-el.a.run.app"
REDIRECT_URI = "https://refexone.com/callback"

RETURN_TO = {
    "prod": "https://refexone.com/launcher",
    "local": "http://localhost:3000/launcher",
}

CONSOLIDATED = {
    "name": "Consolidated Usage Report",
    "description": "All Kissflow applications — executive KPI overview",
    "category": "Reports",
    "sort_order": 1,
    "restricted": True,
    "home_path": "/dashboard?embed=1",
}

PER_APP = [
    ("IT Service Management", "production-IT_Service_Management_A00"),
    ("Project Management and Task Managment", "production-Project_Management_Tracker_A00"),
    ("Procurement to Pay", "production-Procurement_to_Pay_A00"),
    ("Travel Management", "production-Expense_and_Travel_Management_A00"),
    ("Solar Expense Hub", "production-Solar_Site_Expense_Governance_Syst_A00"),
    ("Lead Tracker", "production-Lead_Trcaker_A00"),
    ("Expense Management", "production-EMS_001_A00"),
]


def home_url(app_slug: str | None, return_to: str) -> str:
    rt = quote(return_to, safe="")
    if app_slug:
        return (
            f"{NE_BASE}/applications/{app_slug}"
            f"?tab=dashboard&embed=1&return_to={rt}"
        )
    return f"{NE_BASE}/dashboard?embed=1&return_to={rt}"


def load_env() -> tuple[str, str]:
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "superapp_db")
    env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
    if os.path.isfile(env_path):
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip('"').strip("'")
                if key == "MONGO_URL" and mongo_url == "mongodb://localhost:27017":
                    mongo_url = val
                elif key == "DB_NAME" and db_name == "superapp_db":
                    db_name = val
    return mongo_url, db_name


def resolve_org_id(db, org_id: str | None) -> str:
    if org_id:
        return org_id
    org = db.organizations.find_one({}, {"_id": 0, "id": 1})
    if org and org.get("id"):
        return org["id"]
    user = db.users.find_one({"org_id": {"$exists": True, "$ne": ""}}, {"_id": 0, "org_id": 1})
    if user and user.get("org_id"):
        return user["org_id"]
    raise SystemExit("Could not resolve org_id — pass --org-id")


def new_oidc_doc(org_id: str, name: str, description: str, category: str, sort_order: int,
                 restricted: bool, url: str) -> dict:
    app_id = str(uuid.uuid4())
    client_id = f"oidc_{uuid.uuid4().hex[:16]}"
    client_secret = uuid.uuid4().hex + uuid.uuid4().hex
    base = "https://refexone.com"
    return {
        "id": app_id,
        "name": name,
        "description": description,
        "org_id": org_id,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": [REDIRECT_URI],
        "logout_uris": [],
        "scopes": ["openid", "profile", "email"],
        "grant_types": ["authorization_code"],
        "authorization_endpoint": f"{base}/api/oidc/{app_id}/authorize",
        "token_endpoint": f"{base}/api/oidc/{app_id}/token",
        "userinfo_endpoint": f"{base}/api/oidc/userinfo",
        "discovery_endpoint": f"{base}/api/apps/oidc/{app_id}/.well-known/openid-configuration",
        "logo_url": "",
        "home_url": url,
        "allowed_group_ids": [],
        "allowed_role_ids": [],
        "approved_user_ids": [],
        "category": category,
        "sort_order": sort_order,
        "is_placeholder": False,
        "restricted": restricted,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def assign_users(db, org_id: str, app_ids: list[str], emails: list[str]) -> None:
    user_ids = []
    for email in emails:
        doc = db.users.find_one(
            {"org_id": org_id, "email": {"$regex": f"^{email}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if doc:
            user_ids.append(doc["id"])
        else:
            print(f"  WARN: user not found for email {email}")
    if not user_ids:
        return
    for app_id in app_ids:
        db.oidc_apps.update_one(
            {"id": app_id, "org_id": org_id},
            {"$addToSet": {"approved_user_ids": {"$each": user_ids}}},
        )


def disable_bad_saml_itsm(db, org_id: str, dry_run: bool) -> None:
    query = {
        "org_id": org_id,
        "name": {"$regex": "^ITSM$", "$options": "i"},
        "$or": [
            {"acs_url": {"$regex": "refex-admin-ui", "$options": "i"}},
            {"home_url": {"$regex": "refex-admin-ui", "$options": "i"}},
        ],
    }
    for doc in db.saml_apps.find(query, {"_id": 0, "id": 1, "name": 1, "acs_url": 1}):
        print(f"  SAML cleanup: disable mistaken {doc.get('name')} ({doc.get('id')})")
        if not dry_run:
            db.saml_apps.update_one(
                {"id": doc["id"]},
                {"$set": {"status": "inactive", "show_in_launcher": False}},
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Configure NE Reports OIDC apps in MongoDB")
    parser.add_argument("--apply", action="store_true", help="Write changes (default is dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--org-id", default="", help="Organization id (default: first org in DB)")
    parser.add_argument(
        "--return-to",
        choices=("prod", "local"),
        default="prod",
        help="return_to launcher URL (prod=refexone.com, local=localhost:3000)",
    )
    parser.add_argument(
        "--assign-emails",
        default="",
        help="Comma-separated Refex One user emails for approved_user_ids (display/audit)",
    )
    parser.add_argument("--skip-saml-cleanup", action="store_true")
    args = parser.parse_args()
    dry_run = not args.apply or args.dry_run
    if args.apply and args.dry_run:
        dry_run = True

    mongo_url, db_name = load_env()
    client = MongoClient(mongo_url)
    db = client[db_name]
    org_id = resolve_org_id(db, args.org_id or None)
    rt = RETURN_TO[args.return_to]
    print(f"Org: {org_id}  return_to: {rt}  mode: {'DRY-RUN' if dry_run else 'APPLY'}")

    touched_ids: list[str] = []

    # Task 1 — consolidated
    consolidated_url = home_url(None, rt)
    existing = db.oidc_apps.find_one(
        {
            "org_id": org_id,
            "$or": [
                {"name": CONSOLIDATED["name"]},
                {"name": "Engagement Reports (All)"},
                {
                    "home_url": {"$regex": r"/dashboard\?.*embed=1", "$options": "i"},
                    "category": "Reports",
                },
            ],
        },
        {"_id": 0, "id": 1, "home_url": 1, "name": 1},
    )
    if existing:
        print(f"UPDATE consolidated: {CONSOLIDATED['name']}")
        print(f"  home_url -> {consolidated_url}")
        touched_ids.append(existing["id"])
        if not dry_run:
            db.oidc_apps.update_one(
                {"id": existing["id"]},
                {
                    "$set": {
                        "name": CONSOLIDATED["name"],
                        "home_url": consolidated_url,
                        "description": CONSOLIDATED["description"],
                        "category": CONSOLIDATED["category"],
                        "sort_order": CONSOLIDATED["sort_order"],
                        "restricted": CONSOLIDATED["restricted"],
                        "status": "active",
                    }
                },
            )
    else:
        doc = new_oidc_doc(
            org_id,
            CONSOLIDATED["name"],
            CONSOLIDATED["description"],
            CONSOLIDATED["category"],
            CONSOLIDATED["sort_order"],
            CONSOLIDATED["restricted"],
            consolidated_url,
        )
        print(f"CREATE consolidated: {CONSOLIDATED['name']}")
        print(f"  home_url -> {consolidated_url}")
        touched_ids.append(doc["id"])
        if not dry_run:
            db.oidc_apps.insert_one(doc)

    # Task 2 — per-app return_to
    for name, slug in PER_APP:
        url = home_url(slug, rt)
        app = db.oidc_apps.find_one(
            {"org_id": org_id, "name": name, "category": "Reports"},
            {"_id": 0, "id": 1, "home_url": 1},
        )
        if not app:
            app = db.oidc_apps.find_one(
                {"org_id": org_id, "name": {"$regex": f"^{name}$", "$options": "i"}},
                {"_id": 0, "id": 1, "home_url": 1, "name": 1},
            )
        if not app:
            print(f"MISSING OIDC app (create in /apps/oidc): {name}")
            continue
        print(f"UPDATE {app.get('name', name)}")
        print(f"  home_url -> {url}")
        touched_ids.append(app["id"])
        if not dry_run:
            db.oidc_apps.update_one({"id": app["id"]}, {"$set": {"home_url": url}})

    # Task 3 — assign users
    emails = [e.strip() for e in args.assign_emails.split(",") if e.strip()]
    if emails:
        print(f"Assign users: {', '.join(emails)}")
        if not dry_run:
            assign_users(db, org_id, touched_ids, emails)

    # Task 4 — optional SAML cleanup
    if not args.skip_saml_cleanup:
        disable_bad_saml_itsm(db, org_id, dry_run)

    print("\nVerification (Task 5): Launcher → Reports & Analytics should show 8 tiles.")
    print("  1. Consolidated Usage Report")
    for name, _ in PER_APP:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
