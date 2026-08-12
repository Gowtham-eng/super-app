# RefexOne — Azure AD (Entra ID) Login Setup Guide

**Purpose:** Sign users into **RefexOne** with Microsoft Entra ID (Azure AD) using **OpenID Connect (OIDC)**.  
**Not covered:** SAML SSO to Kissflow / Extrovis / other apps (those stay under SAML Apps).

---

## 1. What this integration does

```
User → RefexOne Login → "Sign in with Microsoft"
     → Microsoft Entra (company tenant)
     → Callback to RefexOne
     → RefexOne session (JWT / iam_token)
```

- RefexOne is the **application** (OIDC client / relying party).
- Each company Azure AD is an **identity provider**.
- Multiple Azure AD tenants are supported (one config per tenant).

---

## 2. Recommended multi-AD architecture (best setup)

### Why one App Registration per tenant

| Approach | Recommendation |
|---|---|
| **One App Registration per Azure AD tenant** | **Use this** |
| Single “multi-tenant” app for all companies | Avoid for Refex group entities with separate directories |
| SAML federation into RefexOne | Do **not** use for RefexOne login |

**Per-tenant App Registration** gives you:

- Clear ownership per AD team / company
- Separate client secrets and audit trails
- Domain-based routing (e.g. `@refex.co.in` → Refex AD, `@partner.com` → Partner AD)
- Ability to disable one company without affecting others

### Config model (one row per AD)

| Field | Example | Notes |
|---|---|---|
| `label` | `Refex Group Entra` | Shown on login / admin UI |
| `tenant_id` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Directory (tenant) ID |
| `client_id` | Application (client) ID | From App Registration |
| `client_secret` | `••••••••` | Store encrypted; rotate every 12 months |
| `email_domains` | `refex.co.in`, `refex.group` | Used to pick the correct AD |
| `redirect_uri` | See below | Must match Azure exactly |
| `scopes` | `openid profile email offline_access` | Standard OIDC |
| `status` | `active` / `disabled` | Soft disable without deleting |

### Shared callback (all tenants)

Use **one** redirect URI for all AD configs:

```
https://refexone.com/api/auth/azure/callback
```

RefexOne uses the OAuth `state` parameter to know which AD config was used.

**Optional local/dev:**

```
http://localhost:8000/api/auth/azure/callback
```

### How the login picker should work

1. User clicks **Sign in with Microsoft**.
2. If only one active AD → go straight to that tenant.
3. If multiple ADs:
   - Prefer **email-first**: user enters work email → route by domain → correct tenant.
   - Or show a **company list** (label from each AD config).
4. After Microsoft login, match user by **email** (UPN / `preferred_username` / `email` claim) to an existing RefexOne user (or JIT-provision if you enable it).

---

## 3. What you must get from each AD team

Ask every AD team to return this package (use the AD Team Setup page):

| # | Item | Where they find it |
|---|---|---|
| 1 | **Directory (Tenant) ID** | Entra ID → Overview |
| 2 | **Application (Client) ID** | App registration → Overview |
| 3 | **Client Secret Value** | Certificates & secrets → **Value** (shown once) |
| 4 | **Client Secret Expiry** | Same blade |
| 5 | **Primary / allowed email domains** | e.g. `company.com` |
| 6 | **Confirmation** that redirect URI + API permissions are set | Checklist on AD page |

You do **not** need SAML metadata, Entity ID, or ACS URLs for this flow.

---

## 4. Values you give to the AD team

Share the file:

`frontend/public/azure-ad-team-setup.html`

(or host/open it and send the link / PDF print).

Minimum values to provide them:

| Setting | Value |
|---|---|
| Application name | `RefexOne Login` (or `RefexOne – {Company}`) |
| Account types | **Accounts in this organizational directory only** (single tenant) |
| Platform | **Web** |
| Redirect URI | `https://refexone.com/api/auth/azure/callback` |
| Front-channel logout URL (optional) | `https://refexone.com/login` |
| ID token | Enabled (implicit not required if using auth code) |
| API permissions | `openid`, `profile`, `email`, `User.Read` (Microsoft Graph, delegated) |
| Grant type | Authorization Code (+ PKCE recommended) |

---

## 5. Azure Portal steps (for AD team — summary)

1. **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: `RefexOne Login`
3. Supported account types: **Single tenant**
4. Redirect URI: **Web** → production callback URL above
5. **Certificates & secrets** → New client secret → copy **Value** immediately
6. **Authentication**:
   - Add redirect URI if not already there
   - Under Implicit grant: leave Access/ID tokens **unchecked** if using auth code + PKCE
   - Allow ID tokens only if your client flow requires it
7. **API permissions** → Microsoft Graph → Delegated:
   - `openid`
   - `profile`
   - `email`
   - `User.Read`
8. Click **Grant admin consent** for the tenant
9. **Token configuration** (optional but useful):
   - Add optional claim `email` on ID token
   - Add `upn` if your org relies on UPN
10. Send Tenant ID, Client ID, Secret Value, domains back to RefexOne team

---

## 6. RefexOne team — how to store each AD config

Until an admin UI exists, keep a secure inventory (password manager / vault), one entry per company:

```yaml
# Example — DO NOT commit real secrets to git
azure_ad_configs:
  - label: Refex Group
    tenant_id: "00000000-0000-0000-0000-000000000001"
    client_id: "11111111-1111-1111-1111-111111111111"
    client_secret: "<from vault>"
    email_domains: ["refex.co.in", "refex.group"]
    authority: "https://login.microsoftonline.com/{tenant_id}/v2.0"
    redirect_uri: "https://refexone.com/api/auth/azure/callback"
    scopes: ["openid", "profile", "email", "offline_access"]
    status: active

  - label: Partner Company
    tenant_id: "00000000-0000-0000-0000-000000000002"
    client_id: "22222222-2222-2222-2222-222222222222"
    client_secret: "<from vault>"
    email_domains: ["partner.com"]
    authority: "https://login.microsoftonline.com/{tenant_id}/v2.0"
    redirect_uri: "https://refexone.com/api/auth/azure/callback"
    scopes: ["openid", "profile", "email", "offline_access"]
    status: active
```

