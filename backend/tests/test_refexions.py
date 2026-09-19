"""Refexions policy send + IT ticket webhook (no live Kissflow)."""
from routes.itsm import (
    DEFAULT_REFEXIONS_ML_URL,
    DEFAULT_REFEXIONS_POLICY_SERVICE_URL,
    _ticket_webhook_body,
    resolve_refexions_ml_url,
    resolve_refexions_policy_api_key,
    resolve_refexions_policy_service_url,
)
from routes.refexions import (
    _policy_recipient_email,
    _policy_send_ok,
    _policy_send_payload,
    _ticket_kissflow_env,
    _ticket_subject,
)
from services.refexions_store import (
    DEFAULT_FAQS,
    apply_legacy,
    chat_main_menu,
    chat_policies,
    chat_sub_menu,
    match_faq,
    normalize_doc,
    policy_by_id,
)


def test_policy_payload_matches_sender_schema():
    payload = _policy_send_payload("it_policy", "test.automate@extrovis.com")
    assert payload == {
        "template_id": "policy_share_v1",
        "document_id": "it_policy",
        "user_email": "test.automate@extrovis.com",
    }
    assert "to" not in payload


def test_policy_send_ok_accepts_sent_and_http_200():
    assert _policy_send_ok(200, {"status": "sent", "to": "a@b.com"}) is True
    assert _policy_send_ok(200, {"status": "queued"}) is True
    assert _policy_send_ok(200, {}) is True
    assert _policy_send_ok(422, {"status": "sent"}) is False
    assert _policy_send_ok(200, {"status": "failed"}) is False
    assert _policy_send_ok(401, {"detail": "Invalid API key"}) is False


def test_policy_recipient_email_normalizes():
    assert _policy_recipient_email("  Test.Automate@extrovis.com ") == "test.automate@extrovis.com"
    assert _policy_recipient_email("Name <test.automate@extrovis.com>") == "test.automate@extrovis.com"
    assert _policy_recipient_email("", "backup@extrovis.com") == "backup@extrovis.com"


def test_ticket_subject_prefers_asked_value():
    assert _ticket_subject("long description here", "Hardware", "Laptop issue") == "Laptop issue"
    assert _ticket_subject("Laptop screen flicker\nPlease check today.", "Hardware") == "Laptop screen flicker"


def test_refexions_non_refex_ticket_includes_subject():
    description = "Laptop screen flicker\nPlease check today."
    body = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_Extrovis_A00",
        name="Test Automate",
        email="test.automate@extrovis.com",
        entity="Extrovis",
        location="EPL-I",
        sub_type="Hardware",
        criticality="Medium",
        description=description,
        subject=_ticket_subject(description, "Hardware", "Screen flicker"),
    )
    assert body["Subject"] == "Screen flicker"
    assert body["Description"] == description
    assert "Subject" in list(body.keys())
    refex = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_A00",
        name="A",
        email="a@refex.com",
        entity="Refex",
        location="Chennai",
        sub_type="VPN",
        criticality="Low",
        description="vpn down",
        subject=_ticket_subject("vpn down", "VPN", "should be ignored for refex body"),
    )
    assert "Subject" not in refex


def test_ticket_kissflow_env_defaults_to_live(monkeypatch):
    monkeypatch.delenv("REFEXIONS_TICKET_ENV", raising=False)
    assert _ticket_kissflow_env() == "live"
    monkeypatch.setenv("REFEXIONS_TICKET_ENV", "development")
    assert _ticket_kissflow_env() == "development"
    monkeypatch.setenv("REFEXIONS_TICKET_ENV", "live")
    assert _ticket_kissflow_env() == "live"


def test_policy_key_prefers_setup_over_env(monkeypatch):
    monkeypatch.setenv("REFEXIONS_POLICY_API_KEY", "from-local-env")
    assert (
        resolve_refexions_policy_api_key({"refexions_policy_api_key": "from-setup"})
        == "from-setup"
    )


def test_ml_and_policy_urls_use_production_defaults(monkeypatch):
    monkeypatch.delenv("REFEXIONS_ML_URL", raising=False)
    monkeypatch.delenv("REFEXIONS_POLICY_SERVICE_URL", raising=False)
    assert resolve_refexions_ml_url({}) == DEFAULT_REFEXIONS_ML_URL
    assert "keyword-matching-api" in DEFAULT_REFEXIONS_ML_URL
    assert resolve_refexions_policy_service_url({}) == DEFAULT_REFEXIONS_POLICY_SERVICE_URL
    assert resolve_refexions_ml_url({"refexions_ml_url": "https://custom.example/match"}) == (
        "https://custom.example/match"
    )


def test_faq_matches_keywords_without_ai():
    hit = match_faq("how do I raise an IT ticket for vpn", DEFAULT_FAQS)
    assert hit
    assert hit["id"] == "faq-it-ticket"
    policy = match_faq("please send me the POSH policy", DEFAULT_FAQS)
    assert policy
    assert policy["id"] == "faq-policy"
    unknown = match_faq("what is the weather in chennai today", DEFAULT_FAQS)
    assert unknown is None


def test_chat_menus_come_from_stored_setup_not_kissflow():
    stored = normalize_doc({
        "menus": {
            "main": {
                "message": "Pick a service",
                "options": ["Expense", "Travel", "IT HelpDesk", "Policies"],
                "source": "kissflow",
                "refreshed_at": "2026-09-18T09:00:00+00:00",
            },
            "expense": {
                "message": "Pick expense type",
                "options": ["Food", "Travel Ticket"],
                "source": "kissflow",
            },
        }
    })
    main = chat_main_menu(stored)
    assert main["source"] == "kissflow"
    assert main["message"] == "Pick a service"
    assert main["options"][0] == "Expense"
    assert main["environment"] == "setup"
    expense = chat_sub_menu(stored, "Expense")
    assert expense["options"] == ["Food", "Travel Ticket"]
    assert expense["comingSoon"] is True
    empty = chat_main_menu({})
    assert empty["options"] == ["Expense", "Travel", "IT HelpDesk", "Policies"]
    assert empty["source"] == "setup"


def test_policies_menu_comes_from_setup():
    stored = normalize_doc({
        "policies": [
            {
                "title": "Leave Policy",
                "description": "Leave rules",
                "document_id": "leave_policy",
            }
        ],
        "menus": {
            "policies": {
                "message": "Pick a policy",
                "source": "setup",
            }
        },
    })
    listed = chat_policies(stored)
    assert listed["options"] == ["Leave Policy"]
    assert listed["policies"][0]["document_id"] == "leave_policy"
    submenu = chat_sub_menu(stored, "Policies")
    assert submenu["intent"] == "Policy"
    assert submenu["options"] == ["Leave Policy"]
    assert policy_by_id("leave_policy", stored)["title"] == "Leave Policy"


def test_legacy_setup_seeds_menus_into_mongo_payload():
    doc, changed = apply_legacy({"faqs": DEFAULT_FAQS})
    assert changed is True
    assert doc["menus"]["main"]["options"][0] == "Expense"
    again, changed_again = apply_legacy(doc)
    assert changed_again is False
