import asyncio
import sys
from pathlib import Path
from urllib.parse import unquote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.kissflow_scim_client import (
    _scim_email_filters,
    _scim_find_user_by_email,
    _scim_user_matches_email,
    link_user_from_kissflow_scim,
)


def test_scim_filters_include_email_and_local_part():
    filters = _scim_email_filters("shakti.singh@refex.co.in")
    assert 'userName eq "shakti.singh@refex.co.in"' in filters
    assert 'emails.value eq "shakti.singh@refex.co.in"' in filters
    assert 'userName eq "shakti.singh"' in filters


def test_scim_user_matches_emails_value_not_username():
    kf_user = {
        "id": "kf-shakti",
        "userName": "RGML011442",
        "emails": [{"value": "shakti.singh@refex.co.in", "primary": True}],
    }
    assert _scim_user_matches_email(kf_user, "Shakti.Singh@refex.co.in") is True
    assert _scim_user_matches_email(kf_user, "other@refex.co.in") is False


def test_scim_find_user_falls_back_to_emails_value(monkeypatch):
    class FakeResp:
        def __init__(self, status, payload):
            self.status_code = status
            self._payload = payload
            self.text = ""

        def json(self):
            return self._payload

    async def fake_request(client, method, url, headers, json_data=None):
        decoded = unquote(url)
        if "emails.value eq" in decoded:
            return FakeResp(
                200,
                {
                    "Resources": [
                        {
                            "id": "kf-shakti",
                            "active": True,
                            "userName": "RGML011442",
                            "emails": [{"value": "shakti.singh@refex.co.in"}],
                        }
                    ]
                },
            )
        return FakeResp(200, {"Resources": []})

    monkeypatch.setattr(
        "services.kissflow_scim_client._request_with_retry",
        fake_request,
    )

    kf_user, status, _, any_200 = asyncio.run(
        _scim_find_user_by_email(
            None,
            "https://example.kissflow.com/scimv2/2/acct/",
            {},
            "shakti.singh@refex.co.in",
        )
    )
    assert any_200 is True
    assert status == 200
    assert kf_user["id"] == "kf-shakti"


def test_link_creates_when_missing_in_kissflow(monkeypatch):
    async def fake_find(*_a, **_k):
        return None, 200, "", True

    async def fake_push(*_a, **_k):
        return {"action": "created", "kf_id": "kf-new", "email": "shakti.singh@refex.co.in"}

    async def fake_assign(*_a, **_k):
        return ["kissflow-app"]

    async def fake_config(*_a, **_k):
        return {"base_url": "https://example.kissflow.com/scimv2/2/acct/", "token": "t"}

    class UsersCol:
        async def find_one(self, q, proj=None):
            return {
                "id": "u1",
                "email": "shakti.singh@refex.co.in",
                "status": "active",
                "name": "Shakti Singh",
            }

        async def update_one(self, q, upd):
            return None

    class DB:
        users = UsersCol()

    monkeypatch.setattr("services.kissflow_scim_client._scim_find_user_by_email", fake_find)
    monkeypatch.setattr("services.kissflow_scim_client.push_user_to_kissflow", fake_push)
    monkeypatch.setattr("services.kissflow_scim_client._assign_kissflow_apps", fake_assign)
    monkeypatch.setattr("services.kissflow_scim_client.get_kissflow_scim_config", fake_config)

    result = asyncio.run(
        link_user_from_kissflow_scim(DB(), "org1", "shakti.singh@refex.co.in", user_id="u1")
    )
    assert result["action"] == "created"
    assert result["kissflow_user_id"] == "kf-new"
    assert result["apps_assigned"] == ["kissflow-app"]
