# RefexOne — Application Flow Runbook

**Product:** Refex Super App (RefexOne)  
**Purpose:** Check every user and admin flow **before** and **after** a change. Report which flows the change would affect. **Do not change application code until the owner confirms.**  
**Last updated:** 2026-09-19

Related docs (do not replace this runbook):

| Doc | Use |
|-----|-----|
| `frontend/public/USER_GUIDE.md` | Screen-by-screen UI steps |
| `frontend/public/KISSFLOW_IAM_FLOW.md` | SAML / SCIM / HR technical detail |
| `frontend/public/DOCUMENTATION.md` §17 | Ops troubleshooting (backend down, SAML, SCIM, HR) |
| `scripts/NE_REPORTS_OIDC_SETUP.md` | Notification Engine Reports OIDC wiring |
| `docs/REFEXIONS_WEBCHAT_PLAN.md` | Refexions chat intents |

---

## 1. Change-control rule (mandatory)

```
1. Describe the proposed change (files, behaviour, env).
2. Map impact against the flow catalog in §3 (Affected / Not affected / Unknown).
3. Report the impact table to the owner.
4. Wait for explicit confirmation: "proceed" / "yes, change it".
5. Only then implement.
6. Re-run the Before baseline vs After checklist for every Affected flow, plus the P0 smoke suite (§5).
```

**No confirmation = no code change.** Config-only or docs-only work still needs an impact table if it can change a user-visible path (login, launcher tiles, SSO, Help Desk, Reports).

When asking for confirmation, include:

- What will change
- Which flows will change (and how the user will notice)
- Which flows stay the same
- Rollback (git revert / env flag / Kissflow key)

---

## 2. How to run a before / after check

### 2.1 Environments

| Env | Frontend | Backend | Kissflow |
|-----|----------|---------|----------|
| Local ITSM | `http://localhost:3000` | Local `:8000` for `/api/itsm` + `/api/refexions` (see `setupProxy.js`) | Dev or Live per ITSM Setup |
| Local (live APIs) | `http://localhost:3000` with `REACT_APP_PROXY_TARGET=https://refexone.com` | Live | Live |
| Production | `https://refexone.com` | `uvicorn` on `:8001` behind Nginx | Live account `AcCMptlq60zH` |

Pick **one** target and keep it for both Before and After.

### 2.2 Roles to use

| Role | Typical login | Must cover |
|------|----------------|------------|
| End user (Refex) | Azure / Google on `/login` | Launcher, catalog, Help Desk Refex, Refexions |
| End user (Non-Refex) | Same, Non-Refex entity user | Create IT Request locations, comments, subject |
| Org admin | `/login` or `/developerlogin` | IAM, ITSM Setup, HR, SCIM, SSO apps |
| Reports / chief title | Restricted OIDC Reports tiles | Notification Engine dashboards |
| Executive (restricted OIDC) | Assigned OIDC apps only | Restricted apps visible; others hidden |

### 2.3 Before (baseline)

1. Note git SHA / branch and env (Dev vs Live Kissflow).
2. Walk the **P0 smoke suite** (§5) and tick Pass / Fail.
3. For the module you plan to touch, walk that module’s full checklist in §3.
4. Capture: screenshot or ticket IDs, HTTP status of key APIs, and any existing defect (do not treat a pre-existing bug as a regression).

### 2.4 After (same path, same accounts)

1. Repeat the same clicks, same users, same env.
2. Compare: navigation, payloads, Kissflow instance IDs, emails, SSO landing pages.
3. Mark each flow: **Unchanged** / **Changed as designed** / **Regression**.
4. If any P0 flow regresses, stop and revert; do not continue other work.

### 2.5 Quick health (API)

```bash
curl -s https://refexone.com/api/health
# expect: {"status":"healthy", ...}
```

Local: `http://localhost:8000/api/health` or `:8001`.

---

## 3. Flow catalog

Use the **Impact** column when reporting a proposed change: `Y` = this flow can change, `N` = out of blast radius, `?` = unknown (treat as Y until proven).

### F01 — Login and session

