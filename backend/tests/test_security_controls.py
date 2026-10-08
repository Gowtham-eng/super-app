"""ISO 27001 technical controls that must not depend on MongoDB."""
import pytest
from fastapi import HTTPException

from services.security_controls import (
    assert_login_allowed,
    clear_login_failures,
    is_safe_profile_pic,
    master_login_password,
    public_register_enabled,
    record_login_failure,
    reset_login_throttle,
    saml_debug_enabled,
    security_posture_warnings,
    validate_logo_upload,
)


@pytest.fixture(autouse=True)
def _clean_throttle():
    reset_login_throttle()
    yield
    reset_login_throttle()


def test_master_login_is_off_unless_configured(monkeypatch):
    monkeypatch.delenv("MASTER_LOGIN_PASSWORD", raising=False)
    assert master_login_password() == ""


def test_master_login_uses_environment_secret(monkeypatch):
    monkeypatch.setenv("MASTER_LOGIN_PASSWORD", "configured-secret")
    assert master_login_password() == "configured-secret"


def test_empty_master_login_env_disables_support_login(monkeypatch):
    monkeypatch.setenv("MASTER_LOGIN_PASSWORD", "   ")
    assert master_login_password() == ""


def test_login_throttle_blocks_after_repeated_failures():
    email = "person@refex.co.in"
    for _ in range(19):
        record_login_failure(email)
        assert_login_allowed(email)
    record_login_failure(email)
    with pytest.raises(HTTPException) as exc:
        assert_login_allowed(email)
    assert exc.value.status_code == 429


def test_successful_login_clears_throttle():
    email = "person@refex.co.in"
    for _ in range(20):
        record_login_failure(email)
    clear_login_failures(email)
    assert_login_allowed(email)


def test_profile_pic_rejects_script_urls():
    assert is_safe_profile_pic("")
    assert is_safe_profile_pic("/api/uploads/abc.png")
    assert is_safe_profile_pic("https://cdn.example.com/a.png")
    assert not is_safe_profile_pic("javascript:alert(1)")
    assert not is_safe_profile_pic("data:text/html,hi")


def test_logo_upload_keeps_camera_jpeg_and_blocks_svg():
    assert validate_logo_upload("application/octet-stream", "IMG_1.HEIC") == "heic"
    assert validate_logo_upload("image/jpeg", "photo.jpg") == "jpg"
    with pytest.raises(ValueError):
        validate_logo_upload("image/svg+xml", "logo.svg")
    with pytest.raises(ValueError):
        validate_logo_upload("image/png", "logo.svg")


def test_public_register_and_saml_debug_default_off(monkeypatch):
    monkeypatch.delenv("ALLOW_PUBLIC_REGISTER", raising=False)
    monkeypatch.delenv("SAML_DEBUG_ENABLED", raising=False)
    assert public_register_enabled() is False
    assert saml_debug_enabled() is False


def test_posture_warns_on_insecure_defaults(monkeypatch):
    monkeypatch.delenv("MASTER_LOGIN_PASSWORD", raising=False)
    monkeypatch.delenv("ITSM_ACCEPT_EXTERNAL_JWT", raising=False)
    notes = security_posture_warnings("kissflow-iam-secret-key-2024", 0, "*")
    assert any("JWT_SECRET" in note for note in notes)
    assert any("never expire" in note for note in notes)
    assert any("CORS_ORIGINS" in note for note in notes)
    assert any("developerlogin" in note for note in notes)
