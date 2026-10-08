"""PKCE S256 validation for confidential assigned-only OIDC clients."""

import base64
import hashlib
import hmac
import re


_CHALLENGE = re.compile(r"^[A-Za-z0-9_-]{43}$")
_VERIFIER = re.compile(r"^[A-Za-z0-9._~-]{43,128}$")


def valid_s256_challenge(challenge, method):
    return method == "S256" and isinstance(challenge, str) and bool(_CHALLENGE.fullmatch(challenge))


def matches_s256_verifier(verifier, challenge):
    if (not isinstance(verifier, str) or not _VERIFIER.fullmatch(verifier) or
            not isinstance(challenge, str) or not _CHALLENGE.fullmatch(challenge)):
        return False
    calculated = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    return hmac.compare_digest(calculated, challenge)