| | |
|--|--|
| **Pages** | `/login`, `/developerlogin` |
| **APIs** | `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/auth/azure/login` + callback, `GET /api/auth/google/login` + callback, `POST /api/auth/change-password` |
| **Depends on** | `users`, Azure AD configs, Google OAuth configs, JWT cookie `iam_token` |

**Before / after checklist**

- [ ] Microsoft login on `/login` returns to launcher (or pending SAML/OIDC redirect).
- [ ] Google login on `/login` for a Workspace domain user.
- [ ] Password login **only** on `/developerlogin` (not on public `/login`).
- [ ] Invalid credentials show an error; no token stored.
- [ ] Forced password change (`must_change_password`) blocks other pages until success.
- [ ] Session survives refresh (`/auth/me`); logout clears token and returns to `/login`.
- [ ] Admin lands on Dashboard `/`; user lands on `/launcher`.
- [ ] Non-admin hitting `/users` (or any admin route) redirects to `/launcher`.

**Typical blast radius:** `AuthContext.js`, `Login.js`, `server.py` auth, `azure_ad.py`, `google_oauth.py`, JWT/cookie flags.

---

### F02 — Profile (password + photo)

| | |
|--|--|
| **Pages** | Header profile menu (all authenticated pages) |
| **APIs** | `PUT /api/users/me/profile-pic`, `POST /api/auth/change-password` |

**Checklist**

- [ ] Upload JPEG/PNG profile photo; avatar updates.
- [ ] HEIC from iOS under 5MB accepted (or clear error).
- [ ] Change password with current + new + confirm; re-login works with new password.

---

### F03 — App Launcher (My Apps)

| | |
|--|--|
| **Pages** | `/launcher` |
| **APIs** | `GET /api/launcher/apps`, SAML complete, OIDC authorize, `GET /api/itsm/kissflow-status` |
| **UI** | `AppLauncher.js`, `launcherApps.js`, `RefexionsChat.js` |

**Checklist**

- [ ] Greeting + search filters tiles.
- [ ] Assigned SAML app (e.g. Kissflow module) opens SSO and lands in the app.
- [ ] Assigned OIDC app (e.g. Canteen / Feast / QR / Reports) completes authorize → token → app.
- [ ] Restricted OIDC tiles hidden unless the user is assigned.
- [ ] Help Desk / ITSM tile: if Kissflow SSO target exists, SSO; else fallback to `/itsm`.
- [ ] Unassigned app does **not** appear here (request via catalog).
- [ ] Mobile/PWA: tile opens in same window.

**Typical blast radius:** launcher access helpers, app assignment, `approved_user_ids`, Reports chief-title filter.

---

### F04 — App Catalog and access requests

| | |
|--|--|
| **Pages** | `/catalog`, `/access-requests` (user), `/requests` (admin) |
| **APIs** | `GET /api/catalog/apps`, `POST/GET /api/access-requests`, `PUT /api/access-requests/{id}` |

**Checklist**

- [ ] User: Request Access → button becomes Pending; toast shown.
- [ ] Admin email sent (SMTP).
- [ ] Admin: approve → app appears on user’s launcher.
- [ ] Admin: reject → request status updates; launcher unchanged.
- [ ] User cannot approve their own request.

---

### F05 — SAML IdP (Kissflow and other SPs)

| | |
|--|--|
| **Pages** | Launch from `/launcher`; admin `/apps/saml` |
| **APIs** | `/api/apps/saml*`, `/api/saml/{app_id}/sso`, `/slo`, `/complete`, `/test`, `/metadata` |

**Checklist**

- [ ] IdP-initiated: launcher click → ACS POST → SP session.
- [ ] SP-initiated: app URL → `/sso` → login if needed → assertion.
- [ ] Deep link / module URL preserved (`module_url` / RelayState).
- [ ] Metadata URL loads; Kissflow config helper values match `PUBLIC_URL`.
- [ ] User without assignment is denied.
- [ ] Access policy (IP/time) still enforced if configured.
- [ ] Admin SAML test assertion succeeds.

**Do not** point a SAML ACS at Notification Engine (`refex-admin-ui`). Reports use **OIDC** (see F06 / `scripts/NE_REPORTS_OIDC_SETUP.md`).

---

### F06 — OIDC IdP (including Notification Engine Reports)

