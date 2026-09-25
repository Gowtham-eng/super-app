# RefexOne — Change and Solution Log

**Product:** RefexOne (Refex Super App)  
**Branch:** `itsmbackuplatest`  
**Purpose:** Record what changed, what broke, and how it was fixed. Append a new dated entry for every production or code change.

Related: `docs/FLOW_RUNBOOK.md` (flow checklist before/after a change).

---

## How to add a new entry

Copy this block to the **top** of the log (newest first):

```
### YYYY-MM-DD — short title
- **Problem:**
- **Cause:**
- **Change / solution:**
- **Flows (runbook):** F01–F15
- **Verify:**
- **Git / deploy:**
```

---

# Log

### 2026-09-25 — Microsoft SSO like Google (no org list)
- **Problem:** Sign in with Microsoft showed Venwindrefex / extrovis / kavispharma boxes. User wants one button like Google. Earlier AADSTS50020 sent Extrovis into Venwind Login (`1c3df89e-…`).
- **Cause:** Three single-tenant Azure AD Login rows. The login page listed them so the wrong tenant was not guessed. Google has one app, so Google has no list.
- **Change / solution:** Removed the 3-field picker. **Sign in with Microsoft** opens `login.microsoftonline.com/common`. User types work email on Microsoft’s page. Callback maps `@extrovis.com` / `@venwindrefex.com` / `@kavispharma.com` to the matching Azure AD Login row.
- **Azure (required):** Each App Registration → **Accounts in any organizational directory (multitenant)**. Email domains stay on the Azure AD Login rows. User must exist in that Entra tenant and as an active RefexOne user.
- **Flows:** F01 Login, F12 Azure AD admin.
- **Verify:** `/login` → Sign in with Microsoft → no company list → Microsoft email page → Extrovis / Venwind / Kavis succeed. Reload login: Google and Microsoft buttons only.
- **Git / deploy:** Restart backend + `yarn build`.

---

### 2026-09-24 — Show Reports for gowtham.s@refex.co.in
- **Problem:** Reports tiles were hidden unless the user's job title matched Chief / C-suite. Gowtham (org admin) could not see Reports.
- **Cause:** `user_can_see_reports` / `userCanSeeReports` only checked chief title (plus optional env `REPORTS_ALLOWED_EMAILS` with no default).
- **Change / solution:** Default allowlist includes `gowtham.s@refex.co.in` in `backend/services/launcher_access.py` and `frontend/src/utils/launcherApps.js`. Chiefs still see Reports. Other analysts still do not. Env `REPORTS_ALLOWED_EMAILS` still overrides the full default list if set.
- **Flows:** F03 Launcher, F06 OIDC / NE Reports.
- **Verify:** Sign in as Gowtham → Reports tab and NE dashboard tiles appear. Sign in as a non-chief user → Reports still hidden.
- **Git / deploy:** `yarn build` + restart backend.

---
### 2026-09-24 — Solution log created
- **Problem:** No single file listing RefexOne changes and fixes.
- **Change / solution:** Added this document: `docs/REFEXONE_CHANGE_SOLUTION_LOG.md`.
- **Flows:** Docs only (no user flow change).
- **Git / deploy:** Commit this file when ready; no backend restart required.

---

### 2026-09-23 — Google SSO: @noventiq.com / @3imedtech.com not allowed
- **Problem:** Google login toast: `Email domain @noventiq.com is not allowed for this Google login`. Same class of failure for `supta.modak@3imedtech.com`. Google Cloud branding later showed verified, but the toast continued.
- **Cause:** Two different systems were mixed up.
  1. **Google Cloud** Authorized domains / branding = app site (`refexone.com`). Does **not** control who can sign in.
  2. **RefexOne** `Settings → Google Login → Email domains` = mailbox allowlist (`refex.co.in`, etc.). Callback in `backend/routes/google_oauth.py` rejects any Google email whose domain is not on that list.
  3. **Hosted domain** `refex.co.in` also blocks other Google Workspaces (`3imedtech.com`, `noventiq.com`).
  4. User must already exist in Mongo (`users`) and be **active**. Google does not create accounts.
- **Change / solution (ops, not code):**
  1. RefexOne → **Google Login** → Email domains: `refex.co.in, 3imedtech.com, noventiq.com`
  2. Clear **Hosted domain** (leave empty).
  3. Create/activate the user in **Users** with the exact Google email.
  4. On `/login`, type the full email first, then **Sign in with Google** (so the Refex Google config is selected).
