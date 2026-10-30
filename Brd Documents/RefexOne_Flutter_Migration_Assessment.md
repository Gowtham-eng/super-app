# RefexOne – Flutter Migration (Web, Android, iOS)
## Migration Assessment, Disadvantages and Risk Analysis

| Item | Value |
|---|---|
| Document | Migration Assessment and Risk Analysis |
| Version | 2.1 (draft for review) |
| Date | 30-Oct-2026 |
| System | RefexOne (refexone.com) – IAM launcher, SSO identity provider, Help Desk (ITSM), Refexions chat |
| Source reviewed | super-app repo, branch itsmbackuplatest, commit 2184f48; docs/FLOW_RUNBOOK.md flows F01–F15 |
| Change type | Frontend only. Backend (FastAPI + MongoDB) stays unchanged. |
| Companion document | RefexOne_Flutter_BRD.docx |
| Status | Analysis only. No code was changed in RefexOne, Notification Engine or aasik_ITSM. |

## 1. Executive summary

**Question.** Can RefexOne move its frontend to Flutter for Web, Android and iOS without changing the backend, and what does it cost, risk and change?

**Feasibility.** Yes, technically feasible with zero backend code change. Three non-code items are needed (static App-Link files on the web server if phone login uses the system browser, optional Azure/Google redirect entries, and the existing store signing keys).

**Size.** Full rewrite: 25 screens, about 18,000 lines of React UI and 46 shared UI components. Nothing is reused.

**What does not become native.** Kissflow, Adrenalin and NE Reports are web apps; they still open as web pages inside the Flutter app. SP-initiated SAML (Kissflow sending users to the RefexOne login page) works only in the web build.

**Live updates.** Today both phone apps open refexone.com, so a web deploy updates phones within minutes. After Flutter, every phone UI change needs a new build, store review and users updating (hours to 3 days). Web stays instant.

**Risks.** 20 risks: 3 High (login/SSO regression at cutover, loss of instant phone updates, hidden frontend rules missed in the rewrite), 11 Medium, 6 Low.

**Recommendation.** Run a 2-week proof gate first. Then choose Option B (Flutter phone apps, web stays React, about 14–16 weeks) unless one codebase for the web admin consoles is a firm requirement, in which case Option C (full Flutter, about 23–25 weeks).

The requirements themselves are in the companion BRD.

## 2. Current system and rebuild size

| Layer | Today |
|---|---|
| Web frontend | React 19, Create React App + craco, Tailwind, Radix/shadcn (46 shared UI components), react-router 7, axios. 25 page files (about 15,800 lines) plus 5 feature components (about 2,400 lines). Served by Nginx from frontend/build on the production server (/opt/superapp). |
| Backend | FastAPI (server.py about 4,400 lines + routes azure_ad, google_oauth, itsm, refexions, scim, user_master), uvicorn :8001 behind Nginx, MongoDB, APScheduler (Adrenalin HR sync), SMTP mail. |
| Android app | Capacitor 6 BridgeActivity, package com.refex.refexone, version 1.0.10 (build 10), minSdk 22, target 36. Loads https://refexone.com live. Native extras: per-domain Kissflow cookie clearing, RefexOneBridge (clear Kissflow session, open Adrenalin app, open external URL), Play Store intents, force-update check GET /api/app-update/check. |
| iOS app | Swift WKWebView app (RefexSuperApp), bundle com.refex.refexone (live) and com.refex.refex (Superapp listing), version 1.0.10 (10), iOS 15+. Loads https://refexone.com live, same update check and Kissflow session handling. |
| Web extras | sw.js service worker (network-first, HTML never cached), manifest.json (PWA install), privacy-policy.html, Google site-verification file, icons, setup-guide HTML pages. |
| Auth token | JWT in localStorage (iam_token) and cookie iam_token on refexone.com. Backend reads the Bearer header, a ?token= query, or the cookie (cookie resumes SP-initiated SAML). |

### 2.1 Screens to rebuild

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

## 3. Migration assessment

### 3.1 Assessment method

Each area was scored on four factors from the code and the flow runbook: Complexity (size and logic), Web dependency (how much of the flow must stay in a browser), Native gain (benefit of going native) and Test effort. The verdict says how the area should be migrated.

### 3.2 Assessment by functional area

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

### 3.3 Readiness of the current system

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

### 3.4 Overall assessment

