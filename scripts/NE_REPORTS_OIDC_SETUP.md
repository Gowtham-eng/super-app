# Notification Engine — Reports OIDC setup (config only)

Wire **Reports & Analytics** on Refex One launcher to Notification Engine embed dashboards.  
No code changes to `server.py`, `AppLauncher.js`, or Kissflow SAML apps.

## Dev frontend → live backend

`frontend/.env.local`:

```env
REACT_APP_BACKEND_URL=https://refexone.com
REACT_APP_BACKEND_ORIGIN=https://refexone.com
REACT_APP_PROXY_TARGET=https://refexone.com
REACT_APP_ITSM_PROXY_TARGET=https://refexone.com
```

```bash
cd frontend && npm install && npm start
```

Open http://localhost:3000 — API uses live https://refexone.com (do not run local backend).

---

## Option A — Admin UI (`/apps/oidc`)

### Task 1 — Create consolidated OIDC app

| Field | Value |
|-------|-------|
| Name | Consolidated Usage Report |
| Description | All Kissflow applications — executive KPI overview |
| Category | Reports |
| Sort order | 1 |
| Home URL | `https://refex-admin-ui-dhwffeu7pq-el.a.run.app/dashboard?embed=1&return_to=https%3A%2F%2Frefexone.com%2Flauncher` |
| Redirect URIs | `https://refexone.com/callback` |
| Restricted | Yes |

Local testing Home URL — use `return_to=http%3A%2F%2Flocalhost%3A3000%2Flauncher` instead.

### Task 2 — Update 7 existing Reports OIDC apps

Add `&return_to=https%3A%2F%2Frefexone.com%2Flauncher` to **Home URL** only.

| App name | Home URL |
|----------|----------|
| IT Service Management | `…/applications/production-IT_Service_Management_A00?tab=dashboard&embed=1&return_to=https%3A%2F%2Frefexone.com%2Flauncher` |
| Project Management and Task Managment | `…/production-Project_Management_Tracker_A00?tab=dashboard&embed=1&return_to=…` |
| Procurement to Pay | `…/production-Procurement_to_Pay_A00?tab=dashboard&embed=1&return_to=…` |
| Travel Management | `…/production-Expense_and_Travel_Management_A00?tab=dashboard&embed=1&return_to=…` |
| Solar Expense Hub | `…/production-Solar_Site_Expense_Governance_Syst_A00?tab=dashboard&embed=1&return_to=…` |
| Lead Tracker | `…/production-Lead_Trcaker_A00?tab=dashboard&embed=1&return_to=…` |
| Expense Management | `…/production-EMS_001_A00?tab=dashboard&embed=1&return_to=…` |

Base: `https://refex-admin-ui-dhwffeu7pq-el.a.run.app`

### Task 3 — Assign executives

OIDC Apps → Edit → assign users/groups (or Users admin).  
Replace placeholders with real emails, e.g. Dinesh Agarwal.

### Task 4 — Cleanup (optional)

Delete or disable SAML app named **ITSM** whose ACS/home URL points at `refex-admin-ui` (NE is not a SAML ACS).  
Correct ITSM embed is the **OIDC** app above.

---

## Option B — Mongo script (production server)

```bash
cd backend && source .venv/bin/activate
export MONGO_URL='…' DB_NAME='superapp_db'
python ../scripts/configure_ne_reports_oidc.py --dry-run
python ../scripts/configure_ne_reports_oidc.py --apply
python ../scripts/configure_ne_reports_oidc.py --apply --assign-emails dinesh@refex.co.in,other@refex.co.in
```

Local `return_to`:

```bash
python ../scripts/configure_ne_reports_oidc.py --apply --return-to local
```

---

## Task 5 — Verify checklist

- [ ] Launcher → **Reports & Analytics** shows **8 tiles** (1 consolidated + 7 per-app)
- [ ] Launcher → **All** — Kissflow SAML apps unchanged
- [ ] Consolidated opens `/dashboard?embed=1` — no sidebar; Entity, Company, Period filters
- [ ] Per-app opens app dashboard — Entity, Company, User, Period; KPI → MIS → Records
- [ ] Browser Back returns to Refex One launcher (`return_to`)
- [ ] Kissflow SAML tiles under All still open kissflow.com

**Note:** `restricted=true` on OIDC apps currently limits launch to org admins in Refex One code. Executives need admin role or `restricted=false` until Phase 2 SSO.
