# RefexOne — Pull users from multiple Azure ADs

Use this when you need users from **Extrovis**, **Kavipharm**, and other company Entra tenants inside RefexOne.

---

## What you do (RefexOne admin)

### Step A — One config per company

Admin → **Azure AD Login** (`/settings/azure-ad`)

| Company | Label | Email domains (example) |
|---|---|---|
| Extrovis | `Extrovis` | `extrovis.com` |
| Kavipharm | `Kavipharm` | `kavipharm.com` (use real domain) |

For each company, save:

- Tenant ID  
- Application (client) ID  
- Client secret  
- Email domains  

### Step B — Ask each AD team for Graph permission

Send them: `https://refexone.com/azure-ad-team-setup.html`

They must add **Application** permission:

- `User.Read.All` (Microsoft Graph)  
- Then **Grant admin consent**

Without this, **Sync users** fails.

### Step C — Pull users

On each config row click **Sync users**.

RefexOne will:

- Create new users (default password from `DEFAULT_USER_PASSWORD`, usually `Welcome@2026`)
- Update existing users matched by email
- Disable users that are disabled in Azure AD
- Skip emails outside that config’s domains

Repeat for Extrovis, then Kavipharm, etc.

### Step D — Login (optional)

Users can then use **Sign in with Microsoft** (OIDC) if login permissions are also set.

---

## What each AD team must return

| Item | Required |
|---|---|
| Directory (Tenant) ID | Yes |
| Application (Client) ID | Yes |
| Client Secret Value | Yes |
| Email domains | Yes |
| Delegated: openid, profile, email, User.Read | Yes (login) |
| Application: User.Read.All + admin consent | Yes (user pull) |
| Redirect URI set | `https://refexone.com/api/auth/azure/callback` |

---

## Example: Extrovis + Kavipharm

```
Azure AD Login
├── Extrovis     domains: extrovis.com      → Sync users
└── Kavipharm    domains: kavipharm.com     → Sync users
```

Login page shows company picker when both are **Active**.

---

## After deploy

1. Deploy latest backend + frontend  
2. Confirm `PUBLIC_URL=https://refexone.com`  
3. Add Extrovis config → Sync users  
4. Add Kavipharm config → Sync users  
5. Check **Users** list in RefexOne  

---

## Common sync errors

| Error | Fix |
|---|---|
| Graph token / consent error | Add `User.Read.All` **Application** permission + Grant admin consent |
| AADSTS700016 | Wrong Client ID / Tenant ID pair — recreate App Registration |
| 0 created, many skipped | Domains filter — set correct email domains on the config |
| User can sync but cannot login | Need delegated permissions + redirect URI for OIDC login |