| Question | Answer |
|---|---|
| Technically feasible? | Yes |
| Backend change needed? | No |
| Can all functions be kept? | Yes, but SSO apps remain web views and SP-initiated SAML remains web-only |
| Main blockers | None hard; highest risks are login/SSO cutover and release cadence |
| Recommended option | B (mobile in Flutter, web stays React) unless one web codebase is mandatory (then C) |

## 4. Backend-unchanged verification

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

### 4.1 Non-code items still required

| Item | Needed when | Owner |
|---|---|---|
| /.well-known/apple-app-site-association and /.well-known/assetlinks.json as static files on refexone.com | Only if phone login uses the system browser + App Links | Web server / DevOps |
| Extra redirect URI in Azure App Registration / Google Cloud client | Only if a new redirect address is chosen | IT admin (console setting) |
| Existing Android signing key and Apple team certificates | Always | Mobile release owner |
| Store listing updates (screenshots, privacy labels, public-listing wording) | Always | Mobile release owner |

## 5. Advantages

| Advantage | Benefit |
|---|---|
| One codebase | Dart code for Web, Android and iOS replaces React + Java shell + Swift shell |
| Native performance | Smoother scrolling, faster start, consistent look on every device |
| Native features | Biometric unlock, secure token storage, camera upload, offline handling |
| Store safety | Lower risk of App Store rejection than a website wrapper (guideline 4.2) |
| Cleaner native layer | Removes the separate cookie/bridge code in Java and Swift |
| Responsive by design | One widget tree adapts from 320 px phones to desktops |

## 6. Disadvantages (detailed)

### 6.1 Business

| Disadvantage | Impact |
|---|---|
| Large investment with no new features | 14–25 weeks of work only to reach parity with what exists today |
| Slower fixes on phones | A text or field fix that is live in minutes today takes 1–3 days through the stores |
| Two products to run during the transition | React and Flutter both need bug fixes until cutover is complete |
| Store dependency | Releases depend on Apple and Google review; App Store has already pushed RefexOne towards unlisted distribution once (runbook section 8) |

### 6.2 Technical

| Disadvantage | Impact |
|---|---|
| No code reuse | About 18,000 lines of React screens and 46 UI components are rewritten in Dart |
| Web views remain | Kissflow, Adrenalin and NE Reports still open as web pages inside the app; the main launcher action does not become native |
| SP-initiated SAML is web-only | The web build must keep exactly the same /login contract and cookie |
| Flutter Web limitations | Larger first download than React, text selection and browser search need extra work, dense admin tables are harder |
| Native logic re-implemented | Kissflow cookie clearing, Adrenalin hand-off, update check and navigation rules move from Java/Swift into Flutter plugins |
| Third-party plugin dependency | Web view, speech, file picker and secure-storage plugins must keep up with OS updates |
| Tests rewritten | Playwright and frontend unit tests no longer apply |

### 6.3 Operational

| Disadvantage | Impact |
|---|---|
| Release management for three targets | Signing keys, version numbers, store listings, review notes and staged rollouts for every release |
| Many app versions in the field | Users on older builds keep old screens until they update; support must know which version a user has |
| CI/CD needed | Automated Android, iOS and Web builds instead of a single server build |

### 6.4 Users

| Disadvantage | Impact |
|---|---|
| Update prompts | Users must install updates to get fixes; forced updates interrupt work |
| Older Android phones | Android 5.1–6 devices may stop receiving updates |
| Visual and interaction changes | Even with the same design, some screens will feel different; short guidance needed |

## 7. Live UI updates and release management

### 7.1 Today

| Platform | How a UI change reaches users | Time |
|---|---|---|
| Web | git pull + yarn build on the server; service worker never caches the HTML | Minutes |
| Android | App opens refexone.com in a web view, so the same web deploy updates it; store build only for shell changes | Minutes |
| iOS | Same – WKWebView loads refexone.com live | Minutes |

### 7.2 After Flutter

| Platform | How a UI change reaches users | Typical time |
|---|---|---|
| Web | Build Flutter web and copy to the server; set no-cache on index.html and bootstrap files | Minutes |
| Android | New AAB (versionCode +1), Play Console upload, review, staged rollout, users update | Hours to 2–3 days |
| iOS | New IPA (build +1), App Store Connect upload, App Review, release, users update; follow runbook section 8 | 1–3 days, longer if rejected |

### 7.3 Ways to reduce the impact (no backend code change)

