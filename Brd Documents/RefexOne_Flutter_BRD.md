# RefexOne – Flutter Frontend (Web, Android, iOS)
## Business Requirements Document

| Item | Value |
|---|---|
| Document | Business Requirements Document (BRD) |
| Version | 2.1 (draft for review) |
| Date | 30-Oct-2026 |
| System | RefexOne (refexone.com) – IAM launcher, SSO identity provider, Help Desk (ITSM), Refexions chat |
| Source reviewed | super-app repo, branch itsmbackuplatest, commit 2184f48; docs/FLOW_RUNBOOK.md flows F01–F15 |
| Change type | Frontend only. Backend (FastAPI + MongoDB) stays unchanged. |
| Companion document | RefexOne_Flutter_Migration_Assessment.docx |
| Status | Analysis only. No code was changed in RefexOne, Notification Engine or aasik_ITSM. |

## 1. Executive summary

**Purpose.** This document defines what the new RefexOne frontend must do. RefexOne's React web frontend and its two web-view phone shells (Android Capacitor, iOS WKWebView) are to be replaced by one Flutter codebase for Web, Android and iOS.

**Business need.** One codebase for all platforms, a fully responsive UI from 320 px phones to large desktops, and a native phone experience, while every existing function and the current login and SSO behaviour stay the same.

**Key constraint.** The backend (FastAPI + MongoDB) must not change. The review confirmed this is possible: every screen uses the same REST APIs with a Bearer token, and every login and SSO flow ends on URLs the backend already produces.

**Acceptance.** Every checklist item in FLOW_RUNBOOK F01–F15 and the P0 smoke suite must pass on Web, Android and iOS with the same accounts as today.

Migration effort, disadvantages, risks, release impact and options are in the companion Migration Assessment document.

## 2. Current system (baseline)

| Layer | Today |
|---|---|
| Web frontend | React 19, Create React App + craco, Tailwind, Radix/shadcn (46 shared UI components), react-router 7, axios. 25 page files (about 15,800 lines) plus 5 feature components (about 2,400 lines). Served by Nginx from frontend/build on the production server (/opt/superapp). |
| Backend | FastAPI (server.py about 4,400 lines + routes azure_ad, google_oauth, itsm, refexions, scim, user_master), uvicorn :8001 behind Nginx, MongoDB, APScheduler (Adrenalin HR sync), SMTP mail. |
| Android app | Capacitor 6 BridgeActivity, package com.refex.refexone, version 1.0.10 (build 10), minSdk 22, target 36. Loads https://refexone.com live. Native extras: per-domain Kissflow cookie clearing, RefexOneBridge (clear Kissflow session, open Adrenalin app, open external URL), Play Store intents, force-update check GET /api/app-update/check. |
| iOS app | Swift WKWebView app (RefexSuperApp), bundle com.refex.refexone (live) and com.refex.refex (Superapp listing), version 1.0.10 (10), iOS 15+. Loads https://refexone.com live, same update check and Kissflow session handling. |
| Web extras | sw.js service worker (network-first, HTML never cached), manifest.json (PWA install), privacy-policy.html, Google site-verification file, icons, setup-guide HTML pages. |
| Auth token | JWT in localStorage (iam_token) and cookie iam_token on refexone.com. Backend reads the Bearer header, a ?token= query, or the cookie (cookie resumes SP-initiated SAML). |

### 2.1 Screen inventory (to be rebuilt)

