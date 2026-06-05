# Refex Super App - Complete User Guide

## Admin & User Flow Documentation

**Version**: 2.0 | **Last Updated**: May 13, 2026

---

# Table of Contents

- [Part A: User Role - Complete Flow](#part-a-user-role)
- [Part B: Admin Role - Complete Flow](#part-b-admin-role)
- [Part C: Page-by-Page Detailed Reference](#part-c-page-by-page-reference)

---

# PART A: USER ROLE

## What a Regular User Can Access

| Page | Sidebar Label | Purpose |
|---|---|---|
| App Launcher | App Launcher | View and launch assigned applications |
| App Catalog | App Catalog | Browse all apps and request access |
| Access Requests | Access Requests | Track submitted access requests |

Regular users are redirected to `/launcher` if they try to access any admin page.

---

## A1. Login

**URL**: `/login`

**Page Layout**:
- Left side: Auto-rotating carousel showcasing Refex business verticals (Ash Utilization, Green Mobility, Venwind)
- Right side: Refex logo, "Super App" heading, email + password form

**Steps**:
1. Enter your **Email Address** (e.g., `john.doe@refex.co.in`)
2. Enter your **Password**
   - Default password for HR-synced users: `Welcome@2026`
   - Click the eye icon to show/hide password
3. Click **Sign In**
4. On success: Redirected to **App Launcher** (`/launcher`)
5. On failure: Red error toast message appears (e.g., "Invalid credentials")

**Notes**:
- Sessions last 30 days (no re-login needed)
- If accessing a specific app URL, you'll be redirected there after login (SP-initiated SSO)

---

## A2. App Launcher (My Apps)

**URL**: `/launcher`
**Sidebar**: App Launcher

**What You See**:
- Greeting header: "Good morning/afternoon/evening, **[Your Name]**"
- Search bar to filter apps
- Grid of application tiles (4 columns on desktop, 2 on mobile)
- Each tile shows: App logo, App name, App type (SAML/OIDC)

**How to Launch an App**:
1. Click on any app tile
2. For **SAML apps**: A new browser tab opens, SAML SSO happens automatically, you're logged into the app (e.g., Kissflow)
3. For **OIDC apps**: Redirected to the app via OAuth2 flow
4. On **Mobile (PWA/Android)**: App opens in the same window for seamless native experience

**Search**:
- Type in the search bar to filter apps by name
- Results update in real-time as you type

**What If an App Is Missing?**:
- You don't have access. Go to **App Catalog** to request it.

---

## A3. App Catalog (Request Access)

**URL**: `/catalog`
**Sidebar**: App Catalog

**What You See**:
- All available apps in the organization (both apps you have and don't have access to)
- Each app card shows:
  - App name, type, and description
  - A status button:
    - **"Launch"** (green) = You have access
    - **"Request Access"** (blue) = You can request
    - **"Pending"** (amber) = Request submitted, waiting for admin
    - **"Approved"** (green check) = Already approved

**How to Request Access**:
1. Find the app you need
2. Click **"Request Access"**
3. A confirmation toast: "Access requested! An admin will review your request."
4. The button changes to **"Pending"**
5. Admin receives an email notification
6. Once approved, the app appears in your **App Launcher**

---

## A4. Access Requests (Track Your Requests)

**URL**: `/access-requests`
**Sidebar**: Access Requests

**What You See**:
- List of all your access requests with status badges:
  - **Pending** (amber clock icon) - Waiting for admin review
  - **Approved** (green check) - Access granted
  - **Rejected** (red X) - Access denied

**Columns**: App Name, Request Date, Status, Reviewed By, Review Date

---

## A5. Profile & Account

**Location**: Bottom-left corner of sidebar

**What You See**:
- Your avatar (initials or uploaded photo)
- Your name and role
- **Sign Out** button

**Upload Profile Picture**:
1. Click on your avatar in the sidebar
2. Click the camera icon
3. Select an image file (JPG/PNG)
4. Photo uploads automatically and replaces the initials

**Sign Out**:
1. Click **Sign Out** at the bottom of the sidebar
2. You're returned to the login page
3. Token is cleared from browser

---

# PART B: ADMIN ROLE

## What an Admin Can Access (Full Sidebar)

| Section | Pages | Purpose |
|---|---|---|
| **Overview** | Dashboard, App Launcher, App Catalog | Stats + app access |
| **Applications** | SAML Apps, OIDC Apps | Configure SSO apps |
| **Identity & Access** | Users, Groups, Roles, Policies, Access Requests | Manage users + permissions |
| **Compliance** | Audit Logs, HR Sync, SCIM Setup | Monitoring + integrations |

Admins see everything regular users see, plus all management pages.

---

## B1. Dashboard

**URL**: `/` (homepage for admins)
**Sidebar**: Dashboard

**Stat Cards** (8 tiles):

| Card | Metric | Description |
|---|---|---|
| Total Users | 1,155 | All users in the organization (shows active count) |
| Groups | 0 | Number of user groups created |
| Roles | 3 | Number of RBAC roles defined |
| SAML Apps | 6 | Number of SAML service providers |
| OIDC Apps | 2 | Number of OIDC clients |
| Policies | 0 | Number of access policies |
| Pending Requests | 1 | App access requests awaiting review |
| Logins (7 Days) | 38 | Total login events in the past week |

**Quick Actions** (6 shortcut cards):

| Action | Description | Navigates To |
|---|---|---|
| Add SAML App | Configure new SAML 2.0 application | `/apps/saml` |
| Add OIDC App | Configure new OpenID Connect application | `/apps/oidc` |
| Manage Users | Add, edit, or remove users | `/users` |
| Manage Groups | Create groups and assign roles | `/groups` |
| Access Requests | Review pending access requests | `/requests` |
| View Audit Logs | Monitor activity and compliance | `/audit` |

---

## B2. SAML Apps

**URL**: `/apps/saml`
**Sidebar**: Applications > SAML Apps

**Purpose**: Configure SAML 2.0 Service Provider integrations for SSO.

### App List View
- Table showing all SAML apps
- Columns: Name, Entity ID, ACS URL, Users Assigned, Actions
- Each row has: Edit, Delete, View Metadata, Kissflow Config, Test SSO, Manage Users buttons

### Create/Edit SAML App

**Fields**:

| Field | Required | Description | Example |
|---|---|---|---|
| Name | Yes | Display name | `Kissflow` |
| Description | No | App description | `Workflow platform` |
| Entity ID | Yes | SP Entity ID (from SP) | `https://refexgroup.kissflow.com/saml/` |
| ACS URL | Yes | Assertion Consumer Service URL | `https://refexgroup.kissflow.com/signin/2/AcCMptlq60zH/saml/?acs` |
| SLO URL | No | Single Logout URL | |
| Home URL | No | Post-SSO redirect URL | `https://refexgroup.kissflow.com/` |
| Logo | No | Upload PNG/JPG logo | Click upload button |
| Name ID Format | Yes | `emailAddress` (default) | |
| Sign Assertions | Yes | Toggle (default: ON) | |
| Sign Response | Yes | Toggle (default: ON) | |

### Actions Per App

| Button | What It Does |
|---|---|
| **View Metadata** | Shows SAML metadata XML (copy to paste into SP config) |
| **Kissflow Config** | Shows Kissflow-specific IdP settings (SSO URL, Entity ID, Certificate) |
| **Test SSO** | Generates a test SAML assertion and shows the XML (for debugging) |
| **Manage Users** | Open user assignment panel - add/remove users who can access this app |
| **Edit** | Modify app settings |
| **Delete** | Remove the app (requires confirmation) |

### Manage Users (per App)

1. Click **Users** icon on a SAML app row
2. A modal opens showing:
   - **Assigned Users** (with remove button for each)
   - **Add User** dropdown to search and assign new users
3. Only assigned users (+ admins) can SSO into this app

---

## B3. OIDC Apps

**URL**: `/apps/oidc`
**Sidebar**: Applications > OIDC Apps

**Purpose**: Configure OpenID Connect client applications.

### Create/Edit OIDC App

**Fields**:

| Field | Required | Description | Example |
|---|---|---|---|
| Name | Yes | Display name | `Canteen App` |
| Description | No | Description | |
| Redirect URIs | Yes | OAuth2 callback URLs (one per line) | `https://canteen.refex.co.in/callback` |
| Logout URIs | No | Post-logout redirect URLs | |
| Home URL | No | App URL after login | `https://canteen.refex.co.in/` |
| Logo | No | Upload PNG/JPG | |
| Scopes | Yes | `openid`, `profile`, `email` | Default all three |
| Grant Types | Yes | `authorization_code` | Default |

### After Creating

The app shows:
- **Client ID**: Auto-generated UUID (copy this)
- **Client Secret**: Auto-generated secret (shown once - copy it! Click eye icon to reveal)
- **Discovery URL**: `{PUBLIC_URL}/api/apps/oidc/{app_id}/.well-known/openid-configuration`

---

## B4. Users (User Management)

**URL**: `/users`
**Sidebar**: Identity & Access > Users

This is the most feature-rich page. It serves as the **User Master** for the entire organization.

### List View

**Header**: Shows total user count + search bar + action buttons

**Quick Filters** (7 filter chips at the top):

| Filter | What It Shows |
|---|---|
| All | All users |
| Active Only | Only active users |
| Disabled | Only disabled users |
| Missing Mobile | Users without work mobile number |
| Missing Email | Users without email (shouldn't exist) |
| No HR Sync | Users not synced from Adrenalin |
| Admins | Only org_admin users |

**Table Columns**: Name, Email, Role, Status, Department, Designation

**Search**: Searches across name, email, department, designation, employee ID

### Create User (+ Add User Button)

**Modal Fields**:

| Field | Required | Description |
|---|---|---|
| Email | Yes | User's email address |
| Full Name | Yes | Display name |
| Password | Yes | Initial password |
| Assign Apps | No | Checkboxes for each SAML app |

### Edit User

Click the pencil icon on any user row to open the edit modal.

**Editable Fields**:

| Field | Description |
|---|---|
| Full Name | Update display name |
| Status | `active` or `disabled` |
| Groups | Multi-select from available groups |
| Roles | Multi-select from available roles |
| Assign Apps | Checkboxes for SAML app access |

**Auto Kissflow Push**: When you save an edit, the user is automatically pushed to Kissflow via SCIM in the background.

### User Detail Panel (Slide-in)

Click on any user row (not edit/delete button) to open the **slide-in detail panel** from the right side.

**Sections Displayed**:

| Section | Fields |
|---|---|
| **Identity** | Employee ID, Title, First Name, Last Name, Gender, DOB, PAN Number |
| **Contact** | Email, Personal Email, Work Mobile, Personal Mobile, Pincode |
| **Organization** | Department, Dept Code, Designation, Grade, Company, Legal Entity, Business Line, Branch, Location, Office Location |
| **Employment** | Status, Status Description, Joining Date, Exit Date, Created Via, Last HR Sync |
| **L1 Manager** | Name, Email, Employee Code |
| **L2 Manager** | Name, Email, Employee Code |
| **System** | Role, Status, Group Memberships, Assigned Apps |

### Password Reset

1. Click the **key icon** on any user row
2. A modal opens: "Reset password for john.doe@refex.co.in"
3. Enter a new password (minimum 6 characters)
4. Click **Reset Password**
5. User can now login with the new password

### Export Users

**Two formats available** (download buttons in header):

| Format | Button | What It Exports |
|---|---|---|
| CSV | Download CSV | All visible users in comma-separated format |
| Excel | Download Excel | All visible users in .xlsx format with formatted columns |

**Exported Columns** (41 columns):
Employee ID, Title, First Name, Last Name, Full Name, Email, Personal Email, Work Mobile, Personal Mobile, Gender, DOB, PAN Number, Designation, Department, Dept Code, Grade, Company, Legal Entity, Business Line, Branch, Location, Office Location, Pincode, Employee Status, Employee Status Desc, Employment Status, Employment Status Desc, Joining Date, Date of Exit, Added On, L1 Manager Name, L1 Manager Email, L1 Manager Code, L2 Manager Name, L2 Manager Email, L2 Manager Code, System Role, Status, Created Via, Last HR Sync, Assigned Apps

### Delete User

1. Click the trash icon on any user row
2. Confirm the deletion
3. User is permanently removed

---

## B5. Groups

**URL**: `/groups`
**Sidebar**: Identity & Access > Groups

**Purpose**: Create user groups for organizational structuring and bulk role assignment.

### Create Group

| Field | Required | Description |
|---|---|---|
| Name | Yes | Group name (e.g., "IT Department") |
| Description | No | Group description |
| Parent Group | No | Select parent for hierarchy |
| Roles | No | Assign roles to the group |

### Manage Members

1. Click **Members** icon on a group row
2. Modal shows current members with remove buttons
3. **Add Member** dropdown to search and add users
4. All group members inherit the group's assigned roles

---

## B6. Roles

**URL**: `/roles`
**Sidebar**: Identity & Access > Roles

**Purpose**: Define RBAC roles with specific permissions.

### Create Role

| Field | Required | Description |
|---|---|---|
| Name | Yes | Role name (e.g., "Viewer", "Editor") |
| Description | No | What this role allows |
| Permissions | Yes | Select from available permissions |

### Available Permissions

| Permission | Description |
|---|---|
| `users.read` | View user list |
| `users.write` | Create/edit users |
| `users.delete` | Delete users |
| `apps.read` | View applications |
| `apps.write` | Configure applications |
| `audit.read` | View audit logs |
| `groups.write` | Manage groups |
| `roles.write` | Manage roles |
| `policies.write` | Manage access policies |
| `reports.read` | View reports |

---

## B7. Policies

**URL**: `/policies`
**Sidebar**: Identity & Access > Policies

**Purpose**: Create IP-based and time-based access restrictions for applications.

### Create Policy

| Field | Required | Description |
|---|---|---|
| Name | Yes | Policy name |
| Description | No | Policy description |
| Apps | Yes | Select which apps this policy applies to |
| Enabled | Yes | Toggle on/off |
| IP Whitelist | No | Only allow these IPs (CIDR format, e.g., `192.168.1.0/24`) |
| IP Blacklist | No | Block these IPs |
| Time Restrictions | No | Restrict access to specific hours |

**How It Works**:
- When a user tries to SSO into an app, the system checks all active policies
- If the user's IP is blacklisted or not in the whitelist, access is denied
- The App Launcher shows a lock icon on restricted apps with the reason

---

## B8. Access Requests

**URL**: `/requests`
**Sidebar**: Identity & Access > Access Requests

**Purpose**: Review and approve/reject user requests for app access.

### Admin View

**Filter Tabs**: All | Pending | Approved | Rejected

**For Each Request**:

| Column | Description |
|---|---|
| User | Requester's name and email |
| App | Requested application name |
| Reason | Why they need access |
| Date | When request was submitted |
| Status | Pending / Approved / Rejected |

### Approve/Reject

1. Click **Approve** (green check) or **Reject** (red X) on a pending request
2. If approved: User's ID is added to the app's `approved_user_ids`, the app appears in their Launcher
3. If rejected: Status changes to "Rejected", user sees this in their request list
4. Email notification is sent to the user in both cases

---

## B9. Audit Logs

**URL**: `/audit`
**Sidebar**: Compliance > Audit Logs

**Purpose**: View all activity in the system for compliance and security monitoring.

### Filters

| Filter | Options |
|---|---|
| Action | `user_created`, `user_updated`, `user_deleted`, `password_reset`, `login`, `app_created`, `access_approved`, etc. |
| Resource Type | `user`, `app`, `group`, `role`, `policy` |

### Log Entry Fields

| Column | Description |
|---|---|
| Timestamp | When the action occurred |
| User | Who performed the action (name + email) |
| Action | What was done |
| Resource | What was affected |
| Details | Specific changes (JSON) |
| IP Address | User's IP address |
| Status | Success / Failure |

### Summary Panel

Top of page shows summary stats:
- Total events
- Events today
- Unique users
- Top actions breakdown

### Export

Click **Export CSV** to download all visible logs as a CSV file.

---

## B10. HR Sync

**URL**: `/hr-sync`
**Sidebar**: Compliance > HR Sync

**Purpose**: Manage the Adrenalin HRMS employee sync.

### What You See

- **Last Sync Result** card showing: Created, Disabled, Updated, Total, Errors
- **Sync Now** button to trigger immediate sync
- **Sync History** table showing all past syncs with timestamps and results

### How It Works

1. **Automatic**: Runs every day at midnight UTC via APScheduler
2. **Manual**: Click **Sync Now** to run immediately
3. **What It Does**:
   - Fetches all employees from Adrenalin HRMS API
   - Creates new users for new employees (default password: `Welcome@2026`)
   - Disables users for exited employees
   - Updates 30+ HR fields for all existing employees
   - Resolves L1 Manager and L2 Manager email addresses
   - Pushes changes to Kissflow via SCIM (if configured)
   - Sends email report to all admins

### Sync Log Columns

| Column | Description |
|---|---|
| Timestamp | When sync ran |
| Triggered By | "Scheduled" or admin user |
| Created | New users created |
| Disabled | Users disabled (exited employees) |
| Updated | Existing users updated |
| Total | Total employees processed |
| Errors | Number of errors (expandable) |

---

## B11. SCIM Setup

**URL**: `/scim`
**Sidebar**: Compliance > SCIM Setup

**Purpose**: Manage both outbound Kissflow SCIM push and inbound SCIM token management.

### Tab 1: Push to Kissflow (Outbound)

#### Kissflow SCIM Configuration

| Field | Description |
|---|---|
| SCIM Base URL | `https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/` |
| Bearer Token | Kissflow SCIM API token (masked after save) |
| Status Badge | "Connected" (green) when configured |
| Source | "from environment" or "from database" |

**Save Configuration**: Enter/update the URL and token, click Save.

#### Push Users to Kissflow

| Button | What It Does |
|---|---|
| **Sync Now** | Pushes all IAM users to Kissflow (runs in background) |
| **Link Managers** | Second pass: resolves Manager/L2 Manager lookup fields using Kissflow User IDs |

**Sync Process**:
1. Click **Sync Now**
2. Toast: "Sync started in background"
3. Page auto-refreshes every 10 seconds
4. When complete, shows result cards: Created, Updated, Deactivated, Auth Errors, Errors

**After Sync Now, always run Link Managers** to properly link the Manager and L2 Manager fields in Kissflow.

#### Sync Result Cards

| Card | Description |
|---|---|
| Created | Users newly created in Kissflow |
| Updated | Users already in Kissflow that were updated |
| Deactivated | Disabled users deactivated in Kissflow |
| Auth Errors | Token/permission errors (check token validity) |
| Errors | Other errors (expandable list) |

#### Sync History

| Column | Description |
|---|---|
| Status Icon | Green check (success), Red X (errors), Spinning (running) |
| Result | "X created, Y updated" or "Failed" or "Syncing..." |
| Type | Manual (Full), Manual (email), Resolve Managers, Auto (HR Sync) |
| Timestamp | When sync was triggered |
| Details | Users processed, error count |

### Tab 2: Inbound SCIM Tokens

**Purpose**: Generate bearer tokens for external IdPs (OneLogin, Okta, Azure AD) to push users INTO your system.

#### Setup Guide (shown on page)
1. Generate a SCIM token below
2. In Kissflow/OneLogin, go to SCIM Configuration
3. Paste the SCIM Base URL and Bearer Token
4. Test the connection

#### Generate Token

1. Enter a **label** (e.g., "OneLogin Production")
2. Click **Generate**
3. A yellow banner shows the new token - **copy it immediately** (shown only once)
4. Two values to copy:
   - **SCIM Base URL**: `https://superapp.refex.group/api/scim/v2/`
   - **Bearer Token**: The generated token

#### Active Tokens

List of all generated tokens with:
- Label name
- Created date
- SCIM Base URL
- **Revoke** button (red trash icon) to deactivate

---

# PART C: PAGE-BY-PAGE REFERENCE

## Navigation Structure

### Admin Sidebar

```
OVERVIEW
  +-- Dashboard            (/)
  +-- App Launcher          (/launcher)
  +-- App Catalog           (/catalog)

APPLICATIONS (collapsible)
  +-- SAML Apps             (/apps/saml)
  +-- OIDC Apps             (/apps/oidc)

IDENTITY & ACCESS (collapsible)
  +-- Users                 (/users)
  +-- Groups                (/groups)
  +-- Roles                 (/roles)
  +-- Policies              (/policies)
  +-- Access Requests       (/requests)

COMPLIANCE
  +-- Audit Logs            (/audit)
  +-- HR Sync               (/hr-sync)
  +-- SCIM Setup            (/scim)

PROFILE (bottom)
  +-- [Avatar] Name / Role
  +-- Sign Out
```

### User Sidebar

```
OVERVIEW
  +-- App Launcher          (/launcher)
  +-- App Catalog           (/catalog)

PROFILE (bottom)
  +-- [Avatar] Name / Role
  +-- Sign Out
```

---

## Complete Admin Setup Checklist

Follow this order when setting up the system for the first time:

### Step 1: Organization Setup
- [x] Organization created during first registration
- [x] Domain configured (e.g., `refex.co.in`)

### Step 2: Configure SAML Applications
1. Go to **SAML Apps** > Click **+ Add SAML App**
2. Fill in Entity ID, ACS URL from the Service Provider (e.g., Kissflow)
3. Upload the app logo
4. Set Home URL (where users land after SSO)
5. Save the app
6. Click **View Metadata** > Copy the XML > Paste into Kissflow IdP settings
7. Or click **Kissflow Config** for pre-formatted settings

### Step 3: Configure OIDC Applications
1. Go to **OIDC Apps** > Click **+ Add OIDC App**
2. Fill in redirect URIs, scopes
3. Save > Copy **Client ID** and **Client Secret**
4. Configure the external app with these credentials

### Step 4: Set Up HR Sync
1. Ensure `backend/.env` has Adrenalin API credentials
2. Go to **HR Sync** > Click **Sync Now**
3. Verify users are created from Adrenalin data
4. Confirm the nightly midnight auto-sync is working

### Step 5: Configure Kissflow SCIM Push
1. Go to **SCIM Setup** > **Push to Kissflow** tab
2. Enter Kissflow SCIM Base URL and Token
3. Click **Save Configuration**
4. Click **Sync Now** to push all users
5. After sync completes, click **Link Managers** to resolve manager lookups

### Step 6: Assign Users to Apps
1. Go to **SAML Apps** > Click **Users** on each app
2. Add users who should have access
3. Or go to **Users** > **Edit** any user > Check the app boxes

### Step 7: Create Roles & Groups (Optional)
1. Go to **Roles** > Create roles with specific permissions
2. Go to **Groups** > Create groups and assign roles
3. Add users to groups for bulk permission management

### Step 8: Set Up Access Policies (Optional)
1. Go to **Policies** > Create IP/time-based restrictions
2. Assign policies to specific apps

### Step 9: Generate Inbound SCIM Tokens (Optional)
1. Go to **SCIM Setup** > **Inbound SCIM Tokens** tab
2. Generate tokens for OneLogin/Okta/Azure AD if needed

### Step 10: Verify Everything
1. **Test SSO**: Go to SAML Apps > Click Test SSO on each app
2. **Check Audit Logs**: Verify login and SSO events are recorded
3. **Test as User**: Login as a regular user, verify they see only their assigned apps
4. **Check Kissflow**: Verify user data (Employee ID, Manager, L2 Manager) populated correctly

---

## Common Admin Tasks - Quick Reference

| Task | Where | Steps |
|---|---|---|
| Add a new user manually | Users > + Add User | Fill email, name, password, assign apps |
| Reset a user's password | Users > Key icon | Enter new password > Reset |
| Disable a user | Users > Edit > Status: disabled | Save (auto-pushed to Kissflow) |
| Assign an app to a user | Users > Edit > Check app boxes | Or: SAML Apps > Users > Add |
| Export user list | Users > Download button | Choose CSV or Excel |
| Check sync status | HR Sync or SCIM Setup | View sync history |
| Approve access request | Access Requests > Approve | Green check button on pending request |
| View login history | Audit Logs > Filter: login | See who logged in, when, from where |
| Add new Kissflow module | SAML Apps > + Add | Use same Entity ID, different Home URL |
| Update SCIM token | SCIM Setup > Push to Kissflow | Enter new token > Save Configuration |
| Debug SSO issue | SAML Apps > Test SSO | Inspect the generated SAML assertion |
| Run HR sync manually | HR Sync > Sync Now | View results and errors |
| Push single user to Kissflow | Via API: POST /api/kissflow-scim/push-user | `{"email": "user@refex.co.in"}` |

---

## Error Messages & Solutions

| Error | Page | Cause | Solution |
|---|---|---|---|
| "Invalid credentials" | Login | Wrong password | Try `Admin123!` or `Welcome@2026` or reset via admin |
| "Access denied" | App Launcher | User not assigned to app | Admin assigns user in SAML Apps > Users |
| "Policy blocked" | App Launcher | IP/time policy active | Check Policies page, whitelist user's IP |
| "SCIM suspended" | SCIM Setup sync | Kissflow SCIM disabled | Enable SCIM in Kissflow Admin |
| "Auth errors" | SCIM Setup sync | Token expired | Generate new token in Kissflow, update in config |
| "429 rate limited" | SCIM sync logs | Too many requests | System retries automatically, wait and retry |
| "Sync failed: 502" | Old sync attempts | Timeout on large sync | Fixed: sync now runs in background |
| "HR sync: 0 created" | HR Sync | All employees already synced | Normal if no new hires |
| "Manager: empty" | Kissflow user | Manager not in Kissflow yet | Run "Link Managers" after full sync |

---

*Confidential - Refex Group Internal Use Only*
*Super App by Refex AI Team*