| Option | What it does | Notes |
|---|---|---|
| Existing force-update gate | Admin sets the minimum build in /settings/app-update; older builds are blocked with a store link | Already in the backend |
| Android in-app updates | Prompts and installs updates inside the app | Frontend plugin only |
| Code push (for example Shorebird) | Sends Dart code patches to installed apps without store review, within store rules | Paid service; native/plugin changes still need a store build |
| Remote config / feature flags | Switch features or texts without a build | Client-side service such as Firebase Remote Config |
| Keep fast-changing screens as web views | Admin consoles or reports stay web and update instantly | This is Option B |

### 7.4 Versioning rules

- Continue from 1.0.10 / build 10 (for example 2.0.0 / build 11) on the same package and bundle IDs so stores treat it as an update.
- Sign Android with the existing upload key (Play App Signing); otherwise current users cannot update.
- Keep both iOS records (com.refex.refexone live, com.refex.refex Superapp) and the public-listing rules.

## 8. Risk analysis

### 8.1 Method

Likelihood (L) and Impact (I) are scored 1 (very low) to 5 (very high). Score = L x I. Rating: High 15–25, Medium 8–14, Low 1–7.

### 8.2 Risk register

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

### 8.3 Risk summary

| Rating | Count | Risks |
|---|---|---|
| High | 3 | R01, R02, R03 |
| Medium | 11 | R04 to R14 |
| Low | 6 | R15 to R20 |

### 8.4 Risk heat map (count of risks)

| Likelihood \ Impact | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| 5 | 0 | 1 | 1 | 0 | 0 |
| 4 | 0 | 0 | 2 | 1 | 0 |
| 3 | 0 | 1 | 2 | 3 | 1 |
| 2 | 0 | 2 | 2 | 2 | 1 |
| 1 | 0 | 0 | 0 | 0 | 1 |

## 9. Options

| Option | Description | Backend change | Instant UI updates | Effort | Risk |
|---|---|---|---|---|---|
| A | Keep React web and current shells; add native plugins (biometrics, secure storage, file picker) | None | Kept everywhere | Low (weeks) | Low |
| B | Flutter for Android/iOS user screens (login, launcher, ITSM, Refexions, profile); web views for SSO apps; refexone.com and admin stay React | None | Kept on web; lost for native mobile screens | Medium (about 14–16 weeks) | Medium |
| C | Full Flutter for Web + Android + iOS, all screens | None | Web only | High (about 23–25 weeks) | High |

## 10. Delivery plan (estimate: 2 Flutter developers, 1 QA, part-time designer)

| Phase | Content | Exit criteria | Estimate |
|---|---|---|---|
| 0. Proof gate | Password, Microsoft and Google login; one Kissflow SAML app with module deep link; Adrenalin; one NE Reports tile with return_to; force-update check – on Android, iOS and Web with zero backend change | All pass on real devices; go / no-go decision | 2 weeks |
| 1. Foundation | Design system, responsive scaffold, routing with clean URLs, API client, auth/session, secure storage, error handling, CI for three platforms | Signed internal builds | 3 weeks |
| 2. User core | F01 login, F02 profile, F03 launcher + SSO, F04 catalog, F14 download | F01–F04 checklists pass on three platforms | 4 weeks |
| 3. Help Desk + Refexions | F10 list/create/comments/attachments/rating/reopen, F12 chat + voice | F10 (Refex and Non-Refex) and F12 checklists pass | 5 weeks |
| 4. Admin consoles (Option C only) | F05–F09, F11, F13–F15 admin screens | Admin checklists pass on web; usable on tablet | 6–8 weeks |
| 5. Hardening and release | Performance, accessibility, security review, UAT, store submission, web cutover | P0 suite + full F01–F15 pass; stores approved | 3 weeks |
| Total | | Option C about 23–25 weeks; Option B about 14–16 weeks | |

## 11. Cutover and rollback

- Web: deploy Flutter web to a staging host; switch Nginx only after UAT; keep the React build for one-step rollback.
- Mobile: staged rollout (Android 10 % to 50 % to 100 %; iOS phased release); keep 1.0.10 working; raise the force-update minimum only after the new build is stable.
- Rollback: web – point Nginx back to the React build; mobile – halt rollout. Users on 1.0.10 keep working because the backend is unchanged.

## 12. Decisions needed

1. Option B (Flutter phone apps, web stays React) or Option C (full Flutter)?
2. Phone Microsoft/Google login: in-app web view (same as today) or system browser + App Links (more robust, needs two static files on refexone.com)?
3. Budget for a code-push service to soften the loss of instant phone updates?
4. Accept dropping Android 5.1–6 devices?

Prepared from a read-only review. No code in RefexOne, Notification Engine or aasik_ITSM was changed.