- **Google Console (branding only):**
  - Privacy URL for OAuth: `https://refexone.com/privacy-policy.html`
  - Homepage: `https://refexone.com`
  - Search Console HTML file: `frontend/public/googleebae1d5b47da24f9.html` → `https://refexone.com/googleebae1d5b47da24f9.html`
  - After Search Console **Verified**: Cloud Console → I have fixed the issues → Proceed.
  - Audience: External + In production is required for non-Refex Workspace Google accounts.
- **Verify:** Login as `supta.modak@3imedtech.com` and a `@noventiq.com` user that exists in Users.
- **Flows:** F01 Login, F13 Google admin.
- **Git:** `db21297` sso changes (plus local verification HTML if not in that commit).

---

### 2026-09-23 — RMC P2P only for four users; hide Procure2Pay from them
- **Problem:** RMC P2P should be visible only to a small set; those users must not see Procure2Pay.
- **Cause:** Launcher used `restricted` (admins vs everyone). No per-email allow/deny for these two tiles.
- **Change / solution:** Email rules in `backend/services/launcher_access.py` and `frontend/src/utils/launcherApps.js`.
  - **Show RMC P2P only:** `sudharshan.nc@refex.co.in`, `deepa.murthy@refex.co.in`, `tarkeshwar.singh@refex.co.in`, `mounesh.r@refex.co.in`
  - **Hide Procure2Pay** from that same list; everyone else still sees Procure2Pay.
  - Applied to launcher, catalog, and SAML/OIDC SSO. Sibling ACS bypass disabled for these two apps so Kissflow SSO cannot leak access.
  - Override env: `RMC_P2P_ALLOWED_EMAILS`, `PROCURE2PAY_HIDDEN_EMAILS`.
  - App names must match: RMC tile contains `RMC` and `P2P` or `procure`; Procure2Pay named `Procure2Pay` or `Procurement to Pay` (Reports category excluded).
- **Verify:** Log in as Deepa → RMC P2P yes, Procure2Pay no. Log in as another user → opposite.
- **Flows:** F03 Launcher, F04 Catalog, F05 SAML.
- **Git:** `ba19323` sathish rmc p2p  
- **Deploy:** `git pull` + `yarn build` + `sudo systemctl restart superapp-backend`

---

### 2026-09-22 — `deepa.murthy@refex.co.in` Invalid credentials with RefexOne@Master
- **Problem:** Support master password failed on developer login.
- **Cause:**
  1. Extra dot in email (`deepa.murthy.@refex.co.in`) does not match Mongo.
  2. After using the correct email: **401 Invalid credentials** = user missing **or** `MASTER_LOGIN_PASSWORD` empty/changed in production `.env`. Master login does not create users. Inactive users return 403, not 401.
  3. Public `/login` is Google/Microsoft; password form is `/developerlogin`.
- **Change / solution:** Use exact email `deepa.murthy@refex.co.in` on `/developerlogin`. Confirm user exists and `status: active`. Do not set `MASTER_LOGIN_PASSWORD=` empty unless disabling master login. Day-to-day: Microsoft/Google on `/login`.
- **Flows:** F01 Login.
- **Git:** master password feature is `a8dc23b` (older). No new code for this ticket.

---

### 2026-09-22 — Git tag `2026-09-22`
- **Change / solution:** Annotated tag `2026-09-22` on `e3290b0` (`check status`). Push with `git push origin 2026-09-22` if needed (needs write access to `Gowtham-eng/super-app`).
- **Flows:** None.

---

