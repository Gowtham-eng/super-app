# RefexOne – Flutter Frontend Migration (Web, Android, iOS)
## Business Requirements Document, Migration Assessment and Risk Analysis

| Item | Value |
|---|---|
| Document | BRD + Migration Assessment + Risk Analysis |
| Version | 2.0 (draft for review) |
| Date | 30-Oct-2026 |
| System | RefexOne (refexone.com) – IAM launcher, SSO identity provider, Help Desk (ITSM), Refexions chat |
| Source reviewed | super-app repo, branch itsmbackuplatest, commit 2184f48; docs/FLOW_RUNBOOK.md flows F01–F15 |
| Change type | Frontend only. Backend (FastAPI + MongoDB) stays unchanged. |
| Status | Analysis only. No code was changed in RefexOne, Notification Engine or aasik_ITSM. |

## 1. Executive summary

**Goal.** Replace the current React web frontend and the two native web-view shells (Android Capacitor, iOS WKWebView) with one Flutter codebase that runs on Web, Android and iOS, is fully responsive (320 px phones to large desktops) and keeps every current function working.

**Can the backend stay unchanged?** Yes. No backend code needs to change. Every screen uses the same REST APIs with a Bearer token, and every login and SSO flow (SAML, OIDC, Microsoft, Google) ends on URLs the backend already produces. Three non-code items are still needed (section 7.1): two static App-Link files on the web server (only if phone login moves to the system browser), optional redirect entries in the Azure/Google consoles, and the existing store signing keys.

**Will the phone app still update instantly?** No. Today both phone apps open https://refexone.com inside a web view, so a web deploy changes the phone screens within minutes. A native Flutter app has its screens built into the app, so every UI change on Android and iOS needs a new build, store review and users installing the update (hours to 3 days). The web version stays instant. See section 12.

**Assessment verdict.** The migration is technically feasible with zero backend change, but it is a full rewrite (about 18,000 lines of React UI, 25 screens, 46 shared UI components) and it does not remove web views: Kissflow, Adrenalin and NE Reports stay web apps opened inside the Flutter app. The risk register has 20 risks, 3 rated High: login/SSO regression at cutover, loss of instant UI updates, and missed hidden behaviour in the existing code.

**Recommendation.** Start with a 2-week proof gate (Phase 0). If the main goal is better phone apps, choose Option B (Flutter mobile, web stays React, about 14–16 weeks). Choose Option C (full Flutter for Web + Android + iOS, about 23–25 weeks) only if one codebase for the web admin consoles is a firm requirement.

## 2. Current state (as-is)

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

## 5. Migration assessment

### 5.1 Assessment method

Each area was scored on four factors from the code and the flow runbook: Complexity (size and logic), Web dependency (how much of the flow must stay in a browser), Native gain (benefit of going native) and Test effort. The verdict says how the area should be migrated.

### 5.2 Assessment by functional area

| Flow | Area | Complexity | Web dependency | Native gain | Test effort | Verdict |
|---|---|---|---|---|---|---|
| F01 | Login and session | High | High (OAuth and SSO redirects) | Medium (biometrics, secure storage) | High | Migrate after Phase 0 proof |
| F02 | Profile, password, photo | Low | None | Medium (camera) | Low | Ready to migrate |
| F03 | App Launcher (tiles, search, Reports tabs) | High | High (all launches are SSO) | Low | High | Migrate UI; launches use web view |
| F04 | Catalog and access requests | Low | None | Low | Low | Ready to migrate |
| F05 / F06 | SAML and OIDC launch (Kissflow, Adrenalin, NE Reports) | High | Full (browser POST by protocol) | None | High | Web view only |
| F07 | Admin IAM (users, groups, roles, policies, audit) | Medium-High (dense tables) | None | Low | Medium | Web-first; phone usable but secondary |
| F08 / F09 | HR sync, SCIM, User Master | Medium | None | None | Medium | Web-first |
| F10 | Help Desk (list, create, comments, files) | High (about 4,800 lines) | None | High (camera, offline, notifications) | High | Best candidate for native |
| F11 | ITSM Setup (production-sensitive keys) | Medium | None | None | Medium | Web-first, extra confirmations |
| F12 | Refexions chat and voice | Medium | None | Medium (native voice) | Medium | Ready to migrate |
| F13 | Azure AD and Google admin | Medium | None | None | Medium | Web-first |
| F14 | Mobile apps, force update, download page | Low | None | High | Medium | Ready to migrate |
| F15 | Organisation settings | Low | None | None | Low | Ready to migrate |

