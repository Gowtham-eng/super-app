# Kissflow SSO Super App - PRD

## Problem Statement
Create a mobile and web app (Super App) for SSO integration with Kissflow application, supporting SAML 2.0, OpenID Connect, and user provisioning (SCIM, JIT, Manual).

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python) with MongoDB
- **Frontend**: React with Shadcn UI components
- **Authentication**: JWT-based with bcrypt password hashing
- **SSO Protocols**: SAML 2.0, OpenID Connect 1.0
- **User Provisioning**: SCIM 2.0, JIT, Manual

### Key Components
1. **Identity Provider (IdP)**: Acts as the SSO identity provider for Kissflow
2. **Metadata Generator**: Generates SAML/OIDC metadata for Kissflow configuration
3. **User Management**: Handles user provisioning and lifecycle management
4. **Connection Testing**: Validates SSO configuration

## User Personas
1. **IT Administrator**: Configures SSO settings, manages users, downloads metadata
2. **End User**: Logs in via SSO to access Kissflow

## Core Requirements (Static)
- [x] SAML 2.0 configuration with metadata generation
- [x] OpenID Connect configuration with discovery document
- [x] User provisioning (Manual, SCIM, JIT)
- [x] JWT authentication
- [x] Dashboard with SSO status overview
- [x] Connection testing functionality
- [x] Certificate generation for SAML signing

## What's Been Implemented

### April 7, 2026 - MVP Release
- **Login/Registration**: Swiss brutalist design with secure authentication
- **Dashboard**: Shows total users, SAML/OIDC status, provisioning stats
- **SAML Configuration**: 
  - Entity ID, ACS URL, SLO URL configuration
  - Name ID format selection
  - Assertion/Response signing toggles
  - Auto-generated X.509 certificates
  - Metadata XML generation & download
- **OIDC Configuration**:
  - Client ID & secret generation
  - Redirect URIs management
  - Scope selection (openid, profile, email)
  - Discovery document (.well-known/openid-configuration)
- **User Management**:
  - Manual user provisioning
  - SCIM 2.0 endpoints
  - User edit/delete functionality
  - Status management (active, pending, inactive)
- **Settings Page**: All SSO endpoint URLs for Kissflow integration

## Prioritized Backlog

### P0 (Critical) - Done
- [x] SAML metadata generation
- [x] OIDC discovery document
- [x] User authentication
- [x] Basic user management

### P1 (High Priority) - Future
- [ ] SAML SSO endpoint (actual authentication flow)
- [ ] OIDC authorization/token endpoints (actual flow)
- [ ] JIT provisioning implementation
- [ ] Multi-tenant support
- [ ] Audit logging

### P2 (Medium Priority) - Future
- [ ] Custom attribute mapping
- [ ] Group/role sync with Kissflow
- [ ] Session management
- [ ] Rate limiting

## Next Tasks
1. Implement actual SAML SSO flow (SP-initiated and IdP-initiated)
2. Implement OIDC authorization code flow
3. Add audit logging for security compliance
4. Implement JIT provisioning on first login
