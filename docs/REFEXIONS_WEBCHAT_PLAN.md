# Refexions Web Chat — Implementation Plan

v1 is implemented in the launcher chat (`frontend/src/components/RefexionsChat.js` + `backend/routes/refexions.py`).

**Done:** Main menu from Kissflow `Whatsapp_BOT_Config`, IT HelpDesk (reason → ML keyword-match → existing ITSM webhook), Policies list + send, Expense/Travel submenu with coming-soon (OCR later).

**Policy send:** `POST https://policy-sender-645830234926.asia-south1.run.app/v1/documents/send`  
Headers `Content-Type: application/json`, `X-API-Key`. Success body `{ status: "sent", document_id, to, message_id }`.

API key stays in backend env (not git). Optional overrides: `REFEXIONS_POLICY_SERVICE_URL`, `REFEXIONS_POLICY_API_KEY`, `REFEXIONS_POLICY_TEMPLATE_ID`, `REFEXIONS_ML_URL`.

---

## Goals (user side)

1. Open Refexions → see the same four choices as WhatsApp: **Expense, Travel, IT HelpDesk, Policies**.
2. Each path feels like a guided chat (buttons + short prompts), not a free-form LLM box.
3. IT HelpDesk: describe the problem → auto-map subtype → create Kissflow ticket → clear success message.
4. Policies: pick a policy → email PDF/doc → clear success or failure copy.
5. Expense / Travel: later — capture receipt image + OCR → create expense task (out of scope for v1 code).

---

## Architecture

```
Refexions UI (AppLauncher)
        │
        ▼
Backend proxy  /api/refexions/*   (auth + secrets stay server-side)
        │
        ├── Kissflow Dataset  Whatsapp_BOT_Config   (menus)
        ├── ML keyword-match API                  (IT subtype)
        ├── Existing ITSM webhook create          (entity Refex vs non-Refex)
        └── Policy send API                       (documents/send)
```

**Rule:** Browser never sees Kissflow access keys or policy API keys. Reuse ITSM Setup credentials (`X-Access-Key-Id` / `X-Access-Key-Secret`) already stored for create/update tickets.

**Env rule (same as ITSM create/update):** Kissflow host comes from ITSM active environment:

| Mode | Base URL | Account (typical) |
|------|----------|-------------------|
| Development | `https://development-refexgroup.kissflow.com` | `AcCMptp3yqcn` |
| Live | `https://refexgroup.kissflow.com` | `AcCMptlq60zH` |

Menus you listed use **live** account `AcCMptlq60zH`. Confirm whether the same dataset exists on **development** before testing; if not, either seed it or temporarily point only the bot-config GETs at live while ticket create stays on Dev.

---

## Conversation state machine

Keep a small client (or server) state object:

```text
step: main | sub_expense | sub_travel | it_reason | it_confirm | policies | policy_done | expense_upload | …
mainMenu: string[]
subMenu: string[]
intent: string
selectedMain: Expense | Travel | IT HelpDesk | Policies
selectedPolicy?: { title, description, document_id }
itDescription?: string
itSubType?: string
```

Render **quick-reply chips** from API lists (split `Main_Menu` / `Sub_Menu` on commas). Prefer chips over free typing except where free text is required (IT reason, expense notes).

---

## API catalog

### 1) Main menu

- **Method:** `GET`
- **Path:** `/dataset/2/{account_id}/Whatsapp_BOT_Config?Name=01-MainMenu`
- **Headers:** `X-Access-Key-Id`, `X-Access-Key-Secret`, `Accept: application/json`
- **Use:** `Message` as bot text; split `Main_Menu` → chips  
  `Expense | Travel | IT HelpDesk | Policies`

### 2) Sub menu (after Expense — same pattern for Travel / others)

- **Method:** `GET`
- **Path:** `/dataset/2/{account_id}/Whatsapp_BOT_Config?Name=02-SubMenu`  
  (confirm filter: by `Name` only vs `Name` + `Main_Menu=Expense`)
- **Use:** `Message` + split `Sub_Menu`; store `Intent` (e.g. `Create`)

> **Gap to confirm:** How Travel / Policies / IT HelpDesk submenu rows are keyed (`03-…`, filter by `Main_Menu`, etc.). Document each Name once Bobby/asik share them.

### 3) IT HelpDesk → ML keyword match

- **Method:** `POST`
- **URL:** `https://keyword-matching-api-645830234926.asia-south1.run.app/api/v1/keyword-match`
- **Body:** `{ "mail_body": "<user reason text>" }`
- **Response:** `{ sub_type, matched_keyword, score, status }`
- **UX:** Ask for reason → show “Detected: {sub_type}” with Confirm / Edit → then create ticket.

### 4) IT ticket create (existing)

- Reuse **current** ITSM webhook submit (`POST /api/itsm/tickets`).
- Map:
  - `sub_type` ← ML `sub_type`
  - `description` ← user reason
  - `entity` / name / email / location ← logged-in profile (same as Create IT Request)
- Success copy example:  
  `Ticket created successfully. You may get a notification by email.`

### 5) Policies list (static until dataset provided)

| Row title (≤24) | Description | document_id |
|-----------------|-------------|-------------|
| Data Privacy | Data Privacy & Protection Policy | `data_privacy_policy` |
| Domestic Travel | Domestic Travel Policy | `domestic_travel_policy` |
| IT Asset Management | IT asset allocation and return | `it_asset_policy` |
| IT Data Security | Data handling and security rules | `it_data_security_policy` |
| IT Policy | General IT usage policy | `it_policy` |
| POSH | Prevention of Sexual Harassment | `posh_policy` |
| Recruitment | Hiring and recruitment process | `recruitment_policy` |
| Salary Advance | Applying for a salary advance | `salary_advance_policy` |

