# Kissflow IAM - Product Requirements Document

## Original Problem Statement
Build a mobile and web super app integrated with SSO for Kissflow application, configured with SAML/OpenID/User Provisioning. Expanded to a full IAM system with multiple SAML apps, OpenID Connect apps, multi-tenant organizations, and role-based access.

## Architecture
- **Frontend**: React (with Shadcn UI, Phosphor Icons)
- **Backend**: FastAPI + MongoDB
- **Auth**: JWT-based with bcrypt password hashing
- **SAML**: signxml library for XML signing, lxml for XML construction
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
- **User Assignment**: Assign/remove users to SAML apps - only assigned users see apps in Launcher
- **Access Control**: org_admin always has access; regular users need explicit assignment via user_ids, groups, or roles

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
- [x] SAML SSO redirect fix (public URL instead of cluster URL)
- [x] SAML response signing with signxml
- [x] End-to-end SAML flow for Kissflow

## P1 - Upcoming
- [ ] SCIM v2 User Provisioning endpoints (/api/scim/v2/*)
- [ ] OIDC flow end-to-end testing and verification

## P2 - Backlog
- [ ] Refactor server.py into modular routers (routes/, utils/, models/)
- [ ] MFA support
- [ ] Session management improvements