| | |
|--|--|
| **Pages** | Launch from `/launcher`; admin `/apps/oidc` |
| **APIs** | `/api/apps/oidc*`, `/api/oidc/{app_id}/authorize`, `/token`, `/api/oidc/userinfo`, `/api/oidc/jwks` |

**Checklist**

- [ ] Authorize with session → code → token → userinfo.
- [ ] Logged-out user is sent to login, then back to the client.
- [ ] JWKS and discovery documents load.
- [ ] Regenerating client secret breaks old clients; new secret works.
- [ ] **Reports & Analytics** tiles: embed dashboard opens; **Return** lands on `/launcher` (`return_to`).
- [ ] Chief-title / restricted assignment: only entitled users see Reports apps.

**Typical blast radius:** `oidc_crypto`, `oidc_apps`, Reports access tests (`backend/tests/test_reports_access.py`).

---

### F07 — Admin IAM (org, users, groups, roles, policies, audit, dashboard)

| | |
|--|--|
| **Pages** | `/`, `/users`, `/groups`, `/roles`, `/policies`, `/audit` |
| **APIs** | `/api/organizations*`, `/api/users*`, `/api/groups*`, `/api/roles*`, `/api/permissions`, `/api/policies*`, `/api/dashboard/stats`, `/api/audit-logs*` |

**Checklist**

- [ ] Dashboard stats load (users, apps, requests).
- [ ] Create / edit / disable user; HR fields visible for synced users.
- [ ] Export users; reset password.
- [ ] Assign user to SAML/OIDC app → launcher updates.
- [ ] Groups: add/remove members; role assignment.
- [ ] Access policy create/edit; SSO respects it.
- [ ] Audit log records login, user change, SSO, access request.

---

### F08 — HR sync (Adrenalin)

| | |
|--|--|
| **Pages** | `/hr-sync` |
| **APIs** | `POST /api/hr-sync/trigger`, `GET /api/hr-sync/logs` |
| **Service** | `backend/services/adrenalin_sync.py` (nightly APScheduler) |

**Checklist**

- [ ] Manual trigger completes; log shows created / updated / disabled counts.
- [ ] New Adrenalin employee can log in (default password policy).
- [ ] User disabled only when `EMPLOYMENT_STATUS` is not `1` / Active (do not disable on other flags).
- [ ] Optional Kissflow SCIM push after sync (if configured).
- [ ] Email report sent when SMTP is configured.
- [ ] Nightly job still registered on backend startup.

**Tests:** `backend/tests/test_hr_sync_*.py`, `frontend/e2e/hr-sync.spec.js`

---

### F09 — SCIM inbound, Kissflow SCIM outbound, User Master

| | |
|--|--|
| **Pages** | `/scim` (outbound, inbound, user-master tabs) |
| **APIs** | `/api/scim/v2/*`, `/api/scim/tokens*`, `/api/kissflow-scim/*`, `/api/user-master*`, `/api/user-master/tokens*` |

**Checklist**

- [ ] Inbound: SCIM bearer token lists/creates/updates Users (RFC 7644).
- [ ] Outbound: config save; push one user; full sync logs.
- [ ] Link user / resolve managers.
- [ ] User Master: API key returns directory records (no unexpected pagination drop).
- [ ] Admin token CRUD; revoked key is rejected.

**Tests:** `test_scim_v2.py`, `test_kissflow_scim.py`, `test_user_master_api.py`

---

### F10 — Help Desk / ITSM (user)

Two entity paths: **Refex** (Extrovis / Tech Support process) and **Non-Refex**.

| | |
|--|--|
| **Pages** | `/itsm`, `/itsm/new` |
| **APIs** | `GET /api/itsm/config`, `GET /api/itsm/approval-matrix`, `GET /api/itsm/non-refex-locations`, `POST /api/itsm/tickets`, `GET /api/itsm/reports`, `GET /api/itsm/reports/count`, `POST .../reopen`, `.../rating`, `.../comment`, `.../comment-with-files`, `GET .../comments`, `GET .../attachment-preview` |

**Checklist — list**

- [ ] Open `/itsm` from launcher; tickets load for the logged-in user.
- [ ] Count endpoint used when cache exists; list not empty due to orphan Mongo locals.
- [ ] Deleted Kissflow tickets do **not** reappear from local Mongo.

