"""Sample test: a ticket failure emails the watch list once, with the webhook token removed."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.failure_alerts import (
    failure_alert_emails,
    notify_failure,
    redact_secrets,
    reset_failure_alert_cooldown,
)


WATCH = [
    "aravind.srinivasan@refex.co.in",
    "gowtham.s@refex.co.in",
    "pravinkumar.raja@refex.co.in",
    "sathishkumar.r@refex.co.in",
    "raghul.je@refex.co.in",
    "murugesh.k@refex.co.in",
    "mohamedaasik.m@refex.co.in",
]


def test_default_watch_list(monkeypatch):
    monkeypatch.delenv("FAILURE_ALERT_EMAILS", raising=False)
    assert failure_alert_emails() == WATCH


def test_env_override_replaces_the_watch_list(monkeypatch):
    monkeypatch.setenv("FAILURE_ALERT_EMAILS", "one@refex.co.in, two@refex.co.in")
    assert failure_alert_emails() == ["one@refex.co.in", "two@refex.co.in"]


def test_sample_extrovis_ticket_failure_is_emailed_once(monkeypatch):
    monkeypatch.delenv("FAILURE_ALERT_EMAILS", raising=False)
    reset_failure_alert_cooldown()
    sent = []

    async def fake_send(to_emails, subject, html_body):
        sent.append({"to": to_emails, "subject": subject, "html": html_body})
        return True

    monkeypatch.setattr("services.email_service.send_email", fake_send)
    detail = (
        "Kissflow webhook rejected the ticket (HTTP 401). "
        "https://refexgroup.kissflow.com/integration/2/AcCMptlq60zH/webhook/SECRET_TOKEN"
    )

    first = asyncio.run(
        notify_failure(
            source="ITSM ticket create",
            summary="Kissflow webhook rejected the ticket (HTTP 401).",
            entity="Extrovis",
            environment="live",
            requester="ajjusyed@extrovis.com",
            detail=detail,
        )
    )
    second = asyncio.run(
        notify_failure(
            source="ITSM ticket create",
            summary="Kissflow webhook rejected the ticket (HTTP 401).",
            entity="Extrovis",
            environment="live",
            requester="ajjusyed@extrovis.com",
            detail=detail,
        )
    )

    assert first is True
    assert second is False
    assert len(sent) == 1
    assert sent[0]["to"] == WATCH
    assert sent[0]["subject"] == "RefexOne failure: ITSM ticket create (Extrovis)"
    assert "ajjusyed@extrovis.com" in sent[0]["html"]
    assert "SECRET_TOKEN" not in sent[0]["html"]
    assert "/webhook/…" in sent[0]["html"]
    assert redact_secrets(detail).endswith("/webhook/…")
