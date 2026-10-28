"""Spaces after commas in the Google domain box must not become part of the domain."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.google_oauth import (
    _normalize_domains,
    is_directory_sync,
    pick_login_config_for_domain,
)


def test_space_after_comma_is_not_part_of_the_domain():
    raw = ["refex.co.in, 3imedtech.com, noventiq.com, kissflow.com, modepro.com, omegahires.com"]
    assert _normalize_domains(raw) == [
        "refex.co.in",
        "3imedtech.com",
        "noventiq.com",
        "kissflow.com",
        "modepro.com",
        "omegahires.com",
    ]
    assert "omegahires.com" in _normalize_domains(["refex.co.in", " omegahires.com"])
    assert "omegehires.com" not in _normalize_domains(["omegahires.com"])


def test_modepro_sync_admin_uses_refexone_login():
    refex = {
        "id": "login-refex",
        "label": "Refex Google Workspace",
        "status": "active",
        "purpose": "login",
        "email_domains": ["refex.co.in"],
    }
    modepro_sync = {
        "id": "sync-modepro",
        "label": "Mode Pro",
        "status": "active",
        "purpose": "directory_sync",
        "email_domains": ["modepro.com"],
    }
    assert is_directory_sync(modepro_sync) is True
    assert is_directory_sync(refex) is False
    assert is_directory_sync({"label": "legacy"}) is False
    chosen = pick_login_config_for_domain([modepro_sync, refex], "modepro.com")
    assert chosen["id"] == "login-refex"
    already = pick_login_config_for_domain(
        [{**refex, "email_domains": ["refex.co.in", "modepro.com"]}, modepro_sync],
        "modepro.com",
    )
    assert already["id"] == "login-refex"
