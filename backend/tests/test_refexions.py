"""Refexions policy send + IT ticket webhook (no live Kissflow)."""
from routes.itsm import _ticket_webhook_body
from routes.refexions import (
    _policy_recipient_email,
    _policy_send_ok,
    _policy_send_payload,
    _ticket_subject,
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