### 5.3 Readiness of the current system

| Factor | Finding | Effect on migration |
|---|---|---|
| API design | Clean REST + Bearer token for every screen | Positive – frontend can be replaced without backend work |
| Business rules location | Most rules (access, SSO, ITSM, mail) live in the backend | Positive – less logic to re-write |
| Frontend-only rules | Launcher visibility helpers (RMC P2P, Procure-to-Pay, Reports chief-title), Kissflow fallback rules, Safari tab handling, Kissflow deep-link polling, voice helpers | Must be ported exactly; covered by risk R03 |
| Native shell code | Android MainActivity (about 1,100 lines Java) and iOS WebViewController (Swift) hold cookie, bridge and update logic | Must be re-implemented in Flutter plugins |
| Tests | Backend pytest suites per flow; frontend Playwright and launcher unit tests | Backend tests reused unchanged; frontend tests rewritten |
| Documentation | FLOW_RUNBOOK F01–F15 checklists and P0 smoke suite | Strong – used as acceptance criteria |
| Release process | Web: yarn build on server. Mobile: manual Xcode/Gradle builds, public App Store rules in runbook section 8 | Needs CI for three platforms |
| Team skills | JavaScript/React today | Dart/Flutter training or hiring needed |

### 5.4 Overall assessment

| Question | Answer |
|---|---|
| Technically feasible? | Yes |
| Backend change needed? | No |
| Can all functions be kept? | Yes, but SSO apps remain web views and SP-initiated SAML remains web-only |
| Main blockers | None hard; highest risks are login/SSO cutover and release cadence |
| Recommended option | B (mobile in Flutter, web stays React) unless one web codebase is mandatory (then C) |

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

## 7. Constraint analysis – "backend unchanged"

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

### 7.1 Non-code items still required

| Item | Needed when | Owner |
|---|---|---|
| /.well-known/apple-app-site-association and /.well-known/assetlinks.json as static files on refexone.com | Only if phone login uses the system browser + App Links | Web server / DevOps |
| Extra redirect URI in Azure App Registration / Google Cloud client | Only if a new redirect address is chosen | IT admin (console setting) |
| Existing Android signing key and Apple team certificates | Always | Mobile release owner |
| Store listing updates (screenshots, privacy labels, public-listing wording) | Always | Mobile release owner |

## 8. Functional requirements (mapped to FLOW_RUNBOOK)

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

## 9. Integration contracts that must not change

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

## 10. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Mobile: cold start to launcher within 2.5 s on a mid-range phone with a saved session; 60 fps transitions |
| NFR-2 | Web: login page loads within 3 s on 4G; admin modules loaded on demand so normal users do not download them; compare with today's React baseline before go-live |
| NFR-3 | Security: token in Keychain/Keystore; no Kissflow/BOT/policy keys in the client; TLS only; remove today's cleartext and mixed-content allowance |
| NFR-4 | Reliability: same API error messages; offline banner; retry on lists |
| NFR-5 | Accessibility: PR-10 |
| NFR-6 | Audit: backend audit events unchanged; frontend calls the same endpoints |
| NFR-7 | Observability: crash reporting on mobile (Crashlytics or Sentry) |

## 11. Disadvantages (detailed)

### 11.1 Business

| Disadvantage | Impact |
|---|---|
| Large investment with no new features | 14–25 weeks of work only to reach parity with what exists today |
| Slower fixes on phones | A text or field fix that is live in minutes today takes 1–3 days through the stores |
| Two products to run during the transition | React and Flutter both need bug fixes until cutover is complete |
| Store dependency | Releases depend on Apple and Google review; App Store has already pushed RefexOne towards unlisted distribution once (runbook section 8) |

### 11.2 Technical

