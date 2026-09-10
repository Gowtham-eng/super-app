"""HR sync must keep users on the catalog org so AppLauncher stays populated."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.adrenalin_sync import hr_test_org_ids, primary_hr_org_id, resolve_hr_sync_org_id


def test_resolve_prefers_primary_over_requested(monkeypatch):
    monkeypatch.setenv("PRIMARY_HR_ORG_ID", "primary-org")
    monkeypatch.setenv("HR_TEST_ORG_IDS", "test-org")
    assert resolve_hr_sync_org_id("test-org") == "primary-org"
    assert resolve_hr_sync_org_id("venwind-org") == "primary-org"


def test_resolve_skips_test_org_when_no_primary(monkeypatch):
    monkeypatch.delenv("PRIMARY_HR_ORG_ID", raising=False)
    monkeypatch.setenv("HR_TEST_ORG_IDS", "test-org, other-test")
    assert "test-org" in hr_test_org_ids()
    assert resolve_hr_sync_org_id("live-org") == "live-org"


def test_primary_hr_org_id_from_env(monkeypatch):
    monkeypatch.setenv("PRIMARY_HR_ORG_ID", "15f688ad-ae0a-4947-b329-7a231859f226")
    assert primary_hr_org_id() == "15f688ad-ae0a-4947-b329-7a231859f226"
