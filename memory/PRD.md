# RefexOne (Enterprise IAM) — PRD

## Original Problem Statement
Create a mobile and web super-app (IAM system) that acts as a custom Identity Provider for Kissflow (and other SPs). Multi-tenant, SAML 2.0 + OIDC + SCIM v2, RBAC, auto-provisioning, Adrenalin HRMS sync. Branded as **RefexOne**.

## Stack
- Frontend: React + Tailwind + Shadcn/UI + Capacitor (Android)
- Backend: FastAPI (monolithic `server.py` ~3000 lines)
- DB: MongoDB
- Auth: JWT (case-insensitive email)
- Integrations: Kissflow (SAML SP + SCIM), Adrenalin HRMS, Zoho Mail SMTP

## What's Implemented
- Multi-tenant IdP (SAML 2.0 signed, OIDC OAuth2 code flow, SCIM v2 outbound)
- Kissflow SAML SSO + native Android intent launch (com.kissflow.android)
- Adrenalin HRMS background sync (midnight daily)
- Joget-style App Launcher (category filters, search, gradient hero)
- User Master dashboard (pagination, sticky cols, gradient avatars, stat cards)
- Rounded UI components, animations, case-insensitive auth globally
- App Catalog with category-based ordering (Expense / Productivity / Facility / Support / HR)
- **[Feb 2026]** SAML & OIDC apps now support `category` + `sort_order` in Add/Edit forms (backend models + UI dropdowns)

## DB Schema (key collections)
- `users`: email, password_hash, full_name, adrenalin_employee_id, kissflow_user_id, designation, department, company, org_id
- `saml_apps`: id, name, entity_id, acs_url, home_url, category, sort_order, logo_url, cert, key
- `oidc_apps`: id, name, client_id, client_secret, redirect_uris, home_url, category, sort_order, logo_url
- `organizations`, `groups`, `roles`, `access_policies`, `audit_logs`

## Backlog / Roadmap
- **P0** — None currently (logo upload prod fix delivered; user to apply chown/permission fix on their Ubuntu server)
- **P1** — System Health admin page (DB, uploads writable, Kissflow/Adrenalin reachability, last sync timestamps)
- **P2** — Refactor `server.py` into modular routers under `/app/backend/routes/`
- **P2** — MFA support
- **P2** — Session management improvements
- **P2** — Richer HR Sync dashboard (history, per-user error logs)

## Self-hosted Deployment
- Ubuntu 22.04, Nginx reverse proxy on `refexone.com`, systemd-managed `superapp-backend` (uvicorn)
- Static frontend served from `/opt/superapp/frontend/build`
- Uploads at `/opt/superapp/backend/uploads/` — MUST be owned by service user (most recent fix in chat)
- `client_max_body_size 10M` in Nginx for logo uploads