| Disadvantage | Impact |
|---|---|
| No code reuse | About 18,000 lines of React screens and 46 UI components are rewritten in Dart |
| Web views remain | Kissflow, Adrenalin and NE Reports still open as web pages inside the app; the main launcher action does not become native |
| SP-initiated SAML is web-only | The web build must keep exactly the same /login contract and cookie |
| Flutter Web limitations | Larger first download than React, text selection and browser search need extra work, dense admin tables are harder |
| Native logic re-implemented | Kissflow cookie clearing, Adrenalin hand-off, update check and navigation rules move from Java/Swift into Flutter plugins |
| Third-party plugin dependency | Web view, speech, file picker and secure-storage plugins must keep up with OS updates |
| Tests rewritten | Playwright and frontend unit tests no longer apply |

### 11.3 Operational

| Disadvantage | Impact |
|---|---|
| Release management for three targets | Signing keys, version numbers, store listings, review notes and staged rollouts for every release |
| Many app versions in the field | Users on older builds keep old screens until they update; support must know which version a user has |
| CI/CD needed | Automated Android, iOS and Web builds instead of a single server build |

### 11.4 Users

| Disadvantage | Impact |
|---|---|
| Update prompts | Users must install updates to get fixes; forced updates interrupt work |
| Older Android phones | Android 5.1–6 devices may stop receiving updates |
| Visual and interaction changes | Even with the same design, some screens will feel different; short guidance needed |

## 12. Live UI updates and release management

### 12.1 Today

| Platform | How a UI change reaches users | Time |
|---|---|---|
| Web | git pull + yarn build on the server; service worker never caches the HTML | Minutes |
| Android | App opens refexone.com in a web view, so the same web deploy updates it; store build only for shell changes | Minutes |
| iOS | Same – WKWebView loads refexone.com live | Minutes |

### 12.2 After Flutter

| Platform | How a UI change reaches users | Typical time |
|---|---|---|
| Web | Build Flutter web and copy to the server; set no-cache on index.html and bootstrap files | Minutes |
| Android | New AAB (versionCode +1), Play Console upload, review, staged rollout, users update | Hours to 2–3 days |
| iOS | New IPA (build +1), App Store Connect upload, App Review, release, users update; follow runbook section 8 | 1–3 days, longer if rejected |

### 12.3 Ways to reduce the impact (no backend code change)

| Option | What it does | Notes |
|---|---|---|
| Existing force-update gate | Admin sets the minimum build in /settings/app-update; older builds are blocked with a store link | Already in the backend |
| Android in-app updates | Prompts and installs updates inside the app | Frontend plugin only |
| Code push (for example Shorebird) | Sends Dart code patches to installed apps without store review, within store rules | Paid service; native/plugin changes still need a store build |
| Remote config / feature flags | Switch features or texts without a build | Client-side service such as Firebase Remote Config |
| Keep fast-changing screens as web views | Admin consoles or reports stay web and update instantly | This is Option B |

### 12.4 Versioning rules

- Continue from 1.0.10 / build 10 (for example 2.0.0 / build 11) on the same package and bundle IDs so stores treat it as an update.
- Sign Android with the existing upload key (Play App Signing); otherwise current users cannot update.
- Keep both iOS records (com.refex.refexone live, com.refex.refex Superapp) and the public-listing rules.

## 13. Risk analysis

### 13.1 Method

Likelihood (L) and Impact (I) are scored 1 (very low) to 5 (very high). Score = L x I. Rating: High 15–25, Medium 8–14, Low 1–7.

### 13.2 Risk register

