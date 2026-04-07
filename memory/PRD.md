# Kissflow IAM - Identity & Access Management - PRD

## Problem Statement
Create a full IAM (Identity & Access Management) system for Kissflow SSO integration with:
- Multiple SAML 2.0 and OpenID Connect applications
- Role-based access with groups hierarchy
- Custom roles with granular permissions
- Access policies (IP restrictions, time-based)
- Access requests & approvals workflow
- Audit logs & compliance reporting
- App launcher portal (like Okta/OneLogin)
- Multi-tenant support with separate organizations

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python) with MongoDB
- **Frontend**: React with Shadcn UI components
- **Authentication**: JWT-based with bcrypt password hashing
- **SSO Protocols**: SAML 2.0, OpenID Connect 1.0
- **User Provisioning**: SCIM 2.0, Manual

### Database Collections
- organizations
- users
- groups
- roles
- permissions
- saml_apps
- oidc_apps
- access_policies
- access_requests
- audit_logs

## User Personas
1. **Super Admin**: Manages multiple organizations
2. **Org Admin**: Manages their organization's IAM settings
3. **User Manager**: Manages users and groups
4. **End User**: Accesses applications via SSO

## Core Requirements (Static)
- [x] Multi-tenant organization support
- [x] Multiple SAML applications per organization
- [x] Multiple OIDC applications per organization
- [x] Groups with hierarchical structure
- [x] Custom roles with granular permissions
- [x] Access policies (IP whitelist/blacklist, time restrictions)
- [x] Access request & approval workflow
- [x] Comprehensive audit logging
- [x] App launcher portal
- [x] App catalog with access requests

## What's Been Implemented

### April 7, 2026 - Full IAM System
**Organization Management:**
- Create organizations with domain
- First user becomes org_admin
- Organization-scoped data isolation

**Application Management:**
- Multiple SAML 2.0 apps with metadata generation
- Multiple OIDC apps with discovery documents
- Per-app access restrictions (groups/roles)
- Auto-generated certificates for SAML signing

**Identity Management:**
- Groups with parent hierarchy
- Custom roles with permissions
- 10 system permissions (apps, users, groups, roles, policies, audit, etc.)
- System roles: Administrator, User Manager, Viewer

**Access Control:**
- IP whitelist/blacklist policies
- Time-based restrictions (UTC hours)
- App-specific or global policies
- Policy enable/disable toggle

**Workflow:**
- Access request submission
- Admin approval/rejection
- Auto-assign to groups on approval

**Audit & Compliance:**
- All actions logged with timestamp
- User, action, resource tracking
- IP address logging
- CSV export functionality

**App Launcher:**
- User's accessible apps
- Policy-blocked indicators
- Quick launch functionality

## Test Results
- Backend: 97.6% (41/42 tests passed)
- Frontend: 100% (13/13 tests passed)

## Prioritized Backlog

### P0 (Critical) - Done
- [x] Multi-tenant organizations
- [x] Multiple SAML/OIDC apps
- [x] Groups and roles
- [x] Access policies
- [x] Audit logging

### P1 (High Priority) - Future
- [ ] Actual SAML SSO flow implementation
- [ ] Actual OIDC authorization code flow
- [ ] JIT provisioning on SSO
- [ ] Password reset flow
- [ ] MFA support

### P2 (Medium Priority) - Future
- [ ] Attribute mapping UI
- [ ] Group sync with external providers
- [ ] Session management dashboard
- [ ] Compliance report generation
- [ ] Webhook notifications

## Next Tasks
1. Implement actual SAML SSO authentication flow
2. Implement OIDC authorization code flow with token issuance
3. Add MFA support for admin users
4. Add password reset functionality
