import json

from fastapi import HTTPException
import pytest

from routes.itsm import (
    _development_submit_webhook_url,
    _merge_shared,
    _pin_development_submit_config,
    _public_shared,
    _resolve_webhook_path,
    _ticket_webhook_body,
    _webhook_belongs_to_account,
)
from services.itsm_ticket_attachments import (
    TICKET_ATTACHMENT_MAX_FILE_BYTES,
    _gcs_access_token,
    gcs_credentials_path,
    normalize_attachment_urls,
    parse_gcs_service_account_json,
    public_attachment_url,
    resolve_upload_filename,
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


def test_resolve_upload_filename_for_ios_images():
    assert resolve_upload_filename("IMG_0001.HEIC", "image/heic") == "IMG_0001.HEIC"
    assert resolve_upload_filename("photo.HEIC", "") == "photo.HEIC"
    assert resolve_upload_filename("image", "image/jpeg") == "image.jpg"
    assert resolve_upload_filename("", "image/heic") == "image.heic"
    assert resolve_upload_filename("shot.png", "image/png") == "shot.png"


def test_gcs_credentials_path_uses_explicit_file(tmp_path, monkeypatch):
    key = tmp_path / "gcs-itsm-attachments.json"
    key.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("ITSM_GCS_CREDENTIALS_FILE", str(key))
    assert gcs_credentials_path() == str(key)


def test_gcs_credentials_path_ignores_missing_explicit_file(tmp_path, monkeypatch):
    monkeypatch.setenv("ITSM_GCS_CREDENTIALS_FILE", str(tmp_path / "missing.json"))
    assert gcs_credentials_path() == ""


def test_gcs_access_token_requires_service_account_json(monkeypatch):
    monkeypatch.setattr(
        "services.itsm_ticket_attachments.gcs_service_account_info",
        lambda: None,
    )
    monkeypatch.setattr(
        "services.itsm_ticket_attachments.gcs_credentials_path",
        lambda: "",
    )
    with pytest.raises(HTTPException) as exc:
        _gcs_access_token()
    assert exc.value.status_code == 502


def test_parse_gcs_service_account_json_rejects_non_sa():
    with pytest.raises(HTTPException) as exc:
        parse_gcs_service_account_json("{}")
    assert exc.value.status_code == 400
    info = parse_gcs_service_account_json(
        json.dumps(
            {
                "type": "service_account",
                "client_email": "sa@example.iam.gserviceaccount.com",
                "private_key": "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
            }
        )
    )
    assert info["client_email"] == "sa@example.iam.gserviceaccount.com"


def test_public_shared_redacts_gcs_private_key():
    payload = _public_shared(
        {
            "gcs_service_account": {
                "type": "service_account",
                "client_email": "sa@example.iam.gserviceaccount.com",
                "private_key": "SECRET-PRIVATE-KEY",
            },
            "gcs_credentials_filename": "gcs-itsm-attachments.json",
        }
    )
    dumped = json.dumps(payload)
    assert "SECRET-PRIVATE-KEY" not in dumped
    assert "gcs_service_account" not in payload
    assert payload["gcs_credentials_configured"] is True
    assert payload["gcs_credentials_email"] == "sa@example.iam.gserviceaccount.com"


def test_merge_shared_keeps_existing_gcs_key():
    merged = _merge_shared(
        {
            "gcs_service_account": {
                "type": "service_account",
                "client_email": "sa@example.iam.gserviceaccount.com",
                "private_key": "KEEP-KEY",
            },
            "application_id": "IT_Service_Management_A00",
        },
        {"application_id": "IT_Service_Management_A00"},
    )
    assert merged["gcs_service_account"]["private_key"] == "KEEP-KEY"


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


def test_webhook_follows_active_environment_and_does_not_swap_tokens():
    live_token = (
        "/integration/2/AcCMptlq60zH/webhook/"
        "LIVE_TOKEN_ONLY"
    )
    dev_conn = {
        "account_id": "AcCMptp3yqcn",
        "webhook_path_refex": (
            "/integration/2/AcCMptp3yqcn/webhook/"
            "J1VLVRMG2wXYcRkvDBHLxx0L5fNELbNtFYhPNtUg7kMbhvZSFxJL44ZEjn0htxhGqNCWqOntb7ZcbAz4MNWtQ"
        ),
    }
    live_conn = {
        "account_id": "AcCMptlq60zH",
        "webhook_path_refex": live_token,
    }
    shared = {
        "refex": {"webhook_path": live_token},
    }
    dev_path = _resolve_webhook_path("development", "Refex", dev_conn, shared)
    live_path = _resolve_webhook_path("live", "Refex", live_conn, shared)
    assert "J1VLVRMG2wXYcRkvDBHLxx0L5fNELbNtFYhPNtUg7kMbhvZSFxJL44ZEjn0htxhGqNCWqOntb7ZcbAz4MNWtQ" in dev_path
    assert "AcCMptp3yqcn" in dev_path
    assert "LIVE_TOKEN_ONLY" not in dev_path
    assert "LIVE_TOKEN_ONLY" in live_path
    assert "AcCMptlq60zH" in live_path
    assert _webhook_belongs_to_account(live_token, "AcCMptlq60zH") is True
    assert _webhook_belongs_to_account(live_token, "AcCMptp3yqcn") is False
    # Shared live token must not be rewritten onto development.
    stolen = _resolve_webhook_path(
        "development",
        "Refex",
        {"account_id": "AcCMptp3yqcn"},
        shared,
    )
    assert "LIVE_TOKEN_ONLY" not in stolen
    assert "AcCMptp3yqcn" in stolen
