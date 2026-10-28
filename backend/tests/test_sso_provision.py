"""First Google/Microsoft login creates a user only for a registered domain."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.sso_provision import build_sso_user, company_from_domain


def test_login_user_is_active_in_the_config_org():
    doc = build_sso_user(
        email="person@modepro.com",
        org_id="org-1",
        claims={"name": "Mode Person", "given_name": "Mode", "family_name": "Person"},
        source="google_login",
        password_hash="hashed",
        extra={"google_config_id": "cfg-1"},
    )
    assert doc["email"] == "person@modepro.com"
    assert doc["org_id"] == "org-1"
    assert doc["status"] == "active"
    assert doc["role"] == "user"
    assert doc["name"] == "Mode Person"
    assert doc["company"] == "Modepro"
    assert doc["source"] == "google_login"
    assert doc["google_config_id"] == "cfg-1"
    assert "password" in doc
    assert company_from_domain("refex.co.in") == "Refex"