### 2026-09-19 — Launcher logos broken after `main` → `itsmbackuplatest`
- **Problem:** Fleet, Adrenalin, Kissflow, etc. showed Google Drive–style file icons. Lucide tiles (Expense, Travel) looked fine.
- **Cause:** Not an AppLauncher regression vs `main` (same `<img src={logo_url} className="w-8 h-8">`). Mongo `logo_url` points at **UUID** files under `/api/uploads/...`, not `adrenalin_hrms.png`. That named file returning 200 was a false check. UUID PNGs were missing after branch switch (uploads are not in git) **or** the stored PNG is a Drive thumbnail. Kissflow logo is an external SVG: `https://kissflow.com/hubfs/kissflow_logo_web.svg`.
- **Change / solution:** Restore `backend/uploads` from backup, then restart backend. Re-upload real PNGs in SAML/OIDC Apps if the file itself is a Drive icon.
  ```bash
  sudo tar -xzf /opt/backups/superapp-prod-2026-09-19-0635.tgz -C /tmp/superapp-restore --wildcards 'superapp/backend/uploads/*'
  sudo cp -n /tmp/superapp-restore/superapp/backend/uploads/* /opt/superapp/backend/uploads/
  curl -sI https://refexone.com/api/uploads/22b86aa3ad94df4bc06be36b5cbdea5.png | head -1
  sudo systemctl restart superapp-backend
  ```
  If tar paths differ: `sudo tar -tzf /opt/backups/superapp-prod-2026-09-19-0635.tgz | grep uploads | head`
- **Verify:** Hard refresh launcher; Adrenalin/Fleet show real logos.
- **Flows:** F03 Launcher.

---

### 2026-09-19 — Production git vs GitHub
- **Problem:** `git push` from production as `aravindnoventiq` failed: no write access to `Gowtham-eng/super-app`. Password auth is not supported (need a PAT).
- **Cause:** Production should **pull** from GitHub, not push. `aravindnoventiq` is not a collaborator with write.
- **Change / solution:** On server: `git fetch && git checkout itsmbackuplatest && git pull origin itsmbackuplatest`. For HTTPS: GitHub username + **Personal Access Token**, not the website password. Ask Gowtham to add the account with Read (pull) or Write (push).
- **Flows:** Deploy only.

---

### 2026-09-19 — Server code backup
- **Change / solution:** Production backup filename: **`superapp-prod-2026-09-19-0635.tgz`** under `/opt/backups/`. Local laptop copy also at `D:\my_backup_3_08\opt\backups\superapp-code-2026-09-19-1204.tgz`.
  ```bash
  sudo tar -czf /opt/backups/superapp-prod-$(date +%F-%H%M).tgz \
    --exclude='node_modules' --exclude='venv' --exclude='.venv' \
    --exclude='__pycache__' --exclude='frontend/build' \
    -C /opt superapp
  ```
- **Flows:** None (ops).

---

### 2026-09-19 — Pull Refexions Setup; zip for production
- **Problem:** Need to ship pulled commit without confusing git direction.
- **Change / solution:** Zip of pulled files: `refexions-setup-changes.zip` (from commit `4892889`). Overlay:
  ```bash
  sudo unzip -o /tmp/refexions-setup-changes.zip -d /opt/superapp
  cd /opt/superapp/frontend && yarn build
  sudo systemctl restart superapp-backend
  ```
- **Behaviour in that pull:** New `/refexions-setup`; chat menus/FAQ from Mongo; Refexions tickets default to **Live** Kissflow; Help Desk shows IT Agent Solution; local proxy `/api/itsm/kissflow-status` → live RefexOne.
- **Flows:** F03, F10, F11, F12.
- **Git:** `4892889`, merge `2b09a0a`.

---

### 2026-09-19 — Flow runbook
- **Change / solution:** `docs/FLOW_RUNBOOK.md` — F01–F15, P0 smoke, impact table, no code until owner says proceed.
- **Git:** `e49382e` runbook.

---

## Production deploy cheat sheet

```bash
cd /opt/superapp
git fetch origin
git checkout itsmbackuplatest
git pull origin itsmbackuplatest
cd /opt/superapp/frontend && yarn build
sudo systemctl restart superapp-backend
sudo systemctl status superapp-backend --no-pager
```

If the unit name differs: `sudo systemctl list-units --type=service | grep -iE 'superapp|uvicorn'`

---

## Useful Mongo checks

```bash
# User for login / Google
mongosh superapp_db --quiet --eval '
db.users.find({ email: /EMAIL_HERE/i }, { email:1, name:1, status:1, org_id:1, _id:0 }).forEach(printjson)
'

# Google SSO allowlist
mongosh superapp_db --quiet --eval '
db.google_oauth_configs.find({ status: "active" }, { label:1, email_domains:1, hosted_domain:1, _id:0 }).forEach(printjson)
'

# App logos
mongosh superapp_db --quiet --eval '
db.saml_apps.find({}, { name:1, logo_url:1, _id:0 }).forEach(printjson)
'
```

---

*Confidential — Refex Group. Newest entries at the top.*
