"""Assignment-only OIDC access must fail closed for a pilot executive app."""

import unittest
from datetime import datetime, timedelta, timezone

from services.oidc_access import oidc_app_access, oidc_assignee_ids_match, oidc_token_unexpired


def user(**changes):
    result = {"id": "executive-1", "org_id": "refex", "status": "active",
              "role": "user", "group_ids": [], "role_ids": []}
    result.update(changes)
    return result


def app(**changes):
    result = {"org_id": "refex", "access_mode": "assigned_only",
              "approved_user_ids": [], "allowed_group_ids": [], "allowed_role_ids": []}
    result.update(changes)
    return result


class OidcAccessTests(unittest.TestCase):
    def test_assignees_require_distinct_active_server_ids(self):
        self.assertTrue(oidc_assignee_ids_match([], []))
        self.assertTrue(oidc_assignee_ids_match(["anil-id", "yash-id"], ["yash-id", "anil-id"]))
        self.assertFalse(oidc_assignee_ids_match(["anil-id", "anil-id"], ["anil-id"]))
        self.assertFalse(oidc_assignee_ids_match(["anil-id", "missing-id"], ["anil-id"]))
        self.assertFalse(oidc_assignee_ids_match(["anil-id", "yash-id"], ["anil-id", "yash-id", "anil-id"]))
        self.assertFalse(oidc_assignee_ids_match([""], []))
        self.assertFalse(oidc_assignee_ids_match("anil-id", ["anil-id"]))

    def test_assignment_only_denies_unassigned_and_admin(self):
        self.assertFalse(oidc_app_access(user(), app()))
        self.assertFalse(oidc_app_access(user(role="org_admin"), app()))

    def test_assignment_only_accepts_direct_group_and_role_grants(self):
        self.assertTrue(oidc_app_access(user(), app(approved_user_ids=["executive-1"])))
        self.assertTrue(oidc_app_access(user(group_ids=["pilot"]), app(allowed_group_ids=["pilot"])))
        self.assertTrue(oidc_app_access(user(role_ids=["exec"]), app(allowed_role_ids=["exec"])))
        self.assertTrue(oidc_app_access(user(group_ids=["pilot"]), app(allowed_role_ids=["exec"]), ["exec"]))

    def test_assignment_only_denies_wrong_org_disabled_and_removed_grants(self):
        self.assertFalse(oidc_app_access(user(org_id="other"), app(approved_user_ids=["executive-1"])))
        self.assertFalse(oidc_app_access(user(status="disabled"), app(approved_user_ids=["executive-1"])))
        self.assertFalse(oidc_app_access(user(), app(allowed_group_ids=["pilot"])))
        self.assertFalse(oidc_app_access(user(group_ids=["pilot"]), app(allowed_group_ids=[])))

    def test_legacy_open_mode_preserves_restricted_behavior(self):
        self.assertTrue(oidc_app_access(user(), {"org_id": "refex"}))
        self.assertFalse(oidc_app_access(user(), {"org_id": "refex", "restricted": True}))
        self.assertTrue(oidc_app_access(user(role="org_admin"), {"org_id": "refex", "restricted": True}))

    def test_malformed_access_mode_and_grants_deny(self):
        self.assertFalse(oidc_app_access(user(), app(access_mode="unknown")))
        self.assertFalse(oidc_app_access(user(), app(allowed_group_ids="pilot")))
        self.assertFalse(oidc_app_access(user(group_ids="pilot"), app(allowed_group_ids=["pilot"])))

    def test_assigned_token_expiry_handles_mongo_utc_datetimes(self):
        now = datetime(2026, 10, 8, tzinfo=timezone.utc)
        self.assertTrue(oidc_token_unexpired({"expires_at": now + timedelta(minutes=1)}, now))
        self.assertTrue(oidc_token_unexpired({"expires_at": (now + timedelta(minutes=1)).replace(tzinfo=None)}, now))
        self.assertFalse(oidc_token_unexpired({"expires_at": now}, now))
        self.assertFalse(oidc_token_unexpired({}, now))


if __name__ == "__main__":
    unittest.main()
