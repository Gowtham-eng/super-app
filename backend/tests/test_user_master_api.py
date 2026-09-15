"""User Master API helpers — no live server required."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.user_master import (
    build_user_master_query,
    extract_api_token,
    serialize_user_master,
)


def test_serialize_strips_secrets_and_fills_names():
    row = serialize_user_master({
        "id": "u1",
        "email": "CEO@Refex.co.in",
        "first_name": "A",
        "last_name": "B",
        "name": "A B",
        "password": "secret",
        "admin_known_password": "visible",
        "designation": "Chief Executive Officer",
        "status": "active",
    })
    assert row["email"] == "ceo@refex.co.in"
    assert row["name"] == "A B"
    assert row["full_name"] == "A B"
    assert row["designation"] == "Chief Executive Officer"
    assert "password" not in row
    assert "admin_known_password" not in row


def test_extract_api_token_from_bearer_and_header():
    assert extract_api_token(authorization="Bearer um_abc") == "um_abc"
    assert extract_api_token(api_key="um_key") == "um_key"
    assert extract_api_token(authorization="um_raw") == "um_raw"
    assert extract_api_token() == ""


def test_build_query_defaults_to_active():
    query = build_user_master_query()
    assert query["status"] == "active"
    assert "org_id" not in query


def test_build_query_filters_and_search():
    query = build_user_master_query(
        org_id="org-1",
        status="all",
        email="a@refex.co.in",
        employee_id="E001",
        q="Chief",
    )
    assert query["org_id"] == "org-1"
    assert "status" not in query
    assert query["email"] == "a@refex.co.in"
    assert query["adrenalin_employee_id"] == "E001"
    assert "$or" in query


def test_build_query_combines_search_and_updated_since():
    query = build_user_master_query(q="finance", updated_since="2026-01-01")
    assert "$and" in query
    assert len(query["$and"]) == 2
