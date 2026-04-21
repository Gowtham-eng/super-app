# Kissflow IAM - Product Requirements Document

## Original Problem Statement
Build a mobile and web super app integrated with SSO for Kissflow application, configured with SAML/OpenID/User Provisioning. Expanded to a full IAM system with multiple SAML apps, OpenID Connect apps, multi-tenant organizations, and role-based access.

## Architecture
- **Frontend**: React (Shadcn UI, Lucide React icons, Outfit/Manrope fonts)
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT-based with bcrypt password hashing
- **SAML**: signxml library for XML signing, lxml for XML construction
- **Design**: Emerald/slate palette, light theme only, Refex branding
- **Key Env**: PUBLIC_URL in backend/.env for SAML endpoint URL construction

## What's Been Implemented

### Core IAM (DONE)
- Multi-tenant organizations with domain-based isolation
- User management (CRUD, roles, groups, status)
- Role-Based Access Control with permissions
- Group management with nested hierarchy
- Access policies (IP whitelist/blacklist, time restrictions)
- Access request workflow (request, approve, reject)
- Audit logging for all operations
- Dashboard with stats

### SAML SSO (DONE - Apr 8, 2026)
- SAML 2.0 Identity Provider implementation
- Self-signed certificate generation per SAML app
- Signed SAML responses (RSA-SHA256 via signxml)
- IdP-initiated and SP-initiated SSO flows
- RelayState support
- Kissflow-specific config endpoint (manual configuration extraction)
- SSO, SLO, metadata, and complete endpoints
- Public URL resolution via PUBLIC_URL env var (fixes K8s cluster URL issue)
- **SSO Test Button**: Inspect & send SAML assertions from SAML Apps page

### App Management (DONE)
- SAML app CRUD with certificate management
- OIDC app CRUD with client_id/client_secret generation
- App Launcher (Zoho One-style: welcome header, search, icon grid)
- App Catalog (browse and request access)
- **User Assignment**: Assign/remove users to SAML apps. App access via approved_user_ids only (explicit assignment).
- **Access Control**: org_admin always has access; regular users need explicit assignment.
- **Logo Upload**: File upload endpoint (`/api/upload/logo`) for app logos instead of URL-only.
- **User Forms**: App assignment checkboxes in both create and edit user modals.

### Frontend Pages (DONE)
- Login/Register with organization selection
- Login page with Refex branding, business carousel (Ash, Green Mobility, Wind), no register
- Dashboard (admin only), App Launcher ("My Apps"), App Catalog ("Request Access")
- SAML Apps, OIDC Apps management (admin only)
- Users, Groups, Roles, Policies management (admin only)
- Access Requests (admin only), Audit Logs (admin only)
- **Role-based UI**: Admins see full sidebar; Users see only "My Apps" + "Request Access"
- **Route protection**: AdminRoute redirects users to /launcher for admin-only pages