Show as selectable rows (title + one-line description).

### 6) Policy send

```bash
curl -X POST "$SERVICE_URL/v1/documents/send" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "template_id": "policy_share_v1",
    "document_id": "it_policy",
    "user_email": "<login email>"
  }'
```

- **Success (HTTP 200):**  
  `✅ *IT Policy* sent successfully`  
  `📧 Delivered to: user@…`  
  `Please check your inbox…`
- **Failure:**  
  `⚠️ Couldn't send *IT Policy* right now. Please try again… contact Admin.`

Store `$SERVICE_URL` + `$API_KEY` in backend env / admin config (not frontend).

---

## Suggested UX (best experience)

### Always

- Open chat → load Main Menu once → show chips (not a blank text box only).
- “Back” chip on every nested step.
- Typing still allowed as escape hatch: fuzzy-match chip labels before falling back to free text.
- Keep transcript scrollable; sticky chips under last bot message.

### IT HelpDesk (highest value first)

1. Chip **IT HelpDesk**
2. Bot: “Describe the issue in one or two sentences.”
3. User text → ML → show matched subtype + confidence
4. Confirm → webhook create → success message + optional “View my tickets” link to `/itsm`

### Policies

1. Chip **Policies** → list 8 policies  
2. Tap one → confirm email → send → success/fail template above  

### Expense / Travel (phase 2)

WhatsApp today expects **document/image upload + OCR → expense task**. In Refexions:

**Recommended path (GCP):**

1. User picks submenu (Food, Accommodation, …)
2. Upload image / PDF (chat attachment)
3. Call **Document AI** (or Vision OCR) on GCP project already available
4. Extract: merchant, date, amount, tax → show editable confirmation card
5. Create expense task via existing expense API / Kissflow process (TBD)

**Alternative without full AI:** guided form (amount, date, category) + optional attachment; OCR as enhancement.

**Admin “node format” idea (flexible):**  
Store chat flows as a small CMS (Mongo or Kissflow dataset):

```json
{
  "id": "expense.food",
  "type": "upload_then_ocr",
  "prompt": "Upload your food bill",
  "next": "expense.confirm",
  "actions": [{ "type": "ocr" }, { "type": "create_expense" }]
}
```

Admins edit nodes instead of shipping code for every new submenu. Good long-term; start with hardcoded IT + Policies, then migrate menus to nodes.

---

## What to add in Refexions that users will actually use

| Feature | Why |
|---------|-----|
| Main menu from Kissflow | Stays in sync with WhatsApp bot |
| IT HelpDesk create | Same outcome as Create Ticket, fewer taps |
| “My open tickets” shortcut | Jump to IT Help Desk dashboard |
| Policies email | High-frequency HR/IT ask |
| Status of last ticket | One-tap after create |
| Clear entity badge | User knows Refex vs Extrovis routing |

Avoid: open-ended “AI that does everything” until menus + IT + Policies are solid.

---

## Backend endpoints to add later (sketch)

| Endpoint | Proxies |
|----------|---------|
| `GET /api/refexions/main-menu` | Kissflow `01-MainMenu` |
| `GET /api/refexions/sub-menu?main=Expense` | Kissflow submenu row |
| `POST /api/refexions/it/match` | ML keyword API |
| `POST /api/refexions/it/create` | Existing ITSM ticket submit |
| `GET /api/refexions/policies` | Static list or dataset |
| `POST /api/refexions/policies/send` | documents/send |

---

## Implementation order (when approved)

1. Proxy Main Menu + render chips in AppLauncher Refexions panel  
2. Policies list + send + success/fail copy  
3. IT HelpDesk: reason → ML → create ticket  
4. Wire Dev Kissflow for create; verify; switch ITSM env to Live  
5. Expense/Travel: upload UI + Document AI OCR + expense create  
6. Optional: admin node editor for new bot paths  

---

## Open questions (blockers)

1. Exact dataset `Name` / filters for Travel, IT HelpDesk, Policies submenus.  
2. Does `Whatsapp_BOT_Config` exist on **development** account?  
3. Policy `$SERVICE_URL` and `$API_KEY` values.  
4. Expense create API after OCR (Kissflow process? Adrenalin? other?).  
5. Should Refexions IT create always use Quick Search ML path only (no cascade)?

---

## Note on ITSM comment / update (related)

Employee **Comment** on open tickets:

1. Resolve the ticket’s current **InProgress** work step from Kissflow `/progress` (prefer IT Agent Solution / Tech Support). Do **not** use a completed PickUp / reopen activity id from the report.
2. **Save** (not `/submit`) on:
   `POST {kissflow}/process/2/{account}/{processId}/{instanceId}/{activityId}?_application_id=…`
3. Payload appends a child-table row (not the scalar solution field):
   `{ "_id": instanceId, "Table::IT__Agent_Solution": [{ "_id": "IT__Agent_Solution_<id>", "Name_1": "<employee>", "Resolution": "<comment>", "Stages_1": "InProgress" }] }`  
   Do **not** send scalar `It_Agent_Solution`, and do **not** call `/submit` (that advances the workflow).

Host follows ITSM Setup **development → live** switch — not the RefexOne login host.
