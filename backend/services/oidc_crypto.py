"""OIDC provider signing (RS256) + JWKS for Feast / external RPs."""
from __future__ import annotations

import base64
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt

logger = logging.getLogger(__name__)

_KID = "refexone-oidc-1"

_private_key = None
_public_key = None


def _b64url_uint(val: int) -> str:
    length = (val.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(val.to_bytes(length, "big")).rstrip(b"=").decode("ascii")


def _load_pem_pair(private_pem: bytes, public_pem: bytes) -> Tuple[Any, Any]:
    private_key = serialization.load_pem_private_key(private_pem, password=None)
    public_key = serialization.load_pem_public_key(public_pem)
    return private_key, public_key


def _generate_pem_pair() -> Tuple[bytes, bytes, Any]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem, key


def _try_load_from_paths(private_path: Path, public_path: Path) -> Optional[Tuple[Any, Any]]:
    try:
        if private_path.exists() and public_path.exists():
            return _load_pem_pair(private_path.read_bytes(), public_path.read_bytes())
    except Exception as e:
        logger.warning("OIDC key load failed from %s: %s", private_path, e)
    return None


def _try_write_pair(private_path: Path, public_path: Path, private_pem: bytes, public_pem: bytes) -> bool:
    try:
        private_path.parent.mkdir(parents=True, exist_ok=True)
        private_path.write_bytes(private_pem)
        public_path.write_bytes(public_pem)
        return True
    except Exception as e:
        logger.warning("OIDC key write failed at %s: %s", private_path.parent, e)
        return False


def _ensure_keys() -> Tuple[Any, Any]:
    """Load or create RSA keys. Prefer env → data/ → /tmp → in-memory."""
    global _private_key, _public_key
    if _private_key is not None and _public_key is not None:
        return _private_key, _public_key

    # 1) Explicit PEM from environment (best for containers)
    env_priv = os.environ.get("OIDC_RSA_PRIVATE_PEM", "").strip()
    env_pub = os.environ.get("OIDC_RSA_PUBLIC_PEM", "").strip()
    if env_priv and env_pub:
        _private_key, _public_key = _load_pem_pair(
            env_priv.replace("\\n", "\n").encode("utf-8"),
            env_pub.replace("\\n", "\n").encode("utf-8"),
        )
        logger.info("OIDC RSA keys loaded from environment")
        return _private_key, _public_key

    candidates = [
        Path(__file__).resolve().parent.parent / "data",
        Path("/tmp/refexone_oidc"),
        Path(os.environ.get("TMPDIR", "/tmp")) / "refexone_oidc",
    ]

    for key_dir in candidates:
        private_path = key_dir / "oidc_rsa_private.pem"
        public_path = key_dir / "oidc_rsa_public.pem"
        loaded = _try_load_from_paths(private_path, public_path)
        if loaded:
            _private_key, _public_key = loaded
            logger.info("OIDC RSA keys loaded from %s", key_dir)
            return _private_key, _public_key

    private_pem, public_pem, key = _generate_pem_pair()
    written = False
    for key_dir in candidates:
        private_path = key_dir / "oidc_rsa_private.pem"
        public_path = key_dir / "oidc_rsa_public.pem"
        if _try_write_pair(private_path, public_path, private_pem, public_pem):
            written = True
            logger.warning("Generated OIDC RSA keypair at %s", key_dir)
            break

    if not written:
        logger.error(
            "Could not persist OIDC RSA keys (read-only FS). Using in-memory keys; "
            "set OIDC_RSA_PRIVATE_PEM / OIDC_RSA_PUBLIC_PEM for stable multi-replica deploy."
        )

    _private_key = key
    _public_key = key.public_key()
    return _private_key, _public_key


def get_jwks() -> Dict[str, Any]:
    _, public_key = _ensure_keys()
    numbers = public_key.public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": _KID,
                "n": _b64url_uint(numbers.n),
                "e": _b64url_uint(numbers.e),
            }
        ]
    }


def sign_oidc_jwt(payload: Dict[str, Any]) -> str:
    private_key, _ = _ensure_keys()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(payload, private_pem, algorithm="RS256", headers={"kid": _KID})
    if isinstance(token, bytes):
        return token.decode("utf-8")
    return token


def decode_oidc_jwt(token: str, hs_secret: Optional[str] = None, hs_algorithm: str = "HS256") -> Dict[str, Any]:
    """Decode RS256 OIDC tokens; optionally fall back to legacy HS256."""
    _, public_key = _ensure_keys()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    try:
        return jwt.decode(token, public_pem, algorithms=["RS256"], options={"verify_aud": False})
    except jwt.ExpiredSignatureError:
        raise
    except Exception:
        if not hs_secret:
            raise
        return jwt.decode(token, hs_secret, algorithms=[hs_algorithm], options={"verify_aud": False})


def normalize_issuer(public_url: str, request=None) -> str:
    """OIDC issuer must be an https URL in production."""
    url = (public_url or "").rstrip("/")
    if not url and request is not None:
        forwarded_host = request.headers.get("x-forwarded-host")
        host = forwarded_host or request.headers.get("host", "")
        scheme = request.headers.get("x-forwarded-proto", "https")
        url = f"{scheme}://{host}".rstrip("/")
    if url.startswith("http://") and "localhost" not in url and "127.0.0.1" not in url:
        url = "https://" + url[len("http://") :]
    return url or "https://refexone.com"