## P0 - Completed
- [x] Mobile App Launcher: Zoho Workplace-style compact 4-col icon grid (no scrolling needed) - Apr 9 2026
- [x] Profile dropdown: Clickable avatar in mobile header with profile pic upload + sign out - Apr 9 2026
- [x] Bug fix: SP-initiated SSO access check - allow users with access to sibling apps (same ACS URL) - Apr 9 2026
- [x] Bug fix: SAML module deep-linking - iframe auth + redirect to specific module home_url - Apr 9 2026
- [x] HR Sync from Adrenalin HRMS: auto-create users, disable exited employees, daily midnight schedule - Apr 9 2026
- [x] Access Request system: users request access, admin approve/reject with email notifications - Apr 9 2026
- [x] SMTP email integration (Zoho) for access request notifications and sync reports - Apr 9 2026
- [x] Security fix: removed duplicate insecure access request routes - Apr 9 2026
- [x] SAML SSO redirect fix (public URL instead of cluster URL)
- [x] SAML response signing with signxml
- [x] End-to-end SAML flow for Kissflow
- [x] Role-based UI (admin vs user)
- [x] User assignment to apps (explicit access control)
- [x] Logo file upload
- [x] App tiles with Home URL (post-SSO redirect to specific Kissflow modules)
- [x] 30-day persistent JWT sessions
- [x] PWA support (manifest + service worker)
- [x] Bug fix: SAML base64 encoding (clean output, no newlines/spaces, proper padding) - Apr 8 2026
- [x] Bug fix: Logo upload routing (/api/uploads/ mount for K8s ingress compatibility) - Apr 8 2026
- [x] Bug fix: SAML X509Certificate PEM newlines stripped from XML (Kissflow strict parser) - Apr 8 2026
- [x] Bug fix: SAML Signature element position (moved after Issuer per schema) - Apr 8 2026
- [x] Bug fix: Shared SP support (multiple apps with same entity_id use primary Issuer) - Apr 8 2026
- [x] Bug fix: Kissflow RelayState removed (Kissflow cannot handle RelayState) - Apr 8 2026
- [x] OIDC Provider: Full OAuth2/OIDC IdP flow (authorize, token, userinfo) - Apr 8 2026
- [x] PWA native app deep-linking (opens Kissflow app on mobile, fallback to store) - Apr 8 2026
- [x] Removed 'Made with Emergent' badge - Apr 8 2026
- [x] OIDC form: Logo upload, Home URL field, integration credentials display - Apr 8 2026
- [x] OIDC apps in App Launcher tiles - Apr 8 2026
- [x] Mobile PWA: Tiles use location.href for native app universal link support - Apr 8 2026
- [x] Android APK: Capacitor native wrapper with Kissflow deep-linking - Apr 8 2026

- [x] SCIM v2 Server: Full RFC 7643/7644 compliant endpoints (Users CRUD, Groups CRUD, Discovery) - Apr 10 2026
- [x] SCIM Token Management: Admin generate/revoke bearer tokens - Apr 10 2026
- [x] SCIM Setup UI: Admin page with Kissflow connection guide - Apr 10 2026
- [x] Full Adrenalin HR field capture: All 30 API fields + L1/L2 Manager email resolution - Apr 13 2026
- [x] SCIM Refex extension schema: exposes all HR fields via urn:ietf:params:scim:schemas:extension:refex:2.0:User - Apr 13 2026
- [x] Kissflow Outbound SCIM Client: Push IAM users TO Kissflow's SCIM Server (create/update/deactivate) - Apr 14 2026
- [x] Kissflow SCIM auto-sync: Automatically pushes users to Kissflow after nightly Adrenalin HR sync - Apr 14 2026
- [x] Kissflow SCIM manual sync: Admin can trigger full sync or push individual users from UI - Apr 14 2026
- [x] Kissflow SCIM real-time push: User updates via Admin User Master auto-push to Kissflow - Apr 14 2026
- [x] Kissflow SCIM config: Env var + DB config (with admin UI to save/update) - Apr 14 2026
- [x] Kissflow SCIM sync logs: Track all sync operations with trigger type and results - Apr 14 2026
- [x] SCIM Setup UI redesigned: Tabbed UI with Outbound (Push to Kissflow) and Inbound (SCIM Tokens) sections - Apr 14 2026
- [x] Kissflow SCIM field mapping fix: Discovered and implemented Kissflow custom extension schema (urn:kissflow:scim:schemas:extension:AcCMptlq60zH:2:User) with exact field IDs (Employee_ID, Manager, L2_Manager, Designation_1, Department_Code, Branch, Location_1, Office_Location, Employee_Status, Date_of_Exit, L1_Manager_Name, L1_Manager_Email) - Apr 21 2026
- [x] Background sync: Full sync runs as background task to avoid 502 timeout - Apr 21 2026
- [x] Rate limiting & retry: 0.5s delay between SCIM requests, retry on 429, early stop after 5 consecutive auth errors - Apr 21 2026

## P1 - Upcoming
- [ ] OIDC flow end-to-end testing and verification

## P2 - Backlog
- [ ] Refactor server.py into modular routers (routes/, utils/, models/)
- [ ] MFA support
- [ ] Session management improvements
