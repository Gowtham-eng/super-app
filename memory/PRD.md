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

### App Management (DONE)
- SAML app CRUD with certificate management
- OIDC app CRUD with client_id/client_secret generation
- App Launcher (portal for authorized users)
- App Catalog (browse and request access)

### Frontend Pages (DONE)
- Login/Register with organization selection
- Dashboard, App Launcher, App Catalog
- SAML Apps, OIDC Apps management
- Users, Groups, Roles, Policies management
- Access Requests (submit/approve/reject)
- Audit Logs viewer

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