**Checklist — create (Refex)**

- [ ] Entity Refex → location / category from approval matrix.
- [ ] Submit `POST /itsm/tickets` → Kissflow instance ID; redirect to list with refresh.

**Checklist — create (Non-Refex)**

- [ ] Locations from Kissflow Live Setup keys.
- [ ] Subject required.
- [ ] Ticket created on the Non-Refex process (Dev vs Live per Setup).

**Checklist — ticket actions**

- [ ] Reopen (not on hold / Extrovis-disabled states).
- [ ] Rating after complete.
- [ ] Comment text persists on refresh.
- [ ] Comment with files; image preview (GCS / BOT key nested tables).
- [ ] Non-Refex user comments + attachments survive Help Desk refresh.

**Tests:** `test_non_refex_locations.py`, `test_non_refex_comments.py`

**Typical blast radius:** `backend/routes/itsm.py`, `ITSMDashboard.js`, `CreateITRequest.js`, ITSM Setup keys, Kissflow process IDs.

---

### F11 — ITSM Setup (admin)

| | |
|--|--|
| **Pages** | `/itsm-setup` |
| **APIs** | `/api/itsm/admin/entities*`, `/api/itsm/admin/environments`, `test-matrix`, `seed-defaults`, `GET/PUT /api/itsm/config/environments` |

**Checklist**

- [ ] Switch Development vs Live; connection test.
- [ ] Entity CRUD; webhook / process IDs / BOT keys / policy API key persist.
- [ ] Test matrix returns rows.
- [ ] Seed defaults is idempotent enough to not wipe live keys without warning.
- [ ] Refexions policy send from Setup (live) still works after save.

Changing Setup keys can break **F10 and F12** immediately. Treat as production-sensitive.

---

### F12 — Refexions chat (launcher)

| | |
|--|--|
| **UI** | Chat widget on `/launcher` (`RefexionsChat.js`) |
| **APIs** | `GET /api/refexions/main-menu`, `/sub-menu`, `/policies`, `POST /api/refexions/it/match`, `/it/create`, `/policies/send` |

**Checklist**

- [ ] Main menu: Expense, Travel, IT HelpDesk, Policies (from Kissflow `Whatsapp_BOT_Config`).
- [ ] Expense / Travel: coming-soon (no ticket).
- [ ] IT: describe issue → subtype match → confirm → Kissflow ticket created.
- [ ] Policies: list → send PDF to user email; success/failure copy.
- [ ] Keys never appear in browser (network tab).

**Tests:** `backend/tests/test_refexions.py`

---

### F13 — Azure AD and Google admin

| | |
|--|--|
| **Pages** | `/settings/azure-ad`, `/settings/google` |
| **APIs** | Azure configs, providers, callback URL, `POST .../sync-users`; Google configs, providers, callback URL |

**Checklist**

- [ ] Save config; callback URL matches App Registration / Google client.
- [ ] Provider buttons on `/login` for matching email domains.
- [ ] Azure Graph user pull (if used); sync logs.
- [ ] User not in Mongo cannot log in (unless product rule changed — call that out in impact).

---

### F14 — Mobile apps, downloads, force-update

| | |
|--|--|
| **Pages** | `/apps/mobile`, `/settings/app-update`, public `/download` |
| **APIs** | `/api/apps/mobile*`, `/api/app-update/check`, `/api/app-update/config`, `/api/app-download/links`, `/api/app-download/go` |

**Checklist**

- [ ] Public download page links work (Android / iOS).
- [ ] Admin force-update config: old app version is gated; new version is not.
- [ ] Mobile tiles on launcher for assigned users.

---

### F15 — Settings (org)

| | |
|--|--|
| **Pages** | `/settings` |
| **APIs** | Org update, `POST /api/upload/logo` |

**Checklist**

- [ ] Org name / logo update; launcher branding reflects logo.

---

## 4. Impact report template (paste into chat before any code change)

