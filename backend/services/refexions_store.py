"""
Refexions Setup — FAQ dataset + policy/keyword API keys.

Lives in Mongo (`refexions_setup`), not Kissflow. Falls back to a runtime file
when Mongo is down so production does not need a local .env copy.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("refexions")

COLLECTION = "refexions_setup"
SCOPE = "global"
_RUNTIME: Optional[Dict[str, Any]] = None
_RUNTIME_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".refexions-setup-runtime.json",
)
_DB_DOWN_UNTIL = 0.0
_DB_CIRCUIT_SEC = float(os.environ.get("MONGO_CIRCUIT_BREAKER_SEC", "90") or "90")

DEFAULT_ML_URL = (
    "https://keyword-matching-api-645830234926.asia-south1.run.app/api/v1/keyword-match"
)
DEFAULT_POLICY_SERVICE_URL = (
    "https://policy-sender-645830234926.asia-south1.run.app"
)
DEFAULT_POLICY_TEMPLATE_ID = "policy_share_v1"
DEFAULT_MAIN_OPTIONS = ["Expense", "Travel", "IT HelpDesk", "Policies"]
DEFAULT_EXPENSE_OPTIONS = ["Food", "Accommodation", "Local Conveyance", "Travel Ticket"]
DEFAULT_TRAVEL_OPTIONS = ["Domestic", "International"]
DEFAULT_MAIN_MESSAGE = "Please choose from the following"
DEFAULT_SUB_MESSAGE = "Please select the application"
DEFAULT_COMING_SOON = (
    "Receipt upload and OCR for Expense / Travel will land in the next release. "
    "Use the Expense or Travel app for now."
)
DEFAULT_POLICY_MESSAGE = "Select a policy to email it to yourself."
DEFAULT_POLICIES: List[Dict[str, Any]] = [
    {
        "title": "Data Privacy",
        "description": "Data Privacy & Protection Policy",
        "document_id": "data_privacy_policy",
        "enabled": True,
        "sort_order": 10,
    },
    {
        "title": "Domestic Travel",
        "description": "Domestic Travel Policy",
        "document_id": "domestic_travel_policy",
        "enabled": True,
        "sort_order": 20,
    },
    {
        "title": "IT Asset Management",
        "description": "IT asset allocation and return",
        "document_id": "it_asset_policy",
        "enabled": True,
        "sort_order": 30,
    },
    {
        "title": "IT Data Security",
        "description": "Data handling and security rules",
        "document_id": "it_data_security_policy",
        "enabled": True,
        "sort_order": 40,
    },
    {
        "title": "IT Policy",
        "description": "General IT usage policy",
        "document_id": "it_policy",
        "enabled": True,
        "sort_order": 50,
    },
    {
        "title": "POSH",
        "description": "Prevention of Sexual Harassment",
        "document_id": "posh_policy",
        "enabled": True,
        "sort_order": 60,
    },
    {
        "title": "Recruitment",
        "description": "Hiring and recruitment process",
        "document_id": "recruitment_policy",
        "enabled": True,
        "sort_order": 70,
    },
    {
        "title": "Salary Advance",
        "description": "Applying for a salary advance",
        "document_id": "salary_advance_policy",
        "enabled": True,
        "sort_order": 80,
    },
]

_STOPWORDS = {
    "a", "an", "the", "is", "are", "am", "to", "of", "for", "and", "or", "in",
    "on", "at", "my", "me", "i", "we", "you", "it", "this", "that", "how", "do",
    "can", "please", "what", "where", "when", "who",
}

DEFAULT_FAQS: List[Dict[str, Any]] = [
    {
        "id": "faq-it-ticket",
        "question": "How do I raise an IT ticket?",
        "keywords": [
            "ticket",
            "helpdesk",
            "help desk",
            "it support",
            "raise ticket",
            "create ticket",
            "laptop",
            "vpn",
            "password",
            "wifi",
            "wi-fi",
            "printer",
            "outlook",
            "email not working",
        ],
        "answer": (
            "Use **IT HelpDesk** in this chat. I will classify the issue and create "
            "a Kissflow ticket for you. Tap **My tickets** anytime to track it."
        ),
        "link": "",
        "enabled": True,
        "sort_order": 10,
    },
    {
        "id": "faq-policy",
        "question": "How do I get a company policy emailed to me?",
        "keywords": [
            "policy",
            "policies",
            "posh",
            "travel policy",
            "data privacy",
            "it policy",
            "salary advance",
            "send policy",
        ],
        "answer": (
            "Open **Policies** in this chat, pick the document, and I will email it "
            "to your login address. Nothing is stored in Kissflow."
        ),
        "link": "",
        "enabled": True,
        "sort_order": 20,
    },
    {
        "id": "faq-expense-travel",
        "question": "Can I submit an expense or travel claim here?",
        "keywords": [
            "expense",
            "travel claim",
            "receipt",
            "reimbursement",
            "food bill",
            "conveyance",
        ],
        "answer": (
            "Expense and Travel claim upload is coming in a later release. Use the "
            "Expense or Travel app from the launcher for now."
        ),
        "link": "",
        "enabled": True,
        "sort_order": 30,
    },
    {
        "id": "faq-what-is-refexions",
        "question": "What can Refexions help me with?",
        "keywords": [
            "refexions",
            "what can you do",
            "help",
            "assistant",
            "chatbot",
            "personal assistant",
        ],
        "answer": (
            "I am Refexions, your workplace assistant. I can raise an IT ticket, "
            "email a company policy, and answer FAQ questions saved by Admin. "
            "I do not invent answers — if I do not know, I send you back to the menu."
        ),
        "link": "",
        "enabled": True,
        "sort_order": 5,
    },
    {
        "id": "faq-hr-leave",
        "question": "Can you help with leave or attendance?",
        "keywords": ["leave", "attendance", "hr", "payroll", "holiday"],
        "answer": (
            "Leave and attendance are not handled in this chat. Use the HR / "
            "Adrenalin app from the launcher, or contact HR."
        ),
        "link": "",
        "enabled": True,
        "sort_order": 40,
    },
]


def _db_usable(db) -> bool:
    if db is None:
        return False
    return time.monotonic() >= _DB_DOWN_UNTIL


def _trip_db(exc: Exception) -> None:
    global _DB_DOWN_UNTIL
    _DB_DOWN_UNTIL = time.monotonic() + _DB_CIRCUIT_SEC
    logger.warning("Refexions Setup Mongo circuit open for %.0fs after: %s", _DB_CIRCUIT_SEC, exc)


def _read_runtime_file() -> Optional[Dict[str, Any]]:
    try:
        if not os.path.isfile(_RUNTIME_FILE):
            return None
        with open(_RUNTIME_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else None
    except Exception as exc:
        logger.warning("Refexions Setup runtime file read failed: %s", exc)
        return None


def _write_runtime_file(doc: Dict[str, Any]) -> None:
    try:
        with open(_RUNTIME_FILE, "w", encoding="utf-8") as handle:
            json.dump(doc, handle, indent=2, default=str)
    except Exception as exc:
        logger.warning("Refexions Setup runtime file write failed: %s", exc)


def _cache(doc: Dict[str, Any]) -> None:
    global _RUNTIME
    _RUNTIME = dict(doc)
    _write_runtime_file(doc)


def _split_options(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value or "").replace("|", ",")
    return [part.strip() for part in text.split(",") if part.strip()]


def _normalize_menu_entry(
    raw: Any,
    fallback_options: List[str],
    fallback_message: str,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    options = _split_options(src.get("options")) or list(fallback_options)
    out: Dict[str, Any] = {
        "message": str(src.get("message") or fallback_message).strip() or fallback_message,
        "options": options,
        "source": str(src.get("source") or "setup").strip() or "setup",
        "refreshed_at": src.get("refreshed_at"),
    }
    if extra:
        for key, value in extra.items():
            if key in src and src.get(key) not in (None, ""):
                out[key] = src.get(key)
            else:
                out[key] = value
    return out


def default_menus() -> Dict[str, Any]:
    return {
        "main": _normalize_menu_entry({}, DEFAULT_MAIN_OPTIONS, DEFAULT_MAIN_MESSAGE),
        "expense": _normalize_menu_entry(
            {},
            DEFAULT_EXPENSE_OPTIONS,
            DEFAULT_SUB_MESSAGE,
            extra={"comingSoon": True, "comingSoonMessage": DEFAULT_COMING_SOON},
        ),
        "travel": _normalize_menu_entry(
            {},
            DEFAULT_TRAVEL_OPTIONS,
            DEFAULT_SUB_MESSAGE,
            extra={"comingSoon": True, "comingSoonMessage": DEFAULT_COMING_SOON},
        ),
        "policies": _normalize_menu_entry(
            {},
            [row["title"] for row in DEFAULT_POLICIES],
            DEFAULT_POLICY_MESSAGE,
        ),
    }


def _normalize_menus(raw: Any) -> Dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    base = default_menus()
    return {
        "main": _normalize_menu_entry(src.get("main"), DEFAULT_MAIN_OPTIONS, DEFAULT_MAIN_MESSAGE),
        "expense": _normalize_menu_entry(
            src.get("expense") or base["expense"],
            DEFAULT_EXPENSE_OPTIONS,
            DEFAULT_SUB_MESSAGE,
            extra={"comingSoon": True, "comingSoonMessage": DEFAULT_COMING_SOON},
        ),
        "travel": _normalize_menu_entry(
            src.get("travel") or base["travel"],
            DEFAULT_TRAVEL_OPTIONS,
            DEFAULT_SUB_MESSAGE,
            extra={"comingSoon": True, "comingSoonMessage": DEFAULT_COMING_SOON},
        ),
        "policies": _normalize_menu_entry(
            src.get("policies") or base["policies"],
            [row["title"] for row in DEFAULT_POLICIES],
            DEFAULT_POLICY_MESSAGE,
        ),
    }


def chat_main_menu(doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    main = normalize_doc(doc)["menus"]["main"]
    return {
        "success": True,
        "source": main.get("source") or "setup",
        "message": main.get("message") or DEFAULT_MAIN_MESSAGE,
        "options": list(main.get("options") or DEFAULT_MAIN_OPTIONS),
        "environment": "setup",
        "refreshed_at": main.get("refreshed_at"),
    }


def chat_sub_menu(doc: Optional[Dict[str, Any]], main: str) -> Dict[str, Any]:
    selected = str(main or "").strip()
    key = selected.lower().replace(" ", "")
    menus = normalize_doc(doc)["menus"]
    kind = (
        "expense" if "expense" in key
        else "travel" if "travel" in key
        else "policies" if "polic" in key
        else ""
    )
    row = menus.get(kind) if kind else {}
    if not isinstance(row, dict):
        row = {}
    if kind == "policies":
        titles = [
            str(item.get("title") or "").strip()
            for item in enabled_policies(doc)
            if str(item.get("title") or "").strip()
        ]
        options = titles or list(row.get("options") or [])
        return {
            "success": True,
            "source": row.get("source") or "setup",
            "main": selected,
            "message": row.get("message") or DEFAULT_POLICY_MESSAGE,
            "options": options,
            "intent": "Policy",
            "comingSoon": False,
            "comingSoonMessage": "",
            "refreshed_at": row.get("refreshed_at"),
            "policies": enabled_policies(doc),
        }
    return {
        "success": True,
        "source": row.get("source") or "setup",
        "main": selected,
        "message": row.get("message") or DEFAULT_SUB_MESSAGE,
        "options": list(row.get("options") or []),
        "intent": "Create",
        "comingSoon": bool(row.get("comingSoon")) if kind else False,
        "comingSoonMessage": str(row.get("comingSoonMessage") or DEFAULT_COMING_SOON) if kind else "",
        "refreshed_at": row.get("refreshed_at"),
    }


def _keywords_list(raw: Any) -> List[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    text = str(raw or "").strip()
    if not text:
        return []
    return [part.strip() for part in re.split(r"[,;\n]+", text) if part.strip()]


def _normalize_faq(raw: Any, index: int = 0) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    question = str(raw.get("question") or "").strip()
    answer = str(raw.get("answer") or "").strip()
    if not question or not answer:
        return None
    faq_id = str(raw.get("id") or "").strip() or f"faq-{uuid.uuid4().hex[:10]}"
    enabled = raw.get("enabled")
    if enabled is None:
        enabled = True
    try:
        sort_order = int(raw.get("sort_order") if raw.get("sort_order") is not None else (index + 1) * 10)
    except (TypeError, ValueError):
        sort_order = (index + 1) * 10
    return {
        "id": faq_id,
        "question": question,
        "keywords": _keywords_list(raw.get("keywords")),
        "answer": answer,
        "link": str(raw.get("link") or "").strip(),
        "enabled": bool(enabled),
        "sort_order": sort_order,
    }


def _normalize_policy(raw: Any, index: int = 0) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title") or "").strip()
    document_id = str(raw.get("document_id") or raw.get("id") or "").strip()
    if not title or not document_id:
        return None
    enabled = raw.get("enabled")
    if enabled is None:
        enabled = True
    try:
        sort_order = int(raw.get("sort_order") if raw.get("sort_order") is not None else (index + 1) * 10)
    except (TypeError, ValueError):
        sort_order = (index + 1) * 10
    return {
        "title": title,
        "description": str(raw.get("description") or "").strip(),
        "document_id": document_id,
        "enabled": bool(enabled),
        "sort_order": sort_order,
    }


def _normalize_policies(raw: Any) -> List[Dict[str, Any]]:
    rows = raw if isinstance(raw, list) else []
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(rows):
        policy = _normalize_policy(item, index)
        if not policy:
            continue
        key = policy["document_id"].lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(policy)
    out.sort(key=lambda row: (row.get("sort_order") or 0, row.get("title") or ""))
    return out


def default_policies() -> List[Dict[str, Any]]:
    return [dict(row) for row in DEFAULT_POLICIES]


def enabled_policies(doc: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    data = normalize_doc(doc)
    rows = [row for row in data.get("policies") or [] if row.get("enabled") is not False]
    return rows or default_policies()


def chat_policies(doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    rows = enabled_policies(doc)
    menus = normalize_doc(doc).get("menus") or {}
    policy_menu = menus.get("policies") if isinstance(menus.get("policies"), dict) else {}
    return {
        "success": True,
        "source": policy_menu.get("source") or "setup",
        "message": policy_menu.get("message") or DEFAULT_POLICY_MESSAGE,
        "policies": rows,
        "options": [row["title"] for row in rows],
    }


def policy_by_id(document_id: str, doc: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    wanted = str(document_id or "").strip().lower()
    if not wanted:
        return None
    for row in enabled_policies(doc):
        if str(row.get("document_id") or "").strip().lower() == wanted:
            return row
    return None


def _sync_policies_menu(menus: Dict[str, Any], policies: List[Dict[str, Any]]) -> Dict[str, Any]:
    titles = [str(row.get("title") or "").strip() for row in policies if row.get("enabled") is not False]
    titles = [title for title in titles if title]
    prev = menus.get("policies") if isinstance(menus.get("policies"), dict) else {}
    out = dict(menus or {})
    out["policies"] = _normalize_menu_entry(
        {**prev, "options": titles or prev.get("options") or []},
        [row["title"] for row in DEFAULT_POLICIES],
        DEFAULT_POLICY_MESSAGE,
    )
    return out


def _normalize_faqs(raw: Any) -> List[Dict[str, Any]]:
    rows = raw if isinstance(raw, list) else []
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(rows):
        faq = _normalize_faq(item, index)
        if not faq:
            continue
        if faq["id"] in seen:
            faq["id"] = f"faq-{uuid.uuid4().hex[:10]}"
        seen.add(faq["id"])
        out.append(faq)
    out.sort(key=lambda row: (row.get("sort_order") or 0, row.get("question") or ""))
    return out


def default_doc() -> Dict[str, Any]:
    return {
        "scope": SCOPE,
        "policy_api_key": "",
        "ml_url": DEFAULT_ML_URL,
        "policy_service_url": DEFAULT_POLICY_SERVICE_URL,
        "policy_template_id": DEFAULT_POLICY_TEMPLATE_ID,
        "faqs": [dict(row) for row in DEFAULT_FAQS],
        "policies": default_policies(),
        "menus": default_menus(),
        "updated_at": None,
    }


def normalize_doc(raw: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    base = default_doc()
    src = raw if isinstance(raw, dict) else {}
    faqs = _normalize_faqs(src.get("faqs"))
    if not faqs:
        faqs = [dict(row) for row in DEFAULT_FAQS]
    policies = _normalize_policies(src.get("policies"))
    if not policies:
        policies = default_policies()
    menus = _sync_policies_menu(_normalize_menus(src.get("menus")), policies)
    return {
        "scope": SCOPE,
        "policy_api_key": str(src.get("policy_api_key") or "").strip(),
        "ml_url": str(src.get("ml_url") or DEFAULT_ML_URL).strip() or DEFAULT_ML_URL,
        "policy_service_url": (
            str(src.get("policy_service_url") or DEFAULT_POLICY_SERVICE_URL).strip().rstrip("/")
            or DEFAULT_POLICY_SERVICE_URL
        ),
        "policy_template_id": (
            str(src.get("policy_template_id") or DEFAULT_POLICY_TEMPLATE_ID).strip()
            or DEFAULT_POLICY_TEMPLATE_ID
        ),
        "faqs": faqs,
        "policies": policies,
        "menus": menus,
        "updated_at": src.get("updated_at"),
    }


def public_doc(doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data = normalize_doc(doc)
    key = str(data.get("policy_api_key") or "").strip()
    return {
        "scope": SCOPE,
        "policy_api_key": key,
        "has_policy_api_key": bool(key),
        "ml_url": data["ml_url"],
        "policy_service_url": data["policy_service_url"],
        "policy_template_id": data["policy_template_id"],
        "faqs": data["faqs"],
        "policies": data["policies"],
        "menus": data["menus"],
        "updated_at": data.get("updated_at"),
    }


def enabled_faqs(doc: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    data = normalize_doc(doc)
    return [row for row in data["faqs"] if row.get("enabled")]


def _tokens(text: str) -> List[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [word for word in words if word not in _STOPWORDS and len(word) > 1]


def match_faq(text: str, faqs: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    """Keyword FAQ match. No LLM. Returns the best enabled row or None."""
    query = str(text or "").strip().lower()
    if not query:
        return None
    rows = faqs if isinstance(faqs, list) else enabled_faqs(_RUNTIME)
    query_tokens = set(_tokens(query))
    best: Optional[Dict[str, Any]] = None
    best_score = 0.0
    for row in rows:
        if not isinstance(row, dict) or not row.get("enabled", True):
            continue
        question = str(row.get("question") or "").strip().lower()
        answer = str(row.get("answer") or "").strip()
        if not question or not answer:
            continue
        score = 0.0
        if query == question:
            score = 100.0
        elif question in query or query in question:
            score = 40.0
        for keyword in _keywords_list(row.get("keywords")):
            token = keyword.lower()
            if not token:
                continue
            if token in query:
                score += 8.0 + min(len(token), 24) / 8.0
                continue
            parts = _tokens(token)
            if parts and all(part in query_tokens for part in parts):
                score += 5.0
        overlap = query_tokens.intersection(_tokens(question))
        if overlap:
            score += min(len(overlap), 6) * 1.5
        if score > best_score:
            best_score = score
            best = row
    if not best or best_score < 8.0:
        return None
    return {
        "id": best.get("id"),
        "question": best.get("question"),
        "answer": best.get("answer"),
        "link": best.get("link") or "",
        "score": round(best_score, 2),
    }


def cached_setting(field: str) -> str:
    doc = _RUNTIME if isinstance(_RUNTIME, dict) else _read_runtime_file()
    if not isinstance(doc, dict):
        return ""
    return str(doc.get(field) or "").strip()


def apply_legacy(doc: Dict[str, Any], legacy: Optional[Dict[str, Any]] = None) -> Tuple[Dict[str, Any], bool]:
    """Fill empty Setup fields from old ITSM shared keys on first load."""
    raw = dict(doc or {})
    src = legacy if isinstance(legacy, dict) else {}
    changed = False
    mapping = {
        "policy_api_key": "policy_api_key",
        "ml_url": "ml_url",
        "policy_service_url": "policy_service_url",
        "policy_template_id": "policy_template_id",
    }
    for dest, source in mapping.items():
        if str(raw.get(dest) or "").strip():
            continue
        value = str(src.get(source) or "").strip()
        if value:
            raw[dest] = value.rstrip("/") if dest.endswith("url") else value
            changed = True
    faqs = raw.get("faqs")
    if not (isinstance(faqs, list) and faqs):
        raw["faqs"] = [dict(row) for row in DEFAULT_FAQS]
        changed = True
    menus = raw.get("menus")
    main_options = ((menus or {}).get("main") or {}).get("options") if isinstance(menus, dict) else None
    if not (isinstance(main_options, list) and [item for item in main_options if str(item).strip()]):
        raw["menus"] = default_menus()
        changed = True
    stored_policies = raw.get("policies")
    if not (isinstance(stored_policies, list) and stored_policies):
        raw["policies"] = default_policies()
        changed = True
    return normalize_doc(raw), changed


def _mongo_payload(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in doc.items() if key != "persisted"}


async def _read_mongo(db) -> Tuple[Optional[Dict[str, Any]], bool]:
    """Return (document, mongo_reachable). Empty collection still counts as reachable."""
    if db is None or not _db_usable(db):
        return None, False
    try:
        stored = await db[COLLECTION].find_one({"scope": SCOPE}, {"_id": 0})
        return (stored if isinstance(stored, dict) else None), True
    except Exception as exc:
        _trip_db(exc)
        return None, False


async def load_setup(db, legacy: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    stored, mongo_ok = await _read_mongo(db)
    if mongo_ok:
        # Production path: never overlay a laptop runtime file onto live Mongo.
        doc, migrated = apply_legacy(stored or {}, legacy)
        doc["persisted"] = "mongo"
        _cache(_mongo_payload(doc))
        if migrated or not stored:
            saved = await save_setup(db, _mongo_payload(doc), keep_blank_key=True)
            return saved
        return doc

    fallback = dict(_RUNTIME) if isinstance(_RUNTIME, dict) else _read_runtime_file()
    doc, _migrated = apply_legacy(fallback or {}, legacy)
    doc["persisted"] = "memory"
    _cache(_mongo_payload(doc))
    logger.warning("Refexions Setup loaded from memory only (Mongo unavailable)")
    return doc


async def save_setup(db, incoming: Dict[str, Any], keep_blank_key: bool = True) -> Dict[str, Any]:
    stored, mongo_ok = await _read_mongo(db)
    if mongo_ok:
        current = normalize_doc(stored or {})
    else:
        current = normalize_doc(_RUNTIME or _read_runtime_file() or {})
    nxt = normalize_doc({**current, **(incoming or {})})
    key = str((incoming or {}).get("policy_api_key") or "").strip()
    if key:
        nxt["policy_api_key"] = key
    elif keep_blank_key:
        nxt["policy_api_key"] = current.get("policy_api_key") or ""
    else:
        nxt["policy_api_key"] = ""
    if "faqs" in (incoming or {}):
        faqs = _normalize_faqs(incoming.get("faqs"))
        nxt["faqs"] = faqs or [dict(row) for row in DEFAULT_FAQS]
    if "policies" in (incoming or {}):
        policies = _normalize_policies(incoming.get("policies"))
        nxt["policies"] = policies or default_policies()
    if "menus" in (incoming or {}):
        nxt["menus"] = _normalize_menus(incoming.get("menus"))
    nxt["menus"] = _sync_policies_menu(nxt.get("menus") or {}, nxt.get("policies") or default_policies())
    nxt["updated_at"] = datetime.now(timezone.utc).isoformat()
    payload = _mongo_payload(nxt)
    _cache(payload)
    if not mongo_ok:
        logger.warning("Refexions Setup saved in memory only (Mongo unavailable)")
        nxt["persisted"] = "memory"
        return nxt
    try:
        await db[COLLECTION].update_one({"scope": SCOPE}, {"$set": payload}, upsert=True)
        nxt["persisted"] = "mongo"
        return nxt
    except Exception as exc:
        _trip_db(exc)
        logger.warning("Refexions Setup Mongo save failed; using memory: %s", exc)
        nxt["persisted"] = "memory"
        return nxt