| ID | Category | Risk | L | I | Score | Rating | Mitigation | Contingency | Owner |
|---|---|---|---|---|---|---|---|---|---|
| R01 | Login / SSO | Login or SSO breaks at cutover (Microsoft, Google, SAML, OIDC) | 3 | 5 | 15 | High | Phase 0 proof gate; F01/F05/F06 checklists on all platforms; parallel run | Roll web back to React build; halt mobile rollout; 1.0.10 keeps working | Tech lead |
| R02 | Release | Loss of instant UI updates slows urgent fixes | 5 | 3 | 15 | High | Force-update gate, Android in-app updates, code push, hybrid web views | Hotfix through expedited App Review | Product owner |
| R03 | Scope | Hidden frontend rules missed in 18k lines (launcher visibility, Kissflow fallbacks, Safari handling, deep-link polling) | 4 | 4 | 16 | High | Code walkthrough per screen; requirement-to-checklist mapping; parity testing with same accounts | Fix in next release; keep React live until parity signed off | Business analyst |
| R04 | Login | Google blocks sign-in inside embedded web views | 3 | 4 | 12 | Medium | System browser + App Links for Google on mobile | Temporarily route Google login to web | Mobile lead |
| R05 | Login | Microsoft conditional-access policy blocks embedded sign-in | 2 | 4 | 8 | Medium | System browser option; test with each tenant | Same as R04 | Mobile lead |
| R06 | SSO | Kissflow session or cookie handling differs (wrong user, logout not clearing) | 3 | 4 | 12 | Medium | Web-view plugin with per-domain cookie control; multi-user device tests | Force clear all web-view cookies on logout | Mobile lead |
| R07 | SSO | SP-initiated SAML breaks if Flutter Web changes /login params or the iam_token cookie | 2 | 5 | 10 | Medium | Contract tests for the integration contracts (BRD section 8); same cookie flags | Restore React login page | Web lead |
| R08 | Store | App Store rejection (unlisted request, guideline 4.2, privacy labels) delays launch | 3 | 4 | 12 | Medium | Follow runbook section 8; early TestFlight review | Keep current 1.0.10 live | Release owner |
| R09 | Performance | Flutter Web slow on admin screens (first load, large tables) | 4 | 3 | 12 | Medium | Deferred loading, WebAssembly build, paged tables; measure against React baseline | Keep admin on React (Option B) | Web lead |
| R10 | Schedule | Effort overruns 23–25 week estimate | 4 | 3 | 12 | Medium | Phased delivery; user flows first; fixed parity scope | Release mobile user flows first, admin later | Project manager |
| R11 | People | Dart/Flutter skills gap | 3 | 3 | 9 | Medium | Training, senior Flutter developer, code reviews | External Flutter support | Engineering manager |
| R12 | Operations | Dual maintenance of React and Flutter during transition | 5 | 2 | 10 | Medium | Freeze new React features; short transition window | Prioritise fixes by platform | Project manager |
| R13 | Technical | Third-party plugins break on OS updates (web view, speech, file picker) | 3 | 3 | 9 | Medium | Use well-maintained plugins; test on OS betas | Pin versions; patch locally | Mobile lead |
| R14 | Security | Token or session regression (storage, mixed content) | 2 | 4 | 8 | Medium | Secure storage; remove cleartext; security review before release | Force logout via token expiry | Security owner |
| R15 | Release | Wrong signing key or bundle ID creates a second app instead of an update | 1 | 5 | 5 | Low | Release checklist; same IDs and Play App Signing | Re-sign and resubmit | Release owner |
| R16 | Compatibility | Android 5.1–6 devices unsupported | 2 | 2 | 4 | Low | Check device inventory | Keep 1.0.10 available for them | Product owner |
| R17 | Scope | A backend change becomes needed (for example push notifications) | 2 | 3 | 6 | Low | Keep push optional; Phase 0 proof | Separate approved backend change | Tech lead |
| R18 | Usability | Flutter Web text selection / browser search issues (copy ticket IDs, Ctrl+F) | 3 | 2 | 6 | Low | SelectionArea, copy buttons, semantics | Keep admin on React | Web lead |
| R19 | Integration | NE Reports tiles lose return_to / user_name params | 2 | 3 | 6 | Low | Contract tests for NE launch URL | Hotfix launch URL | Web lead |
| R20 | Adoption | Users need guidance for changed screens | 2 | 2 | 4 | Low | Same design language; short release notes | Help-desk FAQ | Product owner |

### 13.3 Risk summary

| Rating | Count | Risks |
|---|---|---|
| High | 3 | R01, R02, R03 |
| Medium | 11 | R04 to R14 |
| Low | 6 | R15 to R20 |

### 13.4 Risk heat map (count of risks)

| Likelihood \ Impact | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 5 | 0 | 1 | 1 | 0 | 0 |
| 4 | 0 | 0 | 2 | 1 | 0 |
| 3 | 0 | 1 | 2 | 3 | 1 |
| 2 | 0 | 2 | 2 | 2 | 1 |
| 1 | 0 | 0 | 0 | 0 | 1 |

