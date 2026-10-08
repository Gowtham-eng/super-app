"""Assigned-only authorization codes require RFC 7636 S256 verification."""

import unittest

from services.oidc_pkce import matches_s256_verifier, valid_s256_challenge


VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


class PkceTests(unittest.TestCase):
    def test_rfc7636_s256_vector(self):
        self.assertTrue(valid_s256_challenge(CHALLENGE, "S256"))
        self.assertTrue(matches_s256_verifier(VERIFIER, CHALLENGE))

    def test_missing_plain_and_malformed_challenges_deny(self):
        self.assertFalse(valid_s256_challenge(None, "S256"))
        self.assertFalse(valid_s256_challenge(CHALLENGE, "plain"))
        self.assertFalse(valid_s256_challenge(CHALLENGE + "=", "S256"))
        self.assertFalse(valid_s256_challenge("short", "S256"))

    def test_wrong_or_malformed_verifier_deny(self):
        self.assertFalse(matches_s256_verifier(VERIFIER[:-1] + "a", CHALLENGE))
        self.assertFalse(matches_s256_verifier(None, CHALLENGE))
        self.assertFalse(matches_s256_verifier("short", CHALLENGE))
        self.assertFalse(matches_s256_verifier(VERIFIER, CHALLENGE[:-1] + "="))


if __name__ == "__main__":
    unittest.main()
