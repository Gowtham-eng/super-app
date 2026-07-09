# Kissflow IAM Integration - Complete Technical Document

## Refex Super App x Kissflow SSO & User Provisioning

**Version**: 3.0 | **Last Updated**: May 19, 2026 | **Classification**: Confidential

---

# Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication Flows](#2-authentication-flows)
3. [SAML 2.0 Configuration](#3-saml-20-configuration)
4. [Application Routing & Deep Linking](#4-application-routing--deep-linking)
5. [User Provisioning (SCIM v2)](#5-user-provisioning-scim-v2)
6. [HR Sync Pipeline](#6-hr-sync-pipeline)
7. [Kissflow Field Mapping](#7-kissflow-field-mapping)
8. [App Launcher Architecture](#8-app-launcher-architecture)
9. [Access Control Model](#9-access-control-model)
10. [Mobile SSO Flow](#10-mobile-sso-flow)
11. [Microsoft Entra ID Integration](#11-microsoft-entra-id-integration)
12. [Configuration Reference](#12-configuration-reference)
13. [Troubleshooting Guide](#13-troubleshooting-guide)
14. [Data Flow Diagrams](#14-data-flow-diagrams)

---

# 1. Architecture Overview

## 1.1 System Roles

| System | Role | Protocol |
|---|---|---|
| **Refex Super App** | Identity Provider (IdP) | SAML 2.0, OIDC |
| **Kissflow** | Service Provider (SP) | SAML 2.0 |
| **Kissflow** | SCIM Server | SCIM v2 |
| **Refex Super App** | SCIM Client | SCIM v2 (outbound push) |
| **Refex Super App** | SCIM Server | SCIM v2 (inbound from OneLogin/Okta) |
| **Adrenalin HRMS** | HR Data Source | REST API |
| **Microsoft Entra ID** | External IdP (Extrovis) | SAML 2.0 |

## 1.2 High-Level Data Flow

```
+-------------------+       REST API         +-------------------+
|   Adrenalin HRMS  | ---(Nightly Sync)----> |   Refex Super App |
|   (1,157 employees)|                       |   (MongoDB)       |
+-------------------+                        +---------+---------+
                                                       |
                                    +------------------+------------------+
                                    |                                     |
                               SCIM v2 Push                        SAML 2.0 SSO
                                    |                                     |
                           +--------v--------+                   +--------v--------+
                           |    Kissflow     |                   |    Kissflow     |
                           |  User Accounts  |                   |   Application   |
                           |  (1,142 synced) |                   |   (6 modules)   |
                           +-----------------+                   +-----------------+
```

## 1.3 Integrated Applications

### SAML Applications (Kissflow Modules)

| App Name | Kissflow Module | Home URL | Status |
|---|---|---|---|
| Kissflow (Primary) | Home/Explorer | `refexgroup.kissflow.com` | Active (hidden from launcher) |
| Expense Management | EMS_001_A00 | `refexgroup.kissflow.com/view/application/EMS_001_A00` | Active |
| Travel Management | Expense_and_Travel_Management_A00 | `refexgroup.kissflow.com/view/application/Expense_and_Travel_Management_A00` | Active |
| Lead Tracker | Lead_Trcaker_A00 | `refexgroup.kissflow.com/view/application/Lead_Trcaker_A00` | Active |
| Vendor Management | Contract_Management_A00 | `development-refexgroup.kissflow.com/...` | Hidden |
| Asset Management | - | - | Hidden |

### OIDC Applications

| App Name | Home URL | Status |
|---|---|---|
| Canteen App | `canteen.refex.group` | Active |
| Coal & Ash | Frappe Cloud (triphub) | Active |

### External SAML (Entra ID)

| App Name | SP Entity ID | ACS URL | Status |
|---|---|---|---|
| Extrovis | `sts.windows.net/24ac5b78-...` | `login.microsoftonline.com/.../saml2` | Active |

### Placeholder Apps (Coming Soon)

| App Name | Category | Description |
|---|---|---|
| Procure To Pay | Expense | Procurement & payment |
| Adrenalin ESS | Productivity | Employee self-service |
| Project Management | Productivity | Task tracker |
| Adrenalin HRMS | Facility | HR management |
| Refex Mobility | Facility | Fleet management |
| Tech Support | Support | IT helpdesk |
| Admin Support | Support | Administrative |
| HR Support | Support | HR queries |

---

# 2. Authentication Flows

## 2.1 IdP-Initiated SSO (App Launcher -> Kissflow)

This is the **primary flow** when users click apps from the Super App Launcher.

```
Step 1: User clicks "Expense Management" in App Launcher
            |
Step 2: Browser calls GET /api/saml/{app_id}/complete?token={jwt}
            |
Step 3: Backend validates JWT token
            |
Step 4: Backend checks user has access to app (or sibling app with same ACS)
            |
Step 5: Backend generates SAML Response XML:
            - Issuer = Primary Kissflow app's Entity ID
            - NameID = user's email
            - Certificate/Key = Primary app's certificate
            - AudienceRestriction = Kissflow's Entity ID
            |
Step 6: Backend signs the SAML Response (RSA-SHA256)
            |
Step 7: Backend returns HTML with auto-submit form:
            - action = Kissflow ACS URL
            - SAMLResponse = base64-encoded signed XML
            - RelayState = Module's home_url (e.g., /view/application/EMS_001_A00)
            |
Step 8: Browser auto-submits form to Kissflow
            |
Step 9: Kissflow validates SAML signature against stored certificate
            |
Step 10: Kissflow creates session for user
            |
Step 11: Kissflow reads RelayState and redirects to the specific module
            |
Step 12: User lands directly in Expense Management module
```

### Key Design Decision: RelayState for Module Deep-Linking

All Kissflow modules share a **single SAML connection** (same Entity ID, same ACS URL). To route users to the correct module after SSO:

- The Super App sets `RelayState` to the module's `home_url`
- Kissflow processes SAML, authenticates the user, then uses RelayState to redirect to the specific module
- This eliminates the need for iframe-based authentication hacks

## 2.2 SP-Initiated SSO (Kissflow -> Super App -> Kissflow)

When users access Kissflow directly (or via Kissflow mobile app):

```
Step 1: User visits refexgroup.kissflow.com directly
            |
Step 2: Kissflow detects SSO is configured
            |
Step 3: Kissflow sends SAMLRequest to Super App SSO endpoint
            - Includes RelayState (for Kissflow's own redirect needs)
            |
Step 4: Super App receives SAMLRequest at /api/saml/{app_id}/sso
            |
Step 5: If user has active JWT session:
            -> Generate SAML Response immediately
        If NOT:
            -> Redirect to /login?sso_app={app_id}
            -> After login, redirect back to SSO endpoint
            |
Step 6: Submit SAML Response to Kissflow ACS URL
            - RelayState passed through EXACTLY as received from Kissflow
            |
Step 7: Kissflow validates and logs user in
            - Uses its own RelayState to handle deep-linking/mobile return
```

### Critical Rule: RelayState Passthrough

For **SP-initiated SSO**, the RelayState received from Kissflow must be returned **unchanged**. Kissflow uses it for:
- Deep-linking to specific pages
- Mobile app return flow
- Internal state management

## 2.3 SAML Response Structure

```xml
<samlp:Response
    ID="_unique_id"
    Version="2.0"
    IssueInstant="2026-05-19T10:00:00Z"
    Destination="https://refexgroup.kissflow.com/signin/2/AcCMptlq60zH/saml/?acs">
    
    <saml:Issuer>https://superapp.refex.group/api/saml/{primary_app_id}</saml:Issuer>
    
    <samlp:Status>
        <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
    </samlp:Status>
    
    <saml:Assertion ID="_unique_id" Version="2.0" IssueInstant="2026-05-19T10:00:00Z">
        <saml:Issuer>https://superapp.refex.group/api/saml/{primary_app_id}</saml:Issuer>
        
        <!-- XML Signature (RSA-SHA256) -->
        <ds:Signature>...</ds:Signature>
        
        <saml:Subject>
            <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
                user@refex.co.in
            </saml:NameID>
            <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
                <saml:SubjectConfirmationData
                    NotOnOrAfter="2026-05-19T10:05:00Z"
                    Recipient="https://refexgroup.kissflow.com/signin/2/AcCMptlq60zH/saml/?acs"/>
            </saml:SubjectConfirmation>
        </saml:Subject>
        
        <saml:Conditions NotBefore="..." NotOnOrAfter="...">
            <saml:AudienceRestriction>
                <saml:Audience>https://refexgroup.kissflow.com/saml/</saml:Audience>
            </saml:AudienceRestriction>
        </saml:Conditions>
        
        <saml:AuthnStatement AuthnInstant="..." SessionIndex="_session_id">
            <saml:AuthnContext>
                <saml:AuthnContextClassRef>
                    urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
                </saml:AuthnContextClassRef>
            </saml:AuthnContext>
        </saml:AuthnStatement>
        
        <saml:AttributeStatement>
            <saml:Attribute Name="email">
                <saml:AttributeValue>user@refex.co.in</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="firstName">
                <saml:AttributeValue>John</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="lastName">
                <saml:AttributeValue>Doe</saml:AttributeValue>
            </saml:Attribute>
        </saml:AttributeStatement>
    </saml:Assertion>
</samlp:Response>
```

---

# 3. SAML 2.0 Configuration

## 3.1 Super App as IdP

| Parameter | Value |
|---|---|
| **Protocol** | SAML 2.0 |
| **Signing Algorithm** | RSA-SHA256 |
| **Digest Algorithm** | SHA-256 |
| **Certificate** | RSA 2048-bit, self-signed (auto-generated per app) |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| **NameID Value** | User's email address |
| **Assertion Validity** | 5 minutes |
| **Binding** | HTTP-POST |

## 3.2 Kissflow as SP

| Parameter | Value |
|---|---|
| **Entity ID** | `https://refexgroup.kissflow.com/saml/` |
| **ACS URL** | `https://refexgroup.kissflow.com/signin/2/AcCMptlq60zH/saml/?acs` |
| **Account ID** | `AcCMptlq60zH` |

## 3.3 IdP URLs (to configure in Kissflow)

| Setting | URL |
|---|---|
| **IdP Entity ID** | `https://superapp.refex.group/api/saml/{app_id}` |
| **IdP SSO URL** | `https://superapp.refex.group/api/saml/{app_id}/sso` |
| **IdP SLO URL** | `https://superapp.refex.group/api/saml/{app_id}/slo` |
| **Metadata** | `https://superapp.refex.group/api/apps/saml/{app_id}/metadata` |

## 3.4 Multi-App Single SAML Connection Architecture

Kissflow has a **single SAML integration** (one Entity ID, one ACS URL). The Super App creates **multiple app entries** that all share this SAML connection:

```
Super App                           Kissflow
+----------------------------+      +-------------------+
| Expense Management [app_1] |--+   |                   |
| Travel Management  [app_2] |--+-->| Single SAML       |
| Lead Tracker       [app_3] |--+   | Connection        |
| Kissflow (Primary) [app_0] |--+   | Entity ID: .../saml/ |
+----------------------------+      | ACS URL: .../saml/?acs |
                                    +-------------------+
```

**Primary App Detection**: When generating a SAML assertion for any sub-app, the system finds the **primary app** (first created with same entity_id + acs_url) and uses its:
- Issuer URL
- Signing certificate
- Private key

This ensures Kissflow always sees the same IdP identity regardless of which module the user clicked.

---

# 4. Application Routing & Deep Linking

## 4.1 How Module Deep-Linking Works

Each Kissflow module has a unique URL pattern:

| Module | URL Pattern |
|---|---|
| Home/Explorer | `refexgroup.kissflow.com/view/home/explorer/all` |
| Expense Management | `refexgroup.kissflow.com/view/application/EMS_001_A00` |
| Travel Management | `refexgroup.kissflow.com/view/application/Expense_and_Travel_Management_A00` |
| Lead Tracker | `refexgroup.kissflow.com/view/application/Lead_Trcaker_A00` |
| Vendor Management | `refexgroup.kissflow.com/view/application/Contract_Management_A00` |
| Procure To Pay | `refexgroup.kissflow.com/view/application/refex_new_test_A00/page/...` |

## 4.2 Routing Logic

```
User clicks app in Launcher
    |
    v
Does app have home_url?
    |
    +-- YES: Submit SAML with RelayState = home_url
    |        -> Kissflow authenticates -> Redirects to module via RelayState
    |
    +-- NO:  Submit SAML without RelayState
             -> Kissflow authenticates -> Lands on Kissflow homepage
```

## 4.3 Access Check Logic

```python
# Simplified access check flow
1. Check: Is user an org_admin? -> YES = access granted
2. Check: Is user in app's approved_user_ids? -> YES = access granted
3. Check: Is user in a group that has access? -> YES = access granted
4. If app shares ACS URL with siblings:
   - Check siblings for access (any match = access granted)
5. All checks failed -> Access denied
```

---

# 5. User Provisioning (SCIM v2)

## 5.1 Outbound Push: Super App -> Kissflow

### Endpoint Configuration

| Parameter | Value |
|---|---|
| **SCIM Base URL** | `https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/` |
| **Auth** | Bearer Token |
| **Token** | Configured in DB or environment |
| **Account ID** | `AcCMptlq60zH` |

### Push Operations

| Operation | HTTP Method | URL |
|---|---|---|
| Search user | `GET` | `{base}/Users?filter=userName eq "{email}"` |
| Create user | `POST` | `{base}/Users` |
| Update user | `PUT` | `{base}/Users/{kissflow_user_id}` |
| Deactivate | `PATCH` | `{base}/Users/{kissflow_user_id}` (set active=false) |

### Sync Modes

| Mode | Trigger | Description |
|---|---|---|
| **Nightly Auto-Sync** | APScheduler (00:00 UTC) | After Adrenalin HR sync, pushes all changed users |
| **Manual Full Sync** | Admin: SCIM Setup > Sync Now | Background task, pushes all 1,157 users |
| **Manual Single Push** | Admin: User edit or API call | Pushes one user immediately |
| **Manager Resolution** | Admin: SCIM Setup > Link Managers | Second pass to link Manager/L2 Manager lookups |
| **Real-time Push** | Admin edits user in User Master | Auto-triggered on save |

### Rate Limiting & Error Handling

| Feature | Value |
|---|---|
| Delay between requests | 0.25 seconds |
| Retry on 429 | 3 retries (5s, 10s, 15s backoff) |
| Auth error threshold | Stops after 5 consecutive 401/403 |
| Create-only mode | Skips search for users without `kissflow_user_id` |
| Progress logging | Every 100 users |

## 5.2 Inbound SCIM: External IdP -> Super App

The Super App also runs a **SCIM v2 Server** for receiving user provisioning from external IdPs:

| Endpoint | Purpose |
|---|---|
| `GET /api/scim/v2/ServiceProviderConfig` | Capabilities |
| `GET /api/scim/v2/Schemas` | Schema discovery |
| `GET/POST/PUT/PATCH/DELETE /api/scim/v2/Users` | User CRUD |
| `GET/POST/PATCH/DELETE /api/scim/v2/Groups` | Group CRUD |

Auth: Bearer tokens generated in SCIM Setup page.

---

# 6. HR Sync Pipeline

## 6.1 Full Pipeline Flow

```
00:00 UTC - APScheduler Cron Trigger
    |
    v
PHASE 1: Authenticate with Adrenalin API
    POST /Authorization/UserLogin
    Credentials: REFEX / {password} / SHERISHA
    |
    v
PHASE 2: Fetch All Employees (Paginated)
    POST /Employee/GetEmployeeDetails
    Page size: 100, iterate until empty
    Total: ~1,157 employees
    |
    v
PHASE 3: Build Supervisor Lookup
    Map: Employee_Code -> Employee record
    Used to resolve L1 and L2 manager emails
    |
    v
PHASE 4: Process Each Employee
    +-- New + Active -> CREATE user (password: Welcome@2026)
    +-- Existing + Exited -> DISABLE user
    +-- Existing + Active -> UPDATE all 30+ fields
    |
    v
PHASE 5: Resolve Manager Hierarchy
    For each employee:
      L1 Manager = Direct supervisor (from EMPLOYEE_REPORTING_TO)
      L2 Manager = Supervisor's supervisor (lookup chain)
    |
    v
PHASE 6: Push to Kissflow via SCIM
    All created/updated/disabled users
    Uses create-only mode for new users
    |
    v
PHASE 7: Send Email Report
    Recipients: All org_admin users
    Content: Created, disabled, updated counts + errors
    |
    v
PHASE 8: Log Results
    -> hr_sync_logs collection
    -> kissflow_sync_logs collection
```

## 6.2 Adrenalin API Configuration

| Parameter | Value |
|---|---|
| Base URL | `https://refex.myadrenalin.com/JASON_DYNAMIC_API/SHERISHA/V1/JasonBase` |
| Auth Endpoint | `/Authorization/UserLogin` |
| Employee Endpoint | `/Employee/GetEmployeeDetails` |
| Company ID | `SHERISHA` |
| Credentials | `REFEX` / `{password}` |

---

# 7. Kissflow Field Mapping

## 7.1 SCIM Core Schema Fields

| Super App Field | SCIM Field | Kissflow Column |
|---|---|---|
| `email` | `userName` | Email |
| `first_name` | `name.givenName` | First Name |
| `last_name` | `name.familyName` | Last Name |
| `name` / `full_name` | `displayName` | Display Name |
| `name` / `full_name` | `nickName` | Nick Name |
| `designation` | `title` | Title |
| `status == active` | `active` | Active |
| `work_mobile` | `phoneNumbers[type=work]` | Phone (Work) |
| `employee_mobile` | `phoneNumbers[type=mobile]` | Phone (Mobile) |

## 7.2 Kissflow Custom Extension Schema

**Schema URI**: `urn:kissflow:scim:schemas:extension:AcCMptlq60zH:2:User`

| Super App Field | Extension Field | Type | Kissflow Column |
|---|---|---|---|
| `adrenalin_employee_id` | `Employee_ID` | string | Employee ID |
| `designation` | `Designation_1` | string | Designation |
| `department_code` | `Department_Code` | string | Department Code |
| `branch_code` | `Branch` | string | Branch |
| `location` | `Location_1` | string | Location |
| `office_location` | `Office_Location` | string | Office Location |
| `employee_status_description` | `Employee_Status` | string | Employee Status |
| `date_of_exit` | `Date_of_Exit` | string | Date of Exit |
| `supervisor_email` | `Manager.Email` | complex | Manager (Lookup) |
| `supervisor_name` | `Manager.Name` | complex | Manager Name |
| `supervisor_kf_id` | `Manager.value` | complex | Manager ID (for lookup resolution) |
| `supervisor_email` | `L1_Manager_Email` | string | L1 Manager Email |
| `supervisor_name` | `L1_Manager_Name` | string | L1 Manager Name |
| `l2_manager_email` | `L2_Manager.Email` | complex | L2 Manager (Lookup) |
| `l2_manager_name` | `L2_Manager.Name` | complex | L2 Manager Name |
| `l2_manager_kf_id` | `L2_Manager.value` | complex | L2 Manager ID |

## 7.3 Manager Resolution (Two-Pass Process)

**Problem**: Kissflow's `Manager` and `L2_Manager` fields are lookup fields that require the manager's **Kissflow internal User ID** to display correctly. On first sync, managers may not have Kissflow IDs yet.

**Solution**: Two-pass sync:

```
Pass 1: Create/Update all users
    -> Each user gets a kissflow_user_id stored in MongoDB
    -> Manager fields sent with Email/Name only

Pass 2: Resolve Managers (triggered separately)
    -> Build email -> kissflow_user_id mapping from MongoDB
    -> For each user with a supervisor/l2_manager:
       -> Look up manager's Kissflow ID
       -> PUT update with Manager.value = Kissflow ID
    -> Kissflow resolves the lookup and shows manager name with link
```

---

# 8. App Launcher Architecture

## 8.1 Category-Based Grouping

| Category | Icon | Apps |
|---|---|---|
| **Expense** | DollarSign (green) | Expense Management, Travel Management, Procure To Pay |
| **Productivity** | Zap (blue) | Coal & Ash, Lead Tracker, Adrenalin, Project Management |
| **Facility** | Building (violet) | Adrenalin HRMS, Canteen App, Refex Mobility |
| **Support** | Headphones (amber) | Tech Support, Admin Support, HR Support |

## 8.2 App Ordering

Apps within each category are ordered by `sort_order` field in the database.

## 8.3 Placeholder Apps

Apps with `is_placeholder: true` display a "Coming Soon" badge and show a toast notification instead of launching.

## 8.4 Refexions Chatbot

A floating chat widget in the bottom-right corner branded as "Refexions" (AI Assistant). Currently a placeholder UI with suggested actions.

---

# 9. Access Control Model

## 9.1 User Roles

| Role | Launcher | Admin Pages | User Mgmt | SAML Config | SCIM |
|---|---|---|---|---|---|
| `org_admin` | All apps | Full access | Full CRUD | Full CRUD | Full |
| `user` | Assigned apps only | No access | Self only | No | No |

## 9.2 App Access Rules

A user can access an app if ANY of these are true:
1. User role is `org_admin`
2. User's ID is in `app.approved_user_ids`
3. User belongs to a group with access
4. User has access to a **sibling app** (same ACS URL)

## 9.3 Access Request Flow

```
User -> Requests access in App Catalog
    -> Admin receives email notification
    -> Admin approves in Access Requests page
    -> User's ID added to app.approved_user_ids
    -> App appears in user's Launcher
```

---

# 10. Mobile SSO Flow

## 10.1 Platform Support

| Platform | Method |
|---|---|
| Android | Capacitor native APK (WebView) |
| iOS | Capacitor or PWA (Add to Home Screen) |
| Web | Standard browser |

## 10.2 Mobile SSO Handling

```
Mobile: User taps app in Launcher
    |
    v
Detect: isPWA || isNativeApp?
    |
    +-- YES (Mobile): window.location.href = /api/saml/{id}/complete?token=...
    |   (Opens in same window for native app feel)
    |
    +-- NO (Desktop): window.open(..., '_blank')
        (Opens in new tab)
```

## 10.3 Kissflow Native App Return Flow

When SSO is initiated from Kissflow's native app:
1. Kissflow sends `RelayState` containing return instructions
2. Super App passes `RelayState` back unchanged
3. Kissflow uses it to return the user to the native app
4. A 4-second timeout redirects stuck mobile pages back to `/launcher`

## 10.4 Capacitor Configuration

```json
{
  "appId": "com.refex.superapp",
  "appName": "Super App",
  "webDir": "build",
  "server": {
    "url": "https://superapp.refex.group"
  }
}
```

---

# 11. Microsoft Entra ID Integration

## 11.1 Extrovis SAML Configuration

The Super App also acts as IdP for Extrovis via Microsoft Entra ID.

### Super App -> Microsoft Entra

| Entra Field | Value |
|---|---|
| Identifier (Entity ID) | `https://superapp.refex.group/api/saml/{extrovis_app_id}` |
| Reply URL (ACS) | `https://login.microsoftonline.com/{tenant_id}/saml2` |
| Sign on URL | `https://superapp.refex.group/api/saml/{extrovis_app_id}/sso` |
| Logout URL | `https://superapp.refex.group/api/saml/{extrovis_app_id}/slo` |

### Entra Tenant Details

| Parameter | Value |
|---|---|
| Tenant ID | `24ac5b78-fb2e-4e84-ab60-22eadbe83b46` |
| Entity ID | `https://sts.windows.net/24ac5b78-fb2e-4e84-ab60-22eadbe83b46/` |

---

# 12. Configuration Reference

## 12.1 Backend Environment Variables

| Variable | Purpose | Example |
|---|---|---|
| `MONGO_URL` | MongoDB connection | `mongodb://localhost:27017` |
| `DB_NAME` | Database name | `superapp_db` |
| `PUBLIC_URL` | Public domain (critical for SAML) | `https://superapp.refex.group` |
| `JWT_SECRET` | JWT signing key | (random 32+ chars) |
| `KISSFLOW_SCIM_BASE_URL` | Kissflow SCIM endpoint | `https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/` |
| `KISSFLOW_SCIM_TOKEN` | Kissflow SCIM bearer token | `At-ee5f4a52-...` |
| `ADRENALIN_BASE_URL` | Adrenalin HRMS API | `https://refex.myadrenalin.com/...` |
| `ADRENALIN_USERNAME` | Adrenalin login | `REFEX` |
| `ADRENALIN_PASSWORD` | Adrenalin password | (provided) |
| `ADRENALIN_COMPANY_ID` | Adrenalin company | `SHERISHA` |
| `DEFAULT_USER_PASSWORD` | Default for new HR users | `Welcome@2026` |
| `SMTP_HOST` | Email server | `smtppro.zoho.in` |
| `SMTP_PORT` | Email port | `587` |
| `SMTP_USER` | Email username | `tech@helpdesksupport.co.in` |
| `SMTP_PASSWORD` | Email password | (provided) |

## 12.2 Frontend Environment

| Variable | Purpose | Value |
|---|---|---|
| `REACT_APP_BACKEND_URL` | API base URL | `https://superapp.refex.group` |

## 12.3 MongoDB Collections

| Collection | Key Documents | Purpose |
|---|---|---|
| `users` | 1,157 | All user accounts with 30+ HR fields |
| `saml_apps` | 7 | SAML SP configs (Kissflow + Extrovis) |
| `oidc_apps` | 10 | OIDC clients (2 active + 8 placeholder) |
| `organizations` | 2 | Multi-tenant orgs |
| `saml_config` | 1 | IdP certificate/key per org |
| `kissflow_scim_config` | 1 | SCIM token + URL |
| `kissflow_sync_logs` | 20+ | SCIM push history |
| `hr_sync_logs` | 8+ | Adrenalin sync history |
| `audit_logs` | 900+ | Full activity trail |
| `access_requests` | 9 | App access requests |
| `scim_tokens` | 10 | Inbound SCIM bearer tokens |

---

# 13. Troubleshooting Guide

## 13.1 SSO Redirects to Kissflow Login Page

**Symptom**: Clicking an app in launcher goes to `refexgroup.kissflow.com/view/login`

**Root Causes & Fixes**:

| Cause | Fix |
|---|---|
| `home_url` points to development instance | Update to `refexgroup.kissflow.com/...` in SAML Apps config |
| Iframe auth timing race | Fixed: now uses direct POST with RelayState |
| SAML certificate mismatch | Re-upload IdP certificate in Kissflow SAML config |
| Issuer mismatch | Ensure primary app's issuer matches what Kissflow expects |
| Clock skew > 5 minutes | Sync server time with NTP |

## 13.2 SCIM Sync Fails

| Error | Cause | Fix |
|---|---|---|
| 401 Unauthorized | Token expired | Generate new token in Kissflow Admin > SCIM |
| 403 Forbidden | SCIM suspended | Enable SCIM in Kissflow Admin |
| 429 Rate Limited | Too many requests | System retries automatically (5s, 10s, 15s) |
| 502 Gateway Timeout | Old sync was synchronous | Fixed: now runs as background task |
| Manager fields empty | Kissflow needs User ID, not email | Run "Link Managers" after full sync |

## 13.3 HR Sync Issues

| Issue | Fix |
|---|---|
| 0 users created | All employees already synced — this is normal |
| API auth failure | Check ADRENALIN_USERNAME/PASSWORD in .env |
| Missing L2 Manager | Supervisor's supervisor may not be in the system |
| Duplicate emails | Adrenalin has multiple records for same email — latest wins |

## 13.4 SSO Debug Mode

Add `?debug=1` to any SSO URL to see diagnostic info:

```
https://superapp.refex.group/api/saml/{app_id}/complete?token={jwt}&debug=1
```

Shows: Base64 length, XML preview, browser decode test, and two buttons (verify via debug endpoint / submit directly to Kissflow).

---

# 14. Data Flow Diagrams

## 14.1 Complete System Data Flow

```
+==========================================+
|           EXTERNAL SYSTEMS               |
+==========================================+
|                                          |
|  Adrenalin HRMS         Kissflow        |
|  (HR Data Source)        (Work Platform)  |
|       |                    ^    ^         |
|       | REST API           |    |         |
|       | (nightly)     SAML |    | SCIM    |
|       |                SSO |    | v2      |
|       v                    |    |         |
+==========================================+
|         REFEX SUPER APP                  |
+==========================================+
|                                          |
|  +----------+  +----------+  +--------+ |
|  | MongoDB  |  | FastAPI  |  | React  | |
|  | 18 colls |  | Backend  |  | SPA    | |
|  |          |<>| Port 8001|<>| Port   | |
|  | users    |  |          |  | 3000   | |
|  | apps     |  | Services:|  |        | |
|  | audit    |  | - SAML   |  | Pages: | |
|  | sync_logs|  | - OIDC   |  | - Login| |
|  | scim_cfg |  | - SCIM   |  | - Lnchr| |
|  |          |  | - HRSync |  | - Users| |
|  |          |  | - Email  |  | - SAML | |
|  +----------+  +----------+  +--------+ |
|       |              |            |      |
+==========================================+
        |              |            |
     MongoDB        Nginx        Browser/
     27017       (Reverse Proxy)  Mobile App
                  Port 80/443
```

## 14.2 Token Lifecycle

```
Login:
  POST /api/auth/login {email, password}
  -> bcrypt verify -> JWT issued (30 days)
  -> Stored in localStorage

App Launch:
  JWT passed as ?token= query param
  -> Backend validates JWT
  -> Generates SAML assertion
  -> Returns auto-submit HTML form

SCIM:
  Bearer token (separate from user JWT)
  -> Stored in kissflow_scim_config collection
  -> Used for Kissflow API calls
```

## 14.3 Nightly Sync Timeline

```
00:00 UTC  APScheduler fires
00:00-00:02  Adrenalin API authentication + employee fetch
00:02-00:05  Process 1,157 employees (create/update/disable)
00:05-00:10  Push changes to Kissflow via SCIM
00:10       Email sync report to admins
00:10       Log results to MongoDB
```

---

# Appendix: API Quick Reference

## SSO Endpoints

```
# IdP-Initiated SSO (from Launcher)
GET /api/saml/{app_id}/complete?token={jwt}

# SP-Initiated SSO (from Kissflow)
GET /api/saml/{app_id}/sso?SAMLRequest={base64}&RelayState={state}

# SAML Metadata (for SP configuration)
GET /api/apps/saml/{app_id}/metadata

# Kissflow-specific config page
GET /api/apps/saml/{app_id}/kissflow-config

# Test SSO assertion (debug)
GET /api/saml/{app_id}/complete?token={jwt}&debug=1
```

## SCIM Endpoints

```
# Kissflow Push
POST /api/kissflow-scim/sync           # Full background sync
POST /api/kissflow-scim/push-user      # Single user {"email": "..."}
POST /api/kissflow-scim/resolve-managers # Link manager lookups
GET  /api/kissflow-scim/config          # Config status
GET  /api/kissflow-scim/logs            # Sync history

# HR Sync
POST /api/hr-sync/trigger              # Manual Adrenalin sync
GET  /api/hr-sync/logs                 # Sync history
```

---

*Confidential - Refex Group*
*Refex Super App IAM Platform*
*Version 3.0 - May 2026*
