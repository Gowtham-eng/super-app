"""Reports launcher visibility — chief-position users only."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.launcher_access import (
    is_chief_position,
    is_reports_app,
    user_can_see_reports,
)


REPORT = {"id": "r1", "name": "Consolidated Usage Report", "category": "Reports"}
NE_EMBED = {
    "id": "oidc-itsm",
    "name": "IT Service Management",
    "home_url": "https://refex-admin-ui.example/applications/ITSM?embed=1",
}
EMS = {"id": "saml-ems", "name": "Expense Management", "category": "Expense"}


def test_is_reports_app():
    assert is_reports_app(REPORT) is True
    assert is_reports_app(NE_EMBED) is True
    assert is_reports_app(EMS) is False


def test_chief_position_from_designation():
    assert is_chief_position({"designation": "Chief Executive Officer"}) is True
    assert is_chief_position({"designation": "CEO"}) is True
    assert is_chief_position({"job_title": "Chief Financial Officer"}) is True
    assert is_chief_position({"position": "Chief Operating Officer"}) is True
    assert is_chief_position({"designation": "Manager"}) is False
    assert is_chief_position({"title": "Mr."}) is False
    assert is_chief_position({"email": "anyone@refex.co.in"}) is False


def test_reports_visible_to_chiefs_only(monkeypatch):
    monkeypatch.delenv("REPORTS_ALLOWED_EMAILS", raising=False)
    assert user_can_see_reports({"designation": "Chief Human Resources Officer"}) is True
    assert user_can_see_reports({"role": "org_admin", "designation": "Analyst"}) is False
    assert user_can_see_reports({"email": "anyone@refex.co.in", "designation": "Analyst"}) is False


def test_reports_email_allowlist_override(monkeypatch):
    monkeypatch.setenv("REPORTS_ALLOWED_EMAILS", "dinesh@refex.co.in")
    assert user_can_see_reports({"email": "dinesh@refex.co.in", "designation": "Analyst"}) is True
    assert user_can_see_reports({"email": "other@refex.co.in", "designation": "Analyst"}) is False
