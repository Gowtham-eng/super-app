"""Reports launcher visibility — chief-position users only."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.launcher_access import (
    is_chief_position,
    is_procure2pay_app,
    is_reports_app,
    is_rmc_p2p_app,
    user_can_see_launcher_app,
    user_can_see_procure2pay,
    user_can_see_reports,
    user_can_see_rmc_p2p,
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


RMC = {"id": "rmc", "name": "RMC P2P"}
P2P = {"id": "p2p", "name": "Procure2Pay"}
DEEPA = {"email": "deepa.murthy@refex.co.in"}
OTHER = {"email": "anyone@refex.co.in"}


def test_rmc_p2p_vs_procure2pay_names():
    assert is_rmc_p2p_app(RMC) is True
    assert is_rmc_p2p_app(P2P) is False
    assert is_procure2pay_app(P2P) is True
    assert is_procure2pay_app(RMC) is False
    assert is_procure2pay_app({"name": "Procurement to Pay", "category": "Reports"}) is False


def test_rmc_p2p_allowlist_and_procure2pay_denylist(monkeypatch):
    monkeypatch.delenv("RMC_P2P_ALLOWED_EMAILS", raising=False)
    monkeypatch.delenv("PROCURE2PAY_HIDDEN_EMAILS", raising=False)
    assert user_can_see_rmc_p2p(DEEPA) is True
    assert user_can_see_rmc_p2p(OTHER) is False
    assert user_can_see_procure2pay(DEEPA) is False
    assert user_can_see_procure2pay(OTHER) is True
    assert user_can_see_launcher_app(DEEPA, RMC) is True
    assert user_can_see_launcher_app(OTHER, RMC) is False
    assert user_can_see_launcher_app(DEEPA, P2P) is False
    assert user_can_see_launcher_app(OTHER, P2P) is True
    assert user_can_see_launcher_app(DEEPA, EMS) is True
    assert user_can_see_launcher_app(OTHER, EMS) is True
