"""Microsoft /common SSO maps email domain to the right Azure AD Login row."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.azure_ad import MS_OAUTH_AUTHORITY, _ms_oauth_url, match_config_for_email

VENWIND = {
    "id": "venwind",
    "label": "Venwindrefex",
    "tenant_id": "venwind-tid",
    "email_domains": ["venwindrefex.com"],
}
EXTROVIS = {
    "id": "extrovis",
    "label": "extrovis",
    "tenant_id": "extrovis-tid",
    "email_domains": ["extrovis.com"],
}
KAVIS = {
    "id": "kavis",
    "label": "kavispharma",
    "tenant_id": "kavis-tid",
    "email_domains": ["kavispharma.com"],
}


def test_authority_is_common():
    assert MS_OAUTH_AUTHORITY == "common"
    assert _ms_oauth_url("authorize").startswith(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    )


def test_extrovis_email_not_venwind():
    hit = match_config_for_email(
        [VENWIND, EXTROVIS, KAVIS], "ajjusyed@extrovis.com"
    )
    assert hit["id"] == "extrovis"


def test_kavis_and_venwind_domains():
    configs = [VENWIND, EXTROVIS, KAVIS]
    assert match_config_for_email(configs, "user@kavispharma.com")["id"] == "kavis"
    assert match_config_for_email(configs, "user@venwindrefex.com")["id"] == "venwind"


def test_unknown_domain_is_rejected():
    assert match_config_for_email([VENWIND, EXTROVIS], "nobody@example.com") is None