```markdown
## Proposed change
- Goal:
- Files / modules:
- Env impact (Dev / Live / env vars):

## Flow impact

| ID | Flow | Impact (Y/N/?) | How the user will notice | Verify after (checklist items) |
|----|------|----------------|--------------------------|--------------------------------|
| F01 | Login and session | | | |
| F02 | Profile | | | |
| F03 | App Launcher | | | |
| F04 | Catalog / access requests | | | |
| F05 | SAML IdP | | | |
| F06 | OIDC / NE Reports | | | |
| F07 | Admin IAM | | | |
| F08 | HR sync | | | |
| F09 | SCIM / User Master | | | |
| F10 | Help Desk user | | | |
| F11 | ITSM Setup | | | |
| F12 | Refexions | | | |
| F13 | Azure / Google admin | | | |
| F14 | Mobile / download | | | |
| F15 | Org settings | | | |

## Adjacent systems
- Kissflow processes / SCIM / Adrenalin / SMTP / NE embed / Policy API: yes/no

## Risk
- P0 flows at risk:
- Rollback:

## Confirmation needed
Reply **proceed** to implement, or list flows to exclude.
```

---

## 5. P0 smoke suite (always, after any confirmed change)

Run with one **user** and one **admin** on the same env used for Before.

| # | Role | Steps | Pass |
|---|------|--------|------|
| P0-1 | User | `/login` (Microsoft or Google) → `/launcher` tiles load | |
| P0-2 | User | Open one SAML Kissflow app from launcher | |
| P0-3 | User | Open one OIDC app (non-Reports) from launcher | |
| P0-4 | User | `/itsm` list loads; open `/itsm/new` (do not have to submit in prod) | |
| P0-5 | User | Refexions main menu opens | |
| P0-6 | Admin | `/` dashboard loads; `/users` list loads | |
| P0-7 | Admin | `/itsm-setup` environments visible (do not save unless that is the change) | |
| P0-8 | Either | `GET /api/health` healthy | |

If the change is in a specific module, add that module’s **full** §3 checklist, not only P0.

### P1 when the change touches that area

| Change in | Extra |
|-----------|--------|
| `itsm.py` / Help Desk UI | Full F10 (Refex **and** Non-Refex comment + attachment) |
| Refexions | Full F12 + create one Dev ticket |
| Auth / Azure / Google | F01 + F13 |
| Launcher / assignment / Reports | F03 + F06 Reports tile |
| HR / users | F08 + login of a synced user |
| SCIM / User Master | F09 |
| SAML metadata / `PUBLIC_URL` | F05 SP- and IdP-initiated |

---

## 6. Automated tests (supplement, not a substitute)

From `backend/` (venv):

```bash
pytest tests/test_iam_features.py tests/test_access_control_v7.py -q
pytest tests/test_saml_sso.py tests/test_saml_access_helpers.py -q
pytest tests/test_oidc_iteration_10.py tests/test_reports_access.py -q
pytest tests/test_scim_v2.py tests/test_kissflow_scim.py tests/test_user_master_api.py -q
pytest tests/test_hr_sync_org.py tests/test_hr_sync_access_requests.py -q
pytest tests/test_non_refex_locations.py tests/test_non_refex_comments.py tests/test_refexions.py -q
```

Frontend: `cd frontend && yarn test` (launcher unit tests); `yarn test:e2e` for HR Playwright.

Map failing tests back to flow IDs above before declaring After complete.

---

## 7. Dependency map (blast radius)

```
Adrenalin ──► F08 HR Sync ──► users ──► F09 Kissflow SCIM
                 │
Azure/Google ──► F01 Auth ──► F03 Launcher ─┬──► F05 SAML ──► Kissflow apps
                 │                         ├──► F06 OIDC ──► Canteen/Feast/QR/NE Reports
                 ├──► F04 Access requests ─┘
                 └──► F10/F11 ITSM + F12 Refexions ──► Kissflow processes + Policy API
```

A change in **users / auth** can affect almost every flow. A change in **ITSM Setup keys** affects F10–F12 only, but is still production-critical.

---

## 8. Sign-off

| Gate | Owner | Result |
|------|--------|--------|
| Impact table reviewed | | |
| Confirmation to implement | | |
| P0 After all pass | | |
| Affected §3 checklists pass | | |
| Tests for touched modules pass | | |

---

*Internal — Refex Group. Use this file for every feature, bugfix, or config change that can alter a user-visible or integration path.*