## 14. Advantages

| Advantage | Benefit |
|---|---|
| One codebase | Dart code for Web, Android and iOS replaces React + Java shell + Swift shell |
| Native performance | Smoother scrolling, faster start, consistent look on every device |
| Native features | Biometric unlock, secure token storage, camera upload, offline handling |
| Store safety | Lower risk of App Store rejection than a website wrapper (guideline 4.2) |
| Cleaner native layer | Removes the separate cookie/bridge code in Java and Swift |
| Responsive by design | One widget tree adapts from 320 px phones to desktops |

## 15. Options

| Option | Description | Backend change | Instant UI updates | Effort | Risk |
|---|---|---|---|---|---|
| A | Keep React web and current shells; add native plugins (biometrics, secure storage, file picker) | None | Kept everywhere | Low (weeks) | Low |
| B | Flutter for Android/iOS user screens (login, launcher, ITSM, Refexions, profile); web views for SSO apps; refexone.com and admin stay React | None | Kept on web; lost for native mobile screens | Medium (about 14–16 weeks) | Medium |
| C | Full Flutter for Web + Android + iOS, all screens | None | Web only | High (about 23–25 weeks) | High |

## 16. Delivery plan (estimate: 2 Flutter developers, 1 QA, part-time designer)

| Phase | Content | Exit criteria | Estimate |
|---|---|---|---|
| 0. Proof gate | Password, Microsoft and Google login; one Kissflow SAML app with module deep link; Adrenalin; one NE Reports tile with return_to; force-update check – on Android, iOS and Web with zero backend change | All pass on real devices; go / no-go decision | 2 weeks |
| 1. Foundation | Design system, responsive scaffold, routing with clean URLs, API client, auth/session, secure storage, error handling, CI for three platforms | Signed internal builds | 3 weeks |
| 2. User core | F01 login, F02 profile, F03 launcher + SSO, F04 catalog, F14 download | F01–F04 checklists pass on three platforms | 4 weeks |
| 3. Help Desk + Refexions | F10 list/create/comments/attachments/rating/reopen, F12 chat + voice | F10 (Refex and Non-Refex) and F12 checklists pass | 5 weeks |
| 4. Admin consoles (Option C only) | F05–F09, F11, F13–F15 admin screens | Admin checklists pass on web; usable on tablet | 6–8 weeks |
| 5. Hardening and release | Performance, accessibility, security review, UAT, store submission, web cutover | P0 suite + full F01–F15 pass; stores approved | 3 weeks |
| Total | | Option C about 23–25 weeks; Option B about 14–16 weeks | |

## 17. Testing and acceptance

- Acceptance tests: FLOW_RUNBOOK section 3 checklists F01–F15 and P0-1 to P0-8, on each platform.
- Devices: low-end Android (API 24–26), mid-range Android, latest Android; iPhone SE, current iPhone, iPad; desktop Chrome, Edge, Safari, Firefox at 1280 and 1920 px; browser at 360 px width.
- Roles: normal user, admin, Refex user, Non-Refex user, chief-title user (Reports), user without Kissflow ID.
- Backend pytest suites must pass unchanged (proves no backend impact).
- Before/after comparison with the same accounts (runbook section 2).

## 18. Cutover and rollback

- Web: deploy Flutter web to a staging host; switch Nginx only after UAT; keep the React build for one-step rollback.
- Mobile: staged rollout (Android 10 % to 50 % to 100 %; iOS phased release); keep 1.0.10 working; raise the force-update minimum only after the new build is stable.
- Rollback: web – point Nginx back to the React build; mobile – halt rollout. Users on 1.0.10 keep working because the backend is unchanged.

## 19. Open decisions

1. Option B (mobile only) or Option C (full Flutter)?
2. Phone Microsoft/Google login: in-app web view (same as today) or system browser + App Links (more robust)?
3. Are SAMLConfig and OIDCConfig screens (not routed today) still needed?
4. Push notifications now? This needs a backend sender later and is outside "no backend change".
5. Accept dropping Android 5.1–6 devices?
6. Budget for a code-push service to soften the loss of instant updates?

Prepared from a read-only review. No code in RefexOne, Notification Engine or aasik_ITSM was changed.