### Authority / endpoints (per tenant)

Replace `{tenant_id}`:

| Endpoint | URL |
|---|---|
| Authority | `https://login.microsoftonline.com/{tenant_id}/v2.0` |
| Authorize | `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize` |
| Token | `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token` |
| JWKS | `https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys` |
| OpenID config | `https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration` |

Do **not** use `/common` or `/organizations` when you need strict per-company tenancy.

---

## 7. OIDC login flow (technical)

1. Browser → `GET /api/auth/azure/login?config_id=...` (or `?domain=refex.co.in`)
2. RefexOne redirects to Microsoft authorize URL with:
   - `client_id`
   - `response_type=code`
   - `redirect_uri`
   - `scope=openid profile email offline_access`
   - `response_mode=query`
   - `state` = signed blob (`config_id` + nonce + CSRF)
   - `code_challenge` / `code_challenge_method=S256` (PKCE)
3. User signs in at Microsoft
4. Microsoft → `GET /api/auth/azure/callback?code=...&state=...`
5. RefexOne exchanges code at token endpoint (with `client_secret` + `code_verifier`)
6. Validate ID token (`iss`, `aud`, `tid`, signature via JWKS)
7. Resolve user by email → issue RefexOne `iam_token` → redirect to `/` or launcher

### Claim mapping (suggested)

| Azure claim | RefexOne field |
|---|---|
| `email` or `preferred_username` / `upn` | `users.email` |
| `name` / `given_name` + `family_name` | display name |
| `oid` | store as `azure_oid` for future linking |
| `tid` | store as `azure_tenant_id` |

---

## 8. Security checklist

- [ ] One **single-tenant** app per company AD
- [ ] Client secrets only in vault / encrypted DB — never in git, Slack, or email long-term
- [ ] Secret expiry tracked; rotate before expiry
- [ ] Admin consent granted in each tenant
- [ ] Redirect URI exact match (https, no trailing slash mismatch)
- [ ] PKCE enabled
- [ ] `state` validated (CSRF)
- [ ] ID token signature + `aud` + `tid` validated against selected config
- [ ] Only users with allowed domains (or existing RefexOne accounts) can complete login
- [ ] Audit log: `azure_login_success` / `azure_login_failed`

---

## 9. Multiple AD — operational playbook

### Onboard a new company AD

1. Send `azure-ad-team-setup.html` to that company’s AD team
2. Receive Tenant ID, Client ID, Secret, domains
3. Create RefexOne AD config row (`label`, domains, credentials)
4. Test with one pilot user from that domain
5. Enable on login page

### Disable a company

Set `status: disabled` — do not delete until secrets are rotated/revoked in Azure.

### Domain conflicts

If two ADs claim the same email domain, **do not activate both**. Domains must be unique across active configs.

### Shared users / guest accounts

Prefer **home tenant** login. Guest (`#EXT#`) UPNs are fragile; ask AD team to use cloud mailboxes / proper UPNs where possible.

---

## 10. Testing checklist

| Test | Expected |
|---|---|
| Valid user from Tenant A | Lands in RefexOne with session |
| Valid user from Tenant B | Uses Tenant B config; correct org/user |
| Wrong tenant user | Microsoft or RefexOne rejects |
| Disabled AD config | Not offered / error |
| Expired client secret | Clear admin-facing error |
| Callback URI typo | Azure `AADSTS50011` — fix redirect URI |
| User email not in RefexOne | Either deny or JIT-create (product decision) |

### Common Azure errors

| Code | Meaning | Fix |
|---|---|---|
| `AADSTS50011` | Redirect URI mismatch | Align portal + RefexOne exactly |
| `AADSTS700016` | App not found in tenant | Wrong tenant / client ID |
| `AADSTS7000215` | Invalid client secret | Copy **Value**, not Secret ID; regenerate |
| `AADSTS65001` | User/admin consent required | Grant admin consent |
| `AADSTS50105` | User not assigned to app | Assign users/groups to the enterprise app |

---

## 11. Separation from SAML (do not mix)

| Topic | RefexOne Login (this guide) | App SSO (existing) |
|---|---|---|
| Protocol | **OIDC / OAuth 2.0** | SAML 2.0 / OIDC **as IdP** |
| Who is IdP? | **Microsoft Entra** | **RefexOne** |
| Who is client/app? | **RefexOne** | Kissflow, Extrovis, Feast, etc. |
| Admin UI today | AD config (planned) | SAML Apps / OIDC Apps |
| AD team creates | App Registration for RefexOne | Enterprise app / SP for downstream apps |

---

## 12. Handoff files

| File | Audience |
|---|---|
| `AZURE_AD_SETUP_GUIDE.md` (this file) | RefexOne / IAM team |
| `azure-ad-team-setup.html` | Azure AD / Entra administrators (one copy per tenant) |

Open the HTML page in a browser, fill the “RefexOne provides” section if needed, then send to the AD team. Collect their return form before enabling login for that company.

---

## 13. Where to configure in RefexOne Admin

1. Sign in as org admin
2. Sidebar → **Compliance** → **Azure AD Login**
3. URL: `/settings/azure-ad`
4. Click **Add Azure AD** for each company tenant (label, Tenant ID, Client ID, Secret, email domains)
5. Keep status **Active** — login page will show **Sign in with Microsoft**
6. Share `https://refexone.com/azure-ad-team-setup.html` with each AD team
