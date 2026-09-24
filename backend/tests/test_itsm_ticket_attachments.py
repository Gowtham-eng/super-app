from fastapi import HTTPException
import pytest

from routes.itsm import (
    _development_submit_webhook_url,
    _pin_development_submit_config,
    _ticket_webhook_body,
)
from services.itsm_ticket_attachments import (
    TICKET_ATTACHMENT_MAX_FILE_BYTES,
    normalize_attachment_urls,
    public_attachment_url,
    validate_ticket_attachment_batch,
)


def test_refex_webhook_includes_attachment_array():
    body = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_A00",
        name="A",
        email="a@refex.com",
        entity="Refex",
        location="Chennai",
        sub_type="VPN",
        criticality="Low",
        description="down",
        attachments=[
            "https://storage.googleapis.com/refexone-itsm-ticket-attachments/a.jpeg",
        ],
    )
    assert body["Attachment"] == [
        "https://storage.googleapis.com/refexone-itsm-ticket-attachments/a.jpeg",
    ]
    assert "Subject" not in body


def test_refex_webhook_omits_empty_attachment():
    body = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_A00",
        name="A",
        email="a@refex.com",
        entity="Refex",
        location="Chennai",
        sub_type="VPN",
        criticality="Low",
        description="down",
        attachments=[],
    )
    assert "Attachment" not in body


def test_non_refex_webhook_includes_attachment_array():
    body = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_Extrovis_A00",
        name="A",
        email="a@extrovis.com",
        entity="Extrovis",
        location="EPL-I",
        sub_type="Hardware",
        criticality="Low",
        description="test",
        subject="Laptop",
        attachments=["https://example.com/a.png"],
    )
    assert body["Attachment"] == ["https://example.com/a.png"]
    assert body["Subject"] == "Laptop"


def test_normalize_attachment_urls_list_and_string():
    assert normalize_attachment_urls(
        '["https://a.example/x.png"]'
    ) == ["https://a.example/x.png"]
    assert normalize_attachment_urls("https://a.example/x.png") == ["https://a.example/x.png"]
    assert normalize_attachment_urls([]) == []
    with pytest.raises(HTTPException) as exc:
        normalize_attachment_urls(["not-a-url"])
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as too_many:
        normalize_attachment_urls(["https://a.example/x.png", "https://b.example/y.pdf"])
    assert too_many.value.status_code == 400


def test_validate_ticket_attachment_limits():
    validate_ticket_attachment_batch([("shot.png", 1024, "image/png")])
    with pytest.raises(HTTPException):
        validate_ticket_attachment_batch([("notes.txt", 100, "text/plain")])
    with pytest.raises(HTTPException):
        validate_ticket_attachment_batch(
            [("big.pdf", TICKET_ATTACHMENT_MAX_FILE_BYTES + 1, "application/pdf")]
        )
    with pytest.raises(HTTPException):
        validate_ticket_attachment_batch(
            [("a.png", 1024, "image/png"), ("b.png", 1024, "image/png")]
        )


def test_public_attachment_url():
    assert public_attachment_url("refexone-itsm-ticket-attachments", "tickets/a.png").endswith(
        "/tickets/a.png"
    )


def test_submit_pins_builtin_development_webhook_not_live_token():
    live_token_path = (
        "/integration/2/AcCMptlq60zH/webhook/"
        "LIVE_TOKEN_SHOULD_NOT_BE_USED"
    )
    pinned_refex = _pin_development_submit_config(
        {
            "kissflow_base_url": "https://refexgroup.kissflow.com",
            "account_id": "AcCMptlq60zH",
            "webhook_path": live_token_path,
            "process_id": "Live_IT_Service_Request_A00",
        },
        "Refex",
    )
    assert pinned_refex["environment"] == "development"
    assert pinned_refex["kissflow_base_url"] == "https://development-refexgroup.kissflow.com"
    assert pinned_refex["account_id"] == "AcCMptp3yqcn"
    assert "LIVE_TOKEN_SHOULD_NOT_BE_USED" not in pinned_refex["webhook_path"]
    assert pinned_refex["webhook_path"].startswith("/integration/2/AcCMptp3yqcn/webhook/")
    assert "J1VLVRMG2wXYcRkvDBHLxx0L5fNELbNtFYhPNtUg7kMbhvZSFxJL44ZEjn0htxhGqNCWqOntb7ZcbAz4MNWtQ" in pinned_refex["webhook_path"]

    pinned_ext = _pin_development_submit_config({"webhook_path": live_token_path}, "Extrovis")
    assert "M1yJco-Vdt6t962Xi9BnbOd5nm75TKnl6mAD8rA7hA8lAiQJkce9Xj2zbOn8Nn0KkcB4n7Vz6sypvft61N1w" in pinned_ext["webhook_path"]
    assert _development_submit_webhook_url("Refex").startswith(
        "https://development-refexgroup.kissflow.com/integration/2/AcCMptp3yqcn/webhook/"
    )
    assert _development_submit_webhook_url("Extrovis").startswith(
        "https://development-refexgroup.kissflow.com/integration/2/AcCMptp3yqcn/webhook/"
    )