| Screen / component | Lines | Main API groups | Audience |
|---|---|---|---|
| Login (/login, /developerlogin) | 594 | auth, azure-ad/providers, google-oauth/providers | All |
| AppLauncher (/launcher) | 955 | launcher/apps, itsm/kissflow-status, SAML complete, OIDC | All |
| RefexionsChat (launcher widget) | 926 | refexions/*, itsm/* | All |
| AppCatalog (/catalog) | 141 | catalog/apps, access-requests | All |
| AccessRequests (/access-requests, /requests) | 132 | access-requests | User + Admin |
| AppDownload (/download, public) + RefexOneAppDownload | 134 + 183 | app-download/links | Public |
| Layout (header, profile, password, photo) | 610 | users/me, auth/change-password, upload | All |
| ITSMDashboard (/itsm) | 2,559 | itsm/reports, comments, rating, reopen, attachments | All |
| CreateITRequest (/itsm/new) | 1,622 | itsm/config, approval-matrix, locations, tickets | All |
| CommentAttachmentPreview | 587 | itsm/reports attachment-preview | All |
| Dashboard (/) | 132 | dashboard/stats | Admin |
| Users | 1,416 | users, apps, groups, roles, kissflow-scim/link-user, export | Admin |
| Groups / Roles / Policies | 266 / 206 / 309 | groups, roles, permissions, policies | Admin |
| SAMLApps / OIDCApps | 768 / 934 | apps/saml, apps/oidc, upload/logo | Admin |
| MobileApps (/apps/mobile, /settings/app-update) | 539 | apps/mobile, app-update/config | Admin |
| AuditLogs | 202 | audit-logs | Admin |
| HRSync | 170 | hr-sync | Admin |
| SCIMSetup | 726 | scim/tokens, kissflow-scim, user-master | Admin |
| ITSMSetup | 1,077 | itsm/admin/*, config/environments | Admin |
| RefexionsSetup | 829 | refexions/admin | Admin |
| AzureADSetup / GoogleSetup | 494 / 655 | azure-ad/*, google-oauth/* | Admin |
| Settings | 149 | org, upload/logo | Admin |
| SAMLConfig / OIDCConfig | 391 / 429 | saml/config, oidc/config | Not routed in App.js today – confirm if still needed |

## 3. Business objectives

| ID | Objective | Measure |
|---|---|---|
| BO-1 | One codebase for Web, Android, iOS | A single Flutter repo builds all three targets |
| BO-2 | Fully responsive UI | Passes layout checks at 320, 360, 390, 414, 768, 1024, 1280, 1440, 1920 px, portrait and landscape |
| BO-3 | Native mobile experience | Native navigation, faster start, biometric unlock, camera upload |
| BO-4 | Zero backend change | No commit to backend/ required for go-live |
| BO-5 | No loss of function | Every FLOW_RUNBOOK F01–F15 checklist item and P0-1 to P0-8 passes on all three platforms |
| BO-6 | Same login and SSO behaviour | Same providers, redirects, landing pages and Kissflow / Adrenalin / NE results |

## 4. Scope

**In scope**

- Rebuild all user and admin screens in Flutter (Dart) for Web, Android and iOS.
- Responsive layouts for phone, tablet and desktop.
- New native mobile shells replacing Capacitor (Android) and the Swift web-view app (iOS), including Kissflow cookie handling, Adrenalin hand-off and the force-update gate.
- Same store identity: Android com.refex.refexone; iOS com.refex.refexone and Superapp com.refex.refex; version numbers continue from 1.0.10 / build 10.
- Web hosting of the Flutter web build at https://refexone.com with the same URL paths.

**Out of scope**

- Any change to FastAPI backend code, MongoDB data, APIs, SAML/OIDC/SCIM logic, HR sync, SMTP mail, ITSM comment-mail rules or failure alerts.
- Kissflow, Adrenalin, Notification Engine and other connected apps.
- New business features (can follow after parity).

## 5. Constraints and assumptions – backend unchanged

Verified against the code: no backend code change is required.

| Area | Why it works unchanged | Frontend requirement |
|---|---|---|
| All REST APIs | Bearer JWT in the Authorization header | API client with a token interceptor; base URL https://refexone.com/api |
| CORS | Flutter Web is served from refexone.com; native apps are not subject to CORS | Host the Flutter web build on the same domain |
| Password login | POST /api/auth/login returns the JWT | Keychain/Keystore on mobile; localStorage + iam_token cookie on web |
| Microsoft / Google login | Callback already redirects to https://refexone.com/login?azure_token= / google_token= (or *_error) | Web: same /login route. Mobile: read the token from an in-app web view (as today) or system browser + App Links |
| SP-initiated SAML (Kissflow to RefexOne) | Backend sends the browser to /login?sso_app=&relay_state= and resumes with the iam_token cookie | Flutter Web keeps the same /login params and sets the cookie exactly as today |
| IdP-initiated SAML (launcher to Kissflow / Adrenalin) | /api/saml/{id}/complete?token= returns an auto-POST page | Open it in an in-app web view (mobile) or a new tab (web) |
| OIDC apps and NE Reports | /api/oidc/{id}/authorize, then code and token | Same launch URL with embed=1, return_to, user_name, user_title |
| Force update | /api/app-update/check?platform=&build= and admin config | Call on start with the new build number |
| File uploads | Multipart endpoints | Native camera/file picker; same 5 MB rule |
| Refexions | REST endpoints; voice is client-side | Native speech plugin on mobile, browser speech on web |

### 5.1 Non-code items still required

| Item | Needed when | Owner |
|---|---|---|
| /.well-known/apple-app-site-association and /.well-known/assetlinks.json as static files on refexone.com | Only if phone login uses the system browser + App Links | Web server / DevOps |
| Extra redirect URI in Azure App Registration / Google Cloud client | Only if a new redirect address is chosen | IT admin (console setting) |
| Existing Android signing key and Apple team certificates | Always | Mobile release owner |
| Store listing updates (screenshots, privacy labels, public-listing wording) | Always | Mobile release owner |

## 6. Platform and responsive requirements

| ID | Requirement |
|---|---|
| PR-1 | Breakpoints: phone under 600 px, tablet 600–1023 px, desktop 1024 px and up. Layout follows available width, so split screen, iPad multitasking and small browser windows work. |
| PR-2 | Minimum width 320 px with no horizontal page scroll. Tables become card lists on phones. |
| PR-3 | Readable without clipping with OS text size up to 200 %. |
| PR-4 | Safe areas respected (notch, dynamic island, Android gesture bar). |
| PR-5 | Portrait and landscape on phone and tablet. |
| PR-6 | Same fonts (Inter / Plus Jakarta Sans), brand colours and logo. |
| PR-7 | Web: Chrome, Edge, Safari, Firefox (current and previous major). Clean URLs without #. Back, forward and refresh keep the screen. |
| PR-8 | Android: current Flutter stable minimum. Today's app supports Android 5.1 (API 22); very old phones may lose updates. |
| PR-9 | iOS 15.0+ on iPhone and iPad (same as today). |
| PR-10 | Accessibility: screen-reader labels, 44 x 44 tap targets, AA contrast, keyboard navigation on web. |

## 7. Functional requirements (mapped to FLOW_RUNBOOK)

Each requirement must behave exactly as today unless noted.

| ID | Flow | Requirement | Platforms |
|---|---|---|---|
| FR-01.1 | F01 | Login shows Microsoft and Google buttons from the provider APIs, with the multi-company Microsoft picker | All |
| FR-01.2 | F01 | Password login only on /developerlogin | All |
| FR-01.3 | F01 | Handle azure_token, azure_error, google_token, google_error and clear them from the URL | All |
| FR-01.4 | F01 | Keep sso_app, relay_state, oidc_redirect through login and complete the SSO redirect afterwards | Web |
| FR-01.5 | F01 | Forced password change blocks other screens until done | All |
| FR-01.6 | F01 | Session survives restart via /api/auth/me; logout clears token, cookie and Kissflow session | All |
| FR-01.7 | F01 | Admin lands on dashboard, user on launcher; non-admin on admin route goes to launcher | All |
| FR-01.8 | F01 | Optional: biometric unlock of the saved session | Android, iOS |
| FR-02.1 | F02 | Upload JPEG/PNG/HEIC profile photo up to 5 MB; change password | All |
| FR-03.1 | F03 | Greeting, search, tiles, Reports tab split (Consolidated + Application Usage) | All |
| FR-03.2 | F03 | Kissflow SAML: clear Kissflow cookies (mobile), open SAML complete with mobile_module or module_url | All |
| FR-03.3 | F03 | Adrenalin: SAML in web view; open native app via adrmax2scheme:// / com.myadrenalin.max2, store fallback | Android, iOS |
| FR-03.4 | F03 | OIDC tiles append user_name, user_title, return_to; return to launcher | All |
| FR-03.5 | F03 | Help Desk and PM Tracker tiles: Kissflow SSO when allowed, else in-app fallback | All |
| FR-03.6 | F03 | Restricted tiles (RMC P2P, Procure-to-Pay, Reports chief-title) follow the same rules | All |
| FR-03.7 | F03 | Web desktop: Kissflow opens in a separate tab and deep-links the module; Safari handling kept | Web |
| FR-04.1 | F04 | Request access, admin approve/reject, user cannot approve own request | All |
| FR-05.1 | F05 | SAML apps admin: CRUD, metadata, test assertion, copy Base64 response, logo | All (web-first) |
| FR-06.1 | F06 | OIDC apps admin: CRUD, regenerate secret, discovery/JWKS links, restricted assignment | All (web-first) |
| FR-07.1 | F07 | Dashboard stats; users create/edit/disable/export/reset; groups, roles, permissions, policies, audit | All (web-first) |
| FR-08.1 | F08 | HR sync trigger and logs | All (web-first) |
| FR-09.1 | F09 | SCIM tokens, Kissflow SCIM config/sync/logs/resolve managers, User Master tokens | All (web-first) |
| FR-10.1 | F10 | Ticket list with count, filters, search, Refex and Non-Refex, status tabs; card list on phone | All |
| FR-10.2 | F10 | Create ticket (Refex approval matrix; Non-Refex Kissflow locations; subject required) | All |
| FR-10.3 | F10 | Reopen, rating, comment, comment with files, attachment preview (images, PDF, documents) | All |
| FR-10.4 | F10 | Optional: camera capture for attachments | Android, iOS |
| FR-11.1 | F11 | ITSM Setup environments, entities, test matrix, seed defaults, with production confirmations | All (web-first) |
| FR-12.1 | F12 | Refexions menus, IT match/create, policy send, voice input; Refexions Setup admin | All |
| FR-13.1 | F13 | Azure / Google config, callback URL, provider buttons, Azure user sync | All (web-first) |
| FR-14.1 | F14 | Mobile apps admin, app-update config, public /download page | All |
| FR-15.1 | F15 | Organisation name and logo | All (web-first) |

## 8. Integration contracts that must not change

| Contract | Value to preserve |
|---|---|
| Web routes | /login, /developerlogin, /download, /, /launcher, /catalog, /itsm, /itsm/new, /access-requests and all admin routes in App.js |
| Login query params | sso_app, relay_state, oidc_redirect, azure_token, azure_error, google_token, google_error |
| Token | Authorization: Bearer iam_token; on web also cookie iam_token (Path=/, same SameSite, Secure and Max-Age) |
| SAML launch | /api/saml/{app_id}/complete?token= plus module_url (desktop) or mobile_module (mobile) |
| NE embed launch | embed=1, return_to=https://refexone.com/launcher (encoded), user_name, user_title |
| Adrenalin | scheme adrmax2scheme://, Android package com.myadrenalin.max2 |
| Update check | /api/app-update/check?platform=android or ios&build=integer |
| Static web files | privacy-policy.html, Google verification HTML, manifest.json, icons, setup-guide pages |

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Mobile: cold start to launcher within 2.5 s on a mid-range phone with a saved session; 60 fps transitions |
| NFR-2 | Web: login page loads within 3 s on 4G; admin modules loaded on demand so normal users do not download them; compare with today's React baseline before go-live |
| NFR-3 | Security: token in Keychain/Keystore; no Kissflow/BOT/policy keys in the client; TLS only; remove today's cleartext and mixed-content allowance |
| NFR-4 | Reliability: same API error messages; offline banner; retry on lists |
| NFR-5 | Accessibility: PR-10 |
| NFR-6 | Audit: backend audit events unchanged; frontend calls the same endpoints |
| NFR-7 | Observability: crash reporting on mobile (Crashlytics or Sentry) |

## 10. Release and distribution requirements

| ID | Requirement |
|---|---|
| RR-1 | Android package stays com.refex.refexone and is signed with the existing upload key (Play App Signing), so current users receive it as an update. |
| RR-2 | iOS keeps both records: com.refex.refexone (live) and com.refex.refex (RefexOne Superapp), following the public-listing rules in FLOW_RUNBOOK section 8. |
| RR-3 | Version numbers continue from 1.0.10 / build 10 (for example 2.0.0 / build 11). |
| RR-4 | The app calls /api/app-update/check on start with its build number and honours force / optional update exactly as today. |
| RR-5 | Web build is served from https://refexone.com with no-cache on index.html and bootstrap files so a deploy reaches users on the next page load. |
| RR-6 | Static web files listed in the integration contracts (privacy policy, Google verification file, manifest, icons, setup guides) stay available at the same URLs. |
| RR-7 | Crash reporting is enabled on Android and iOS before go-live. |

## 11. Acceptance criteria and testing

- Acceptance tests: FLOW_RUNBOOK section 3 checklists F01–F15 and P0-1 to P0-8, on each platform.
- Devices: low-end Android (API 24–26), mid-range Android, latest Android; iPhone SE, current iPhone, iPad; desktop Chrome, Edge, Safari, Firefox at 1280 and 1920 px; browser at 360 px width.
- Roles: normal user, admin, Refex user, Non-Refex user, chief-title user (Reports), user without Kissflow ID.
- Backend pytest suites must pass unchanged (proves no backend impact).
- Before/after comparison with the same accounts (runbook section 2).

## 12. Open decisions affecting requirements

1. Phone Microsoft/Google login: in-app web view (same as today) or system browser + App Links?
2. Are the SAMLConfig and OIDCConfig screens (not routed in App.js today) still required?
3. Push notifications in scope now? This needs a backend sender later and is outside "no backend change".
4. Accept dropping Android 5.1–6 devices?

Prepared from a read-only review. No code in RefexOne, Notification Engine or aasik_ITSM was changed.
