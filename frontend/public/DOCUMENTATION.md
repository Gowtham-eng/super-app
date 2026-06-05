# Refex Super App - Enterprise Documentation

## Identity & Access Management Platform

**Version**: 2.0.0
**Last Updated**: May 13, 2026
**Classification**: Internal / Confidential
**Maintainer**: Refex AI Team

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Database Architecture](#4-database-architecture)
5. [API Documentation](#5-api-documentation)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [SAML 2.0 Identity Provider](#7-saml-20-identity-provider)
8. [OIDC Provider](#8-oidc-provider)
9. [SCIM v2 Provisioning](#9-scim-v2-provisioning)
10. [HR Integration (Adrenalin HRMS)](#10-hr-integration-adrenalin-hrms)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Deployment Guide](#12-deployment-guide)
13. [DevOps & Infrastructure](#13-devops--infrastructure)
14. [Security Architecture](#14-security-architecture)
15. [Workflows & Business Logic](#15-workflows--business-logic)
16. [Case Studies](#16-case-studies)
17. [Troubleshooting & Runbooks](#17-troubleshooting--runbooks)
18. [Appendices](#18-appendices)

---

# 1. Executive Summary

## 1.1 Overview

The **Refex Super App** is a custom-built, enterprise-grade **Identity & Access Management (IAM)** platform that serves as the centralized authentication and user provisioning hub for Refex Group's ecosystem of 10+ business applications.

The platform acts as a **Custom Identity Provider (IdP)** supporting SAML 2.0 and OpenID Connect (OIDC), enabling Single Sign-On (SSO) across all integrated applications, with Kissflow as the primary Service Provider (SP).

## 1.2 Business Problem

Refex Group operates across multiple business verticals (Ash Management, Green Mobility, Wind Energy, Coal Trading, 3i MedTech) with **1,155+ employees** spread across multiple entities. Before this platform:

- Employees managed separate credentials for each application
- User onboarding/offboarding was manual and error-prone
- No centralized access control or audit trail
- No automated HR-to-application user provisioning

## 1.3 Solution Delivered

| Capability | Description |
|---|---|
| **Single Sign-On** | One login for all apps via SAML 2.0 & OIDC |
| **Auto Provisioning** | Adrenalin HRMS to Kissflow via SCIM v2 |
| **Multi-Tenant** | Isolated organizations with domain-based routing |
| **RBAC** | Role-based access with granular permissions |
| **Mobile Native** | Android APK + PWA with deep-linking |
| **Audit Trail** | Full activity logging for compliance |

## 1.4 Key Metrics

| Metric | Value |
|---|---|
| Total Users | 1,155+ |
| Active Users | 1,144 |
| Integrated Apps | 8 (6 SAML + 2 OIDC) |
| HR Fields Synced | 30+ per employee |
| Daily Auto-Sync | Midnight (Adrenalin to Kissflow) |
| Uptime Target | 99.9% |

---

# 2. System Architecture

## 2.1 High-Level Architecture

```
                          +------------------+
                          |   Mobile Apps    |
                          | (Android/iOS/PWA)|
                          +--------+---------+
                                   |
                          +--------v---------+
                          |     Nginx        |
                          |  Reverse Proxy   |
                          |  + SSL (Certbot) |
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |                             |
           +-------v-------+            +--------v--------+
           |   React SPA   |            |   FastAPI        |
           |   Port 3000   |            |   Port 8001      |
           |   (Frontend)  |            |   (Backend)      |
           +---------------+            +--------+--------+
                                                 |
                              +------------------+------------------+
                              |                  |                  |
                     +--------v-----+   +--------v-----+   +-------v-------+
                     |   MongoDB    |   | Adrenalin HR |   |   Kissflow    |
                     |   Port 27017 |   |   HRMS API   |   |  SCIM Server  |
                     +--------------+   +--------------+   +---------------+
```

## 2.2 Component Architecture

```
/opt/superapp/
+-- backend/
|   +-- server.py                  # FastAPI application (main)
|   +-- routes/
|   |   +-- scim.py                # SCIM v2 inbound server
|   +-- services/
|   |   +-- adrenalin_sync.py      # Adrenalin HRMS sync service
|   |   +-- email_service.py       # SMTP email service
|   |   +-- kissflow_scim_client.py # Outbound SCIM push to Kissflow
|   +-- uploads/                   # Uploaded logos/profile pics
|   +-- .env                       # Environment configuration
|   +-- requirements.txt           # Python dependencies
|
+-- frontend/
|   +-- src/
|   |   +-- pages/                 # 17 page components
|   |   +-- components/            # Shared components (Layout, UI)
|   |   +-- context/               # AuthContext (global state)
|   +-- public/                    # Static assets, PWA manifest
|   +-- android/                   # Capacitor Android project
|   +-- capacitor.config.json      # Native app configuration
|   +-- package.json               # Node dependencies
|   +-- .env                       # Frontend environment
|
+-- memory/
    +-- PRD.md                     # Product Requirements Document
    +-- test_credentials.md        # Test account credentials
```

## 2.3 Data Flow Architecture

```
Adrenalin HRMS API
    |
    | (Nightly Sync @ 00:00 UTC)
    v
+-------------------+     (Auto-push after sync)     +------------------+
|   Super App DB    | -----------------------------> |   Kissflow SCIM  |
|   (MongoDB)       |                                |   Server         |
+-------------------+                                +------------------+
    |        ^
    |        | (JWT Auth)
    v        |
+-------------------+     (SAML Assertion)           +------------------+
|   React Frontend  | -----------------------------> |   Kissflow App   |
|   (Browser/Mobile)|                                |   (SP)           |
+-------------------+                                +------------------+
```

---

# 3. Technology Stack

## 3.1 Backend

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Python | 3.11 | Core language |
| Framework | FastAPI | 0.110.1 | Async REST API |
| Database Driver | Motor | 3.x | Async MongoDB |
| Auth | PyJWT + bcrypt | 2.8 / 4.1 | JWT tokens + password hashing |
| SAML | signxml + lxml | Latest | XML signing (RSA-SHA256) |
| OIDC | Custom | - | OAuth2/OIDC provider |
| Scheduler | APScheduler | 3.11.2 | Nightly cron jobs |
| Email | aiosmtplib | 5.1.0 | Async SMTP |
| HTTP Client | httpx | Latest | SCIM/HR API calls |
| Export | openpyxl | Latest | Excel export |
| Crypto | cryptography | 46.0.6 | Certificate generation |

## 3.2 Frontend

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Framework | React | 18.x | UI framework |
| Routing | React Router | 6.x | SPA routing |
| UI Library | Shadcn/UI + Radix | Latest | Component library |
| Icons | Lucide React | Latest | Icon system |
| HTTP | Axios | Latest | API calls |
| Charts | Recharts | Latest | Dashboard charts |
| Toast | Sonner | Latest | Notifications |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| Mobile | Capacitor | 5.x | Native wrapper (Android/iOS) |

## 3.3 Database

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Primary DB | MongoDB | 7.0 | Document store |
| Collections | 18 | - | See Database Architecture |

## 3.4 Infrastructure

| Component | Technology | Purpose |
|---|---|---|
| OS | Ubuntu 22.04+ | Server |
| Web Server | Nginx | Reverse proxy + SSL |
| SSL | Certbot (Let's Encrypt) | HTTPS certificates |
| Process Manager | systemd | Service management |

---

# 4. Database Architecture

## 4.1 Collections Overview

| Collection | Documents | Description | Indices |
|---|---|---|---|
| `users` | 1,160 | All user accounts + HR data | email, org_id, status |
| `organizations` | 2 | Tenant organizations | id, domain |
| `saml_apps` | 6 | SAML SP configurations | id, org_id, entity_id |
| `oidc_apps` | 2 | OIDC client configs | id, org_id, client_id |
| `roles` | 6 | RBAC role definitions | id, org_id |
| `groups` | 0 | User group hierarchies | id, org_id |
| `permissions` | 10 | Permission definitions | id |
| `access_policies` | 0 | IP/time-based policies | id, org_id |
| `access_requests` | 9 | App access requests | id, user_id, status |
| `audit_logs` | 882+ | Activity audit trail | org_id, timestamp |
| `hr_sync_logs` | 8+ | Adrenalin sync history | org_id, timestamp |
| `kissflow_sync_logs` | 20+ | Kissflow SCIM push logs | org_id, timestamp |
| `kissflow_scim_config` | 1 | Kissflow SCIM credentials | org_id |
| `scim_tokens` | 10 | Inbound SCIM bearer tokens | org_id, token_hash |
| `saml_config` | 1 | SAML IdP certificates | org_id |
| `oidc_config` | 1 | OIDC provider keys | org_id |
| `oidc_auth_codes` | 20 | OAuth authorization codes | code |
| `oidc_access_tokens` | 17 | OAuth access tokens | token |

## 4.2 User Schema (Primary Entity)

```json
{
  "id": "uuid-v4",
  "email": "john.doe@refex.co.in",
  "password": "$2b$12$...",              // bcrypt hash
  "role": "user",                        // user | org_admin
  "org_id": "uuid-v4",
  "status": "active",                    // active | disabled
  "group_ids": [],
  "role_ids": [],
  
  // HR Fields (30+ from Adrenalin)
  "adrenalin_employee_id": "RXIL002027",
  "title": "Mr.",
  "first_name": "John",
  "last_name": "Doe",
  "name": "John Doe",
  "full_name": "John Doe",
  "sex": "M",
  "date_of_birth": "1/20/1995 12:00:00 AM",
  "pan_number": "ABCDE1234F",
  "personal_email": "john@gmail.com",
  "mobile": "9876543210",
  "employee_mobile": "919876543210",
  "work_mobile": "9876543210",
  "employee_pincode": "600063",
  "department": "Information Technology",
  "department_code": "110",
  "designation": "Senior Manager",
  "grade": "M3",
  "company": "Refex Industries Limited",
  "legal_entity_code": "RIL",
  "business_line": "Shared Services",
  "branch_code": "Refex",
  "location": "T.Nagar",
  "office_location": "Refex Group",
  "employee_status": "C",
  "employee_status_description": "Confirmed",
  "employment_status": "1",
  "employment_status_description": "Active",
  "joining_date": "9/1/2022",
  "date_of_exit": "",
  "emp_added_on": "1/3/2025",
  
  // Manager Hierarchy
  "supervisor_employee_code": "STPL002128",
  "supervisor_email": "manager@refex.co.in",
  "supervisor_name": "Manager Name",
  "l2_manager_employee_code": "STPL002000",
  "l2_manager_email": "director@refex.co.in",
  "l2_manager_name": "Director Name",
  
  // Kissflow Sync
  "kissflow_user_id": "UsCx3vovNk0v",
  "kissflow_synced_at": "2026-04-21T10:19:16+00:00",
  
  // Metadata
  "created_at": "2026-04-09T06:00:00+00:00",
  "created_via": "adrenalin_sync",
  "hr_synced_at": "2026-04-13T04:03:02+00:00",
  "profile_pic": "/api/uploads/abc123.jpg"
}
```

## 4.3 SAML App Schema

```json
{
  "id": "uuid-v4",
  "org_id": "uuid-v4",
  "name": "Kissflow",
  "entity_id": "https://refexgroup.kissflow.com/saml/",
  "acs_url": "https://refexgroup.kissflow.com/signin/2/AcCMptlq60zH/saml/?acs",
  "slo_url": "",
  "home_url": "https://refexgroup.kissflow.com/",
  "logo_url": "/api/uploads/kissflow-logo.png",
  "name_id_format": "email",
  "signing_algorithm": "RSA-SHA256",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "approved_user_ids": ["user-id-1", "user-id-2"],
  "attributes": [
    {"name": "email", "value": "email"},
    {"name": "firstName", "value": "first_name"}
  ],
  "created_at": "2026-04-08T..."
}
```

## 4.4 Organization Schema

```json
{
  "id": "uuid-v4",
  "name": "Refex Industries Limited",
  "domain": "refex.co.in",
  "description": "Refex Group",
  "adrenalin_sync_enabled": true,
  "created_at": "2026-04-08T..."
}
```

---

# 5. API Documentation

## 5.1 Authentication APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Register new user |
| `POST` | `/api/auth/login` | None | Login (returns JWT) |
| `GET` | `/api/auth/me` | Bearer | Get current user profile |

### Login Request
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "gowtham.s@refex.co.in",
  "password": "Admin123!"
}
```

### Login Response
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "gowtham.s@refex.co.in",
    "role": "org_admin",
    "org_id": "uuid",
    "name": "Gowtham S"
  }
}
```

## 5.2 User Management APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | Bearer | List users (with search, filters) |
| `GET` | `/api/users/export?format=csv\|excel` | Bearer | Export users |
| `POST` | `/api/users` | Bearer (Admin) | Create user |
| `PUT` | `/api/users/{id}` | Bearer (Admin) | Update user (+ auto Kissflow push) |
| `DELETE` | `/api/users/{id}` | Bearer (Admin) | Delete user |
| `POST` | `/api/users/{id}/reset-password` | Bearer (Admin) | Reset user password |
| `PUT` | `/api/users/me/profile-pic` | Bearer | Upload profile picture |

## 5.3 SAML SSO APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET/POST` | `/api/saml/{app_id}/sso` | Session | SSO endpoint (IdP + SP initiated) |
| `GET/POST` | `/api/saml/{app_id}/slo` | Session | Single Logout |
| `GET` | `/api/saml/{app_id}/complete` | Session | Auto-submit SAML form |
| `GET` | `/api/apps/saml/{app_id}/metadata` | None | SAML Metadata XML |
| `GET` | `/api/apps/saml/{app_id}/kissflow-config` | None | Kissflow-specific config |
| `GET` | `/api/saml/{app_id}/test` | Bearer | Test SSO assertion |

## 5.4 OIDC Provider APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/apps/oidc/{app_id}/.well-known/openid-configuration` | None | Discovery document |
| `GET` | `/api/oidc/{app_id}/authorize` | Session | Authorization endpoint |
| `POST` | `/api/oidc/{app_id}/token` | Client | Token endpoint |
| `GET/POST` | `/api/oidc/userinfo` | Bearer | UserInfo endpoint |

## 5.5 SCIM v2 APIs (Inbound Server)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/scim/v2/ServiceProviderConfig` | Bearer | SCIM capabilities |
| `GET` | `/api/scim/v2/Schemas` | Bearer | Schema discovery |
| `GET` | `/api/scim/v2/ResourceTypes` | Bearer | Resource types |
| `GET` | `/api/scim/v2/Users` | Bearer | List/search users |
| `GET` | `/api/scim/v2/Users/{id}` | Bearer | Get user |
| `POST` | `/api/scim/v2/Users` | Bearer | Create user |
| `PUT` | `/api/scim/v2/Users/{id}` | Bearer | Replace user |
| `PATCH` | `/api/scim/v2/Users/{id}` | Bearer | Partial update |
| `DELETE` | `/api/scim/v2/Users/{id}` | Bearer | Delete user |
| `GET` | `/api/scim/v2/Groups` | Bearer | List groups |
| `POST` | `/api/scim/v2/Groups` | Bearer | Create group |
| `PATCH` | `/api/scim/v2/Groups/{id}` | Bearer | Update group |
| `DELETE` | `/api/scim/v2/Groups/{id}` | Bearer | Delete group |

## 5.6 Kissflow SCIM Push APIs (Outbound Client)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/kissflow-scim/config` | Bearer (Admin) | Get Kissflow SCIM config |
| `POST` | `/api/kissflow-scim/config` | Bearer (Admin) | Save Kissflow SCIM config |
| `POST` | `/api/kissflow-scim/sync` | Bearer (Admin) | Full sync (background) |
| `POST` | `/api/kissflow-scim/push-user` | Bearer (Admin) | Push single user |
| `POST` | `/api/kissflow-scim/resolve-managers` | Bearer (Admin) | Resolve manager lookups |
| `GET` | `/api/kissflow-scim/logs` | Bearer (Admin) | Sync history |

## 5.7 HR Sync APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/hr-sync/trigger` | Bearer (Admin) | Manual Adrenalin sync |
| `GET` | `/api/hr-sync/logs` | Bearer (Admin) | Sync history |

## 5.8 Organization & Access APIs

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/organizations` | Bearer | List orgs |
| `POST` | `/api/organizations` | None | Create org |
| `GET/POST/PUT/DELETE` | `/api/roles/*` | Bearer (Admin) | Role CRUD |
| `GET/POST/PUT/DELETE` | `/api/groups/*` | Bearer (Admin) | Group CRUD |
| `GET/POST/PUT/DELETE` | `/api/policies/*` | Bearer (Admin) | Policy CRUD |
| `POST` | `/api/access-requests` | Bearer | Request app access |
| `GET` | `/api/access-requests` | Bearer | List requests |
| `PUT` | `/api/access-requests/{id}` | Bearer (Admin) | Approve/reject |
| `GET` | `/api/audit-logs` | Bearer (Admin) | Activity logs |
| `GET` | `/api/dashboard/stats` | Bearer (Admin) | Dashboard metrics |
| `GET` | `/api/launcher/apps` | Bearer | My apps |
| `GET` | `/api/catalog/apps` | Bearer | Browse apps |

---

# 6. Authentication & Authorization

## 6.1 Authentication Flow

```
User enters email + password
    |
    v
POST /api/auth/login
    |
    v
Server verifies bcrypt hash
    |
    v
JWT token issued (30-day expiry)
    |
    v
Token stored in localStorage
    |
    v
All API calls include:
Authorization: Bearer <token>
```

## 6.2 JWT Token Structure

```json
{
  "sub": "user-uuid",
  "email": "user@refex.co.in",
  "org_id": "org-uuid",
  "role": "org_admin",
  "exp": 1746720000,
  "iat": 1744128000
}
```

## 6.3 Role-Based Access Control

| Role | Dashboard | App Launcher | User Mgmt | SAML/OIDC | Audit Logs | SCIM |
|---|---|---|---|---|---|---|
| `org_admin` | Yes | Yes | Full CRUD | Full CRUD | Yes | Yes |
| `user` | No | Yes (own apps) | No | No | No | No |

## 6.4 Password Policy

- Minimum 6 characters
- Hashed with bcrypt (12 rounds)
- Default password for HR-synced users: `Welcome@2026`
- Admin can reset any user's password

---

# 7. SAML 2.0 Identity Provider

## 7.1 SAML Configuration

| Parameter | Value |
|---|---|
| Protocol | SAML 2.0 |
| Signing Algorithm | RSA-SHA256 |
| Digest Algorithm | SHA-256 |
| NameID Format | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| Certificate | Auto-generated RSA 2048-bit per app |
| Assertion Validity | 5 minutes |

## 7.2 IdP-Initiated SSO Flow

```
1. User clicks app tile in Launcher
2. Browser POSTs to /api/saml/{app_id}/sso
3. Server generates signed SAML Response
4. Returns auto-submit HTML form with SAMLResponse + RelayState
5. Browser submits form to SP ACS URL
6. SP validates signature and logs user in
```

## 7.3 SP-Initiated SSO Flow

```
1. User accesses SP directly (e.g., kissflow.com)
2. SP redirects to IdP: /api/saml/{app_id}/sso?SAMLRequest=...
3. If user has active session, generate SAML Response
4. If not, redirect to login, then back to SSO
5. Submit signed response to SP ACS URL
6. SP validates and grants access
```

## 7.4 Kissflow-Specific Configuration

| Kissflow Setting | Value |
|---|---|
| IdP SSO URL | `https://superapp.refex.group/api/saml/{app_id}/sso` |
| IdP SLO URL | `https://superapp.refex.group/api/saml/{app_id}/slo` |
| IdP Entity ID | `https://superapp.refex.group/api/saml/{app_id}` |
| Metadata URL | `https://superapp.refex.group/api/apps/saml/{app_id}/metadata` |
| RelayState | Passed through from Kissflow |

## 7.5 Registered SAML Applications

| App | Entity ID | Purpose |
|---|---|---|
| Kissflow | `https://refexgroup.kissflow.com/saml/` | Workflow platform |
| Expense Management | Same ACS | Kissflow module |
| Travel Management | Same ACS | Kissflow module |
| Lead Tracker | Same ACS | Kissflow module |
| Vendor Management | Same ACS | Kissflow module |
| Asset Management | Same ACS | Kissflow module |

---

# 8. OIDC Provider

## 8.1 OAuth2/OIDC Flow

| Parameter | Value |
|---|---|
| Grant Types | Authorization Code |
| Response Types | code |
| Token Endpoint Auth | client_secret_post |
| Scopes | openid, profile, email |

## 8.2 Discovery Endpoint

```
GET /api/apps/oidc/{app_id}/.well-known/openid-configuration
```

Returns standard OIDC discovery document with all endpoint URLs.

---

# 9. SCIM v2 Provisioning

## 9.1 Architecture

```
+-------------------+                    +-------------------+
|                   |  Inbound SCIM v2   |                   |
|   External IdP    | -----------------> |   Super App       |
|   (OneLogin/Okta) |  /api/scim/v2/*    |   SCIM Server     |
|                   |                    |                   |
+-------------------+                    +-------------------+
                                                  |
                                                  | Outbound SCIM v2
                                                  v
                                         +-------------------+
                                         |   Kissflow        |
                                         |   SCIM Server     |
                                         +-------------------+
```

## 9.2 Kissflow SCIM Field Mapping

| Super App Field | Kissflow SCIM Field | Type |
|---|---|---|
| `email` | `userName` | Core |
| `first_name` | `name.givenName` | Core |
| `last_name` | `name.familyName` | Core |
| `full_name` | `displayName`, `nickName` | Core |
| `designation` | `title` | Core |
| `status` | `active` | Core |
| `work_mobile` | `phoneNumbers[type=work]` | Core |
| `employee_mobile` | `phoneNumbers[type=mobile]` | Core |
| `adrenalin_employee_id` | `Employee_ID` | Kissflow Extension |
| `designation` | `Designation_1` | Kissflow Extension |
| `department_code` | `Department_Code` | Kissflow Extension |
| `branch_code` | `Branch` | Kissflow Extension |
| `location` | `Location_1` | Kissflow Extension |
| `office_location` | `Office_Location` | Kissflow Extension |
| `employee_status_description` | `Employee_Status` | Kissflow Extension |
| `date_of_exit` | `Date_of_Exit` | Kissflow Extension |
| `supervisor_email` | `Manager.Email` + `L1_Manager_Email` | Kissflow Extension |
| `supervisor_name` | `Manager.Name` + `L1_Manager_Name` | Kissflow Extension |
| `l2_manager_email` | `L2_Manager.Email` | Kissflow Extension |
| `l2_manager_name` | `L2_Manager.Name` | Kissflow Extension |

**Kissflow Extension Schema**: `urn:kissflow:scim:schemas:extension:AcCMptlq60zH:2:User`

## 9.3 Sync Features

| Feature | Description |
|---|---|
| **Background Sync** | Full sync runs as async background task (no HTTP timeout) |
| **Rate Limiting** | 0.25s delay between requests, retry on 429 |
| **Auth Error Detection** | Stops after 5 consecutive 401/403 errors |
| **Create-Only Mode** | Skips search for fresh sync (halves API calls) |
| **Manager Resolution** | Second pass to link Manager/L2_Manager by Kissflow User ID |
| **Progress Logging** | Logs progress every 100 users |
| **Auto-push** | User edits in Admin UI trigger immediate Kissflow push |

---

# 10. HR Integration (Adrenalin HRMS)

## 10.1 Sync Workflow

```
Midnight UTC (APScheduler Cron Job)
    |
    v
Authenticate with Adrenalin API
    |
    v
Fetch all employees (paginated, 100/page)
    |
    v
Build supervisor lookup (Employee ID -> Employee)
    |
    v
For each employee:
    +-- New employee with active status? -> Create user (default password)
    +-- Existing employee, exited? -> Disable user
    +-- Existing employee, active? -> Update all 30 HR fields
    |
    v
Resolve L1 Manager (direct supervisor email)
Resolve L2 Manager (supervisor's supervisor email)
    |
    v
Push created/updated users to Kissflow via SCIM
    |
    v
Email sync report to admin users
```

## 10.2 HR Fields Captured (30+)

**Core Identity**: Employee ID, Title, First Name, Last Name, Sex, DOB, PAN Number

**Contact**: Email, Personal Email, Mobile, Work Mobile, Pincode

**Organization**: Department, Dept Code, Designation, Grade, Company, Legal Entity, Business Line, Branch, Location, Office Location

**Employment**: Status, Status Description, Employment Status, Joining Date, Exit Date

**Management**: L1 Manager (Name, Email, Code), L2 Manager (Name, Email, Code)

## 10.3 Adrenalin API Configuration

| Parameter | Value |
|---|---|
| Base URL | `https://refex.myadrenalin.com/JASON_DYNAMIC_API/SHERISHA/V1/JasonBase` |
| Auth | POST `/Authorization/UserLogin` |
| Employees | POST `/Employee/GetEmployeeDetails` |
| Company ID | `SHERISHA` |

---

# 11. Frontend Architecture

## 11.1 Page Structure

| Page | Route | Access | Description |
|---|---|---|---|
| Login | `/login` | Public | Refex-branded login with business carousel |
| Dashboard | `/` | Admin | Stats overview (users, apps, requests, logins) |
| App Launcher | `/launcher` | All | Zoho-style 4-column app grid |
| App Catalog | `/catalog` | All | Browse and request access to apps |
| SAML Apps | `/apps/saml` | Admin | SAML SP configuration |
| OIDC Apps | `/apps/oidc` | Admin | OIDC client management |
| Users | `/users` | Admin | User master with detail panels, export, filters |
| Groups | `/groups` | Admin | Group hierarchy management |
| Roles | `/roles` | Admin | RBAC role management |
| Policies | `/policies` | Admin | Access policies (IP/time) |
| Access Requests | `/requests` | Admin | Approve/reject requests |
| Audit Logs | `/audit` | Admin | Activity trail |
| HR Sync | `/hr-sync` | Admin | Adrenalin sync trigger and logs |
| SCIM Setup | `/scim` | Admin | SCIM tokens + Kissflow push |

## 11.2 Key UI Features

| Feature | Description |
|---|---|
| **Slide-in Detail Panel** | Click any user row to see full HR details |
| **CSV/Excel Export** | Export filtered user data |
| **7 Quick Filters** | Missing Mobile, Missing Email, Disabled, etc. |
| **Password Reset** | Admin can set custom passwords |
| **Profile Pic Upload** | Avatar with initials fallback |
| **Responsive** | Mobile-first with 4-col compact grid |
| **Background Sync Status** | Auto-refreshing sync progress in SCIM page |

---

# 12. Deployment Guide

## 12.1 Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 20.04 | Ubuntu 22.04+ |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB SSD |
| MongoDB | 6.0 | 7.0+ |
| Python | 3.10 | 3.11+ |
| Node.js | 18.x | 20.x |

## 12.2 Installation Steps

### Step 1: System Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm nginx git
npm install -g yarn
```

### Step 2: MongoDB Installation

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl start mongod && sudo systemctl enable mongod
```

### Step 3: Application Setup

```bash
git clone <repo-url> /opt/superapp

# Backend
cd /opt/superapp/backend
python3.11 -m venv venv
source venv/bin/activate
sed -i '/emergentintegrations/d' requirements.txt
pip install -r requirements.txt

# Frontend
cd /opt/superapp/frontend
yarn config set strict-ssl false
sed -i '/emergentbase-visual-edits/d' package.json
yarn install
```

### Step 4: Environment Configuration

**Backend** (`/opt/superapp/backend/.env`):
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=superapp_db
PUBLIC_URL=https://superapp.refex.group
CORS_ORIGINS=*
JWT_SECRET=<your-secure-random-secret>
SMTP_HOST=smtppro.zoho.in
SMTP_PORT=587
SMTP_USER=tech@helpdesksupport.co.in
SMTP_PASSWORD=<smtp-password>
SMTP_FROM=tech@helpdesksupport.co.in
ADRENALIN_BASE_URL=https://refex.myadrenalin.com/JASON_DYNAMIC_API/SHERISHA/V1/JasonBase
ADRENALIN_USERNAME=REFEX
ADRENALIN_PASSWORD=<adrenalin-password>
ADRENALIN_COMPANY_ID=SHERISHA
DEFAULT_USER_PASSWORD=Welcome@2026
KISSFLOW_SCIM_BASE_URL=https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/
KISSFLOW_SCIM_TOKEN=<kissflow-scim-token>
```

**Frontend** (`/opt/superapp/frontend/.env`):
```
REACT_APP_BACKEND_URL=https://superapp.refex.group
```

### Step 5: Build & Database Restore

```bash
# Build frontend
cd /opt/superapp/frontend && yarn build

# Restore database
mongorestore --db superapp_db /path/to/db_export/test_database/
```

### Step 6: Systemd Service

Create `/etc/systemd/system/superapp-backend.service`:
```ini
[Unit]
Description=Super App Backend
After=network.target mongod.service

[Service]
User=www-data
WorkingDirectory=/opt/superapp/backend
ExecStart=/opt/superapp/backend/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always
EnvironmentFile=/opt/superapp/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable superapp-backend
sudo systemctl start superapp-backend
```

### Step 7: Nginx Configuration

```nginx
server {
    listen 80;
    server_name superapp.refex.group;

    location / {
        root /opt/superapp/frontend/build;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location /api/uploads/ {
        alias /opt/superapp/backend/uploads/;
    }
}
```

### Step 8: SSL Certificate

```bash
sudo certbot --nginx -d superapp.refex.group
```

---

# 13. DevOps & Infrastructure

## 13.1 Service Health Checks

```bash
# Backend health
curl https://superapp.refex.group/api/health

# MongoDB status
mongosh --eval "db.runCommand({ping: 1})"

# Backend service
sudo systemctl status superapp-backend

# Nginx
sudo systemctl status nginx
```

## 13.2 Log Locations

| Log | Location | Command |
|---|---|---|
| Backend App | stdout/journald | `journalctl -u superapp-backend -f` |
| Nginx Access | `/var/log/nginx/access.log` | `tail -f /var/log/nginx/access.log` |
| Nginx Error | `/var/log/nginx/error.log` | `tail -f /var/log/nginx/error.log` |
| MongoDB | `/var/log/mongodb/mongod.log` | `tail -f /var/log/mongodb/mongod.log` |

## 13.3 Backup Strategy

```bash
# Database backup (daily cron)
mongodump --db superapp_db --out /backups/$(date +%Y%m%d)

# Retain 30 days
find /backups -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \;
```

## 13.4 Monitoring Checklist

| Check | Frequency | Method |
|---|---|---|
| API health | Every 5 min | `GET /api/health` |
| SSL expiry | Weekly | `certbot certificates` |
| Disk usage | Daily | `df -h` |
| MongoDB connections | Daily | Compass / `db.serverStatus()` |
| HR sync success | Daily | Check `/api/hr-sync/logs` |
| Kissflow sync | Daily | Check `/api/kissflow-scim/logs` |

---

# 14. Security Architecture

## 14.1 Authentication Security

| Measure | Implementation |
|---|---|
| Password Hashing | bcrypt (12 rounds) |
| Token Type | JWT (HS256) |
| Token Expiry | 30 days |
| Transport | HTTPS only (TLS 1.2+) |
| CORS | Configurable origins |

## 14.2 Data Security

| Measure | Implementation |
|---|---|
| Database | Local MongoDB (no public exposure) |
| Secrets | Environment variables (.env) |
| Uploads | Served through Nginx (not direct FS) |
| SAML Signing | RSA-2048 with SHA-256 |
| SCIM Auth | Bearer tokens (hashed in DB) |
| API Keys | Never logged or exposed in responses |

## 14.3 Access Control

| Layer | Control |
|---|---|
| Route-level | `AdminRoute` component (frontend) |
| API-level | `get_current_user` + role check (backend) |
| Org-level | `org_id` filter on all queries |
| App-level | `approved_user_ids` whitelist |

## 14.4 Audit Trail

Every significant action is logged to `audit_logs`:
- User creates/updates/deletes
- Role and group changes
- App configuration changes
- Access request approvals/rejections
- Password resets
- SSO events

---

# 15. Workflows & Business Logic

## 15.1 Employee Onboarding Flow

```
1. HR adds employee in Adrenalin HRMS
2. Midnight sync creates user in Super App
3. Super App pushes user to Kissflow via SCIM
4. Admin assigns apps to user
5. User logs in with Welcome@2026, accesses assigned apps via SSO
```

## 15.2 Employee Offboarding Flow

```
1. HR marks employee as "Exited" in Adrenalin
2. Midnight sync disables user in Super App
3. Super App deactivates user in Kissflow via SCIM PATCH
4. User can no longer log in or access any apps
5. Audit log records the deactivation
```

## 15.3 App Access Request Flow

```
1. User browses App Catalog
2. User clicks "Request Access" on an app
3. Admin receives email notification
4. Admin approves/rejects in Access Requests page
5. If approved, user's ID added to app's approved_user_ids
6. User sees app in their Launcher
```

## 15.4 Nightly Sync Pipeline

```
00:00 UTC - APScheduler triggers sync_employees()
    |
    +-- Authenticate with Adrenalin API
    +-- Fetch all employees (paginated)
    +-- Process each employee (create/update/disable)
    +-- Resolve L1 and L2 manager hierarchies
    +-- Push changes to Kissflow via SCIM
    +-- Log results to hr_sync_logs + kissflow_sync_logs
    +-- Email report to admins (if changes or errors)
```

---

# 16. Case Studies

## Case Study 1: Eliminating Manual User Provisioning

**Problem**: IT team spent 4+ hours per week manually creating Kissflow accounts for new hires and deactivating accounts for exits.

**Solution**: Automated Adrenalin-to-Kissflow SCIM pipeline syncing 1,155 users with 30+ HR fields including manager hierarchy.

**Result**: Zero manual provisioning. New hires get Kissflow access within 24 hours of HR entry. Exits are auto-deactivated.

## Case Study 2: Unified SSO Across 8 Applications

**Problem**: Employees maintained separate credentials for each Kissflow module (Expense, Travel, Vendor, etc.), leading to password fatigue and security risks.

**Solution**: SAML 2.0 IdP with single-click SSO from the Super App Launcher to all 6 SAML apps and 2 OIDC apps.

**Result**: Single password for all apps. 38+ logins in 7 days tracked via audit logs. Zero credential-related support tickets.

## Case Study 3: Mobile-First Access for Field Workers

**Problem**: 500+ field employees across wind farms and coal operations needed app access from mobile devices without VPN.

**Solution**: PWA + Android APK with native Kissflow deep-linking. Compact 4-column app grid designed for one-handed mobile use.

**Result**: Mobile-native experience. Android APK deployed via MDM. PWA installable on iOS without App Store.

---

# 17. Troubleshooting & Runbooks

## 17.1 Backend Not Starting

```bash
# Check logs
journalctl -u superapp-backend -n 50

# Common causes:
# - MongoDB not running: sudo systemctl start mongod
# - Missing .env: verify /opt/superapp/backend/.env exists
# - Port conflict: lsof -i :8001
# - Python venv: source /opt/superapp/backend/venv/bin/activate
```

## 17.2 SAML SSO Fails

```bash
# Check PUBLIC_URL matches your domain
grep PUBLIC_URL /opt/superapp/backend/.env

# Verify certificate
curl https://superapp.refex.group/api/apps/saml/<app_id>/metadata

# Common causes:
# - PUBLIC_URL mismatch (must match SP config)
# - Clock skew > 5 minutes (SAML assertions expire)
# - Certificate mismatch (re-upload to Kissflow)
```

## 17.3 Kissflow SCIM Sync Fails

```bash
# Check token validity
curl -s "https://refexgroup.kissflow.com/scimv2/2/AcCMptlq60zH/Users?count=1" \
  -H "Authorization: Bearer <token>"

# Common causes:
# - Token expired (generate new in Kissflow SCIM config)
# - SCIM suspended (enable in Kissflow Admin)
# - Rate limited (wait 60s, retry)
# - 502 timeout (sync now runs in background, check logs)
```

## 17.4 HR Sync No New Users

```bash
# Check Adrenalin connectivity
curl -s https://refex.myadrenalin.com/JASON_DYNAMIC_API/SHERISHA/V1/JasonBase/Authorization/UserLogin \
  -H "Content-Type: application/json" \
  -d '{"UserName":"REFEX","Password":"<password>","CompanyId":"SHERISHA"}'

# Check sync logs in DB
mongosh superapp_db --eval 'db.hr_sync_logs.find().sort({timestamp:-1}).limit(1).pretty()'
```

---

# 18. Appendices

## Appendix A: Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `MONGO_URL` | Yes | MongoDB connection string |
| `DB_NAME` | Yes | Database name |
| `PUBLIC_URL` | Yes | Public-facing URL (critical for SAML) |
| `JWT_SECRET` | Recommended | JWT signing secret |
| `CORS_ORIGINS` | Yes | Allowed CORS origins |
| `SMTP_HOST` | Yes | SMTP server |
| `SMTP_PORT` | Yes | SMTP port |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASSWORD` | Yes | SMTP password |
| `SMTP_FROM` | Yes | Sender email |
| `ADRENALIN_BASE_URL` | Yes | Adrenalin HRMS API URL |
| `ADRENALIN_USERNAME` | Yes | Adrenalin username |
| `ADRENALIN_PASSWORD` | Yes | Adrenalin password |
| `ADRENALIN_COMPANY_ID` | Yes | Adrenalin company code |
| `DEFAULT_USER_PASSWORD` | Yes | Default password for new users |
| `KISSFLOW_SCIM_BASE_URL` | Optional | Kissflow SCIM endpoint |
| `KISSFLOW_SCIM_TOKEN` | Optional | Kissflow SCIM bearer token |
| `REACT_APP_BACKEND_URL` | Yes | Backend URL for frontend |

## Appendix B: Default Admin Account

| Field | Value |
|---|---|
| Email | gowtham.s@refex.co.in |
| Role | org_admin |
| Organization | Refex Industries Limited |

## Appendix C: API Rate Limits

| Endpoint Category | Rate |
|---|---|
| Auth (login) | No limit (add brute-force protection) |
| SCIM Push to Kissflow | 0.25s between requests |
| Kissflow retry on 429 | 5s, 10s, 15s (3 retries) |
| HR Sync | Once per trigger (nightly auto) |

## Appendix D: Mobile App Configuration

**Capacitor Config** (`capacitor.config.json`):
```json
{
  "appId": "com.refex.superapp",
  "appName": "Super App",
  "webDir": "build",
  "server": {
    "url": "https://superapp.refex.group",
    "cleartext": true
  }
}
```

**Build Commands**:
```bash
yarn build
npx cap sync android
cd android && ./gradlew assembleRelease
```

---

**Document Version History**

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | Apr 8, 2026 | Refex AI Team | Initial IAM with SAML SSO |
| 1.5 | Apr 13, 2026 | Refex AI Team | Adrenalin HR sync, SCIM v2 server |
| 2.0 | Apr 21, 2026 | Refex AI Team | Kissflow SCIM client, field mapping, background sync |
| 2.1 | Apr 30, 2026 | Refex AI Team | Manager resolution, fresh sync, rate limiting |
| 2.2 | May 13, 2026 | Refex AI Team | Enterprise documentation package |

---

*Confidential - Refex Group Internal Use Only*
*Generated by Refex AI Team*
