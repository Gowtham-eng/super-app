"""Assignment-only OIDC access must fail closed for a pilot executive app."""

import unittest

from services.oidc_access import oidc_app_access


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


if __name__ == "__main__":
    unittest.main()
