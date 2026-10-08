"""Assigned-only launch grants are app-bound, short-lived, and single-use."""

import asyncio
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import unittest

from services.oidc_launch import LAUNCH_TTL_SECONDS, create_launch_grant, consume_launch_grant


class Grants:
    def __init__(self, record):
        self.record = record

    async def find_one_and_delete(self, query):
        if self.record is None:
            return None
        if (self.record["token_digest"] == query["token_digest"] and
                self.record["app_id"] == query["app_id"] and
                self.record["expires_at"] > query["expires_at"]["$gt"]):
            record, self.record = self.record, None
            return record
        return None


class LaunchGrantTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 8, tzinfo=timezone.utc)
        self.user = {"id": "executive-1", "org_id": "refex"}
        self.app = {"id": "rex", "org_id": "refex", "access_mode": "assigned_only"}
        self.raw = "a" * 43

    def create(self):
        return create_launch_grant(self.user, self.app, self.now, lambda _: self.raw)

    def consume(self, collection, raw, app_id="rex", now=None):
        return asyncio.run(consume_launch_grant(collection, raw, app_id, now or self.now))

    def test_grant_stores_digest_and_expires_in_five_minutes(self):
        raw, record = self.create()
        self.assertEqual(raw, self.raw)
        self.assertNotIn(raw, str(record))
        self.assertEqual(record["token_digest"], sha256(raw.encode()).hexdigest())
        self.assertEqual(record["expires_at"], self.now + timedelta(seconds=LAUNCH_TTL_SECONDS))
        self.assertEqual((record["app_id"], record["user_id"], record["org_id"]),
                         ("rex", "executive-1", "refex"))

    def test_grant_is_app_bound_and_single_use(self):
        raw, record = self.create()
        collection = Grants(record)
        self.assertIsNone(self.consume(collection, raw, "other-app"))
        self.assertEqual(self.consume(collection, raw), record)
        self.assertIsNone(self.consume(collection, raw))

    def test_expired_and_malformed_grants_fail_closed(self):
        raw, record = self.create()
        collection = Grants(record)
        self.assertIsNone(self.consume(collection, raw, now=record["expires_at"]))
        self.assertIsNone(self.consume(collection, "malformed"))
        self.assertIsNone(self.consume(collection, None))
        self.assertIsNotNone(collection.record)

    def test_wrong_org_and_unassigned_app_cannot_create_grant(self):
        with self.assertRaises(ValueError):
            create_launch_grant(self.user, {**self.app, "org_id": "other"}, self.now)
        with self.assertRaises(ValueError):
            create_launch_grant(self.user, {**self.app, "access_mode": "open"}, self.now)


if __name__ == "__main__":
    unittest.main()
