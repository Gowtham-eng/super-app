"""Refex create-ticket attachments: validate, upload to GCS, return public URLs."""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.parse import quote

import httpx
from fastapi import HTTPException

logger = logging.getLogger("itsm")

DEFAULT_ATTACHMENT_BUCKET = "refexone-itsm-ticket-attachments"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_GCS_CREDENTIALS_FILE = os.path.join(
    _BACKEND_DIR, "secrets", "gcs-itsm-attachments.json"
)
_ENV_RUNTIME_FILE = os.path.join(_BACKEND_DIR, ".itsm-env-runtime.json")
_GCS_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write"
_SA_INFO: Optional[dict] = None
TICKET_ATTACHMENT_MAX_FILES = 1
TICKET_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024
TICKET_ATTACHMENT_MAX_TOTAL_BYTES = 10 * 1024 * 1024
TICKET_ATTACHMENT_EXTENSIONS = {
    ".pdf", ".mp4", ".docx", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif",
}
TICKET_ATTACHMENT_CONTENT_TYPES = {
    "application/pdf",
    "video/mp4",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
}
MIME_TO_EXTENSION = {
    "application/pdf": ".pdf",
    "video/mp4": ".mp4",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heic",
}
TICKET_ATTACHMENT_HINT = (
    "Supported formats: PDF, MP4, DOCX, PNG, JPEG, HEIC, WEBP. "
    "One file only, up to 10 MB."
)


def attachment_bucket_name() -> str:
    return (
        os.environ.get("ITSM_ATTACHMENT_BUCKET", "").strip()
        or DEFAULT_ATTACHMENT_BUCKET
    )


def public_attachment_url(bucket: str, object_key: str) -> str:
    return f"https://storage.googleapis.com/{bucket}/{quote(object_key, safe='/')}"


def _file_extension(name: str) -> str:
    match = re.search(r"(\.[A-Za-z0-9]+)$", (name or "").strip())
    return (match.group(1) if match else "").lower()


def resolve_upload_filename(filename: str, content_type: str = "") -> str:
    """iOS / camera picks often omit an extension or send image/heic."""
    name = (filename or "").strip() or "image"
    ext = _file_extension(name)
    if ext:
        return name
    mime = (content_type or "").split(";")[0].strip().lower()
    guessed = MIME_TO_EXTENSION.get(mime)
    if guessed:
        return f"{name}{guessed}"
    return name


def _safe_file_name(name: str) -> str:
    cleaned = re.sub(r"[\\/]+", "_", (name or "file").strip())
    cleaned = re.sub(r"[^\w.\- ()]+", "_", cleaned)
    return cleaned[:180] or "file"


def build_object_key(filename: str) -> str:
    now = datetime.now(timezone.utc)
    return (
        f"tickets/{now.strftime('%Y/%m')}/"
        f"{uuid.uuid4().hex[:12]}-{_safe_file_name(filename)}"
    )


def normalize_attachment_urls(raw: Any) -> List[str]:
    """Accept a list, a JSON-looking string, or a single URL."""
    if raw is None:
        return []
    values: List[Any]
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                import json

                parsed = json.loads(text)
            except Exception:
                parsed = [text]
            values = parsed if isinstance(parsed, list) else [text]
        else:
            values = [part.strip() for part in text.split(",") if part.strip()]
    elif isinstance(raw, (list, tuple)):
        values = list(raw)
    else:
        values = [raw]
    out: List[str] = []
    seen = set()
    for item in values:
        url = str(item or "").strip()
        if not url or url in seen:
            continue
        if not re.match(r"^https?://", url, re.I):
            raise HTTPException(status_code=400, detail="Attachment URLs must start with http:// or https://.")
        seen.add(url)
        out.append(url)
    if len(out) > TICKET_ATTACHMENT_MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Only one attachment is allowed. {TICKET_ATTACHMENT_HINT}",
        )
    return out


def validate_ticket_attachment_file(
    *,
    filename: str,
    size: int,
    content_type: str = "",
) -> None:
    if size <= 0:
        raise HTTPException(status_code=400, detail="Attachment file is empty.")
    if size > TICKET_ATTACHMENT_MAX_FILE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File must be 10 MB or smaller. {TICKET_ATTACHMENT_HINT}",
        )
    ext = _file_extension(filename)
    mime = (content_type or "").split(";")[0].strip().lower()
    if ext not in TICKET_ATTACHMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type is not allowed: {filename or 'file'}. {TICKET_ATTACHMENT_HINT}",
        )
    if mime and mime not in TICKET_ATTACHMENT_CONTENT_TYPES and mime != "application/octet-stream":
        raise HTTPException(
            status_code=400,
            detail=f"File type is not allowed: {filename or 'file'}. {TICKET_ATTACHMENT_HINT}",
        )


def validate_ticket_attachment_batch(files: Sequence[Tuple[str, int, str]]) -> None:
    if len(files) > TICKET_ATTACHMENT_MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Only one attachment is allowed. {TICKET_ATTACHMENT_HINT}",
        )
    total = 0
    for filename, size, content_type in files:
        validate_ticket_attachment_file(filename=filename, size=size, content_type=content_type)
        total += max(int(size or 0), 0)
    if total > TICKET_ATTACHMENT_MAX_TOTAL_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File must be 10 MB or smaller. {TICKET_ATTACHMENT_HINT}",
        )


def _resolve_credentials_file(candidate: str) -> str:
    path = (candidate or "").strip()
    if not path:
        return ""
    if not os.path.isabs(path):
        path = os.path.normpath(os.path.join(_BACKEND_DIR, path))
    return path


def gcs_credentials_path() -> str:
    """Permanent service-account JSON only. Never fall back to user ADC."""
    explicit = os.environ.get("ITSM_GCS_CREDENTIALS_FILE", "").strip()
    if explicit:
        path = _resolve_credentials_file(explicit)
        return path if os.path.isfile(path) else ""
    if os.path.isfile(DEFAULT_GCS_CREDENTIALS_FILE):
        return DEFAULT_GCS_CREDENTIALS_FILE
    return ""


def _normalized_sa_info(info: Any) -> Optional[dict]:
    if not isinstance(info, Mapping):
        return None
    email = str(info.get("client_email") or "").strip()
    key = str(info.get("private_key") or "").strip()
    if str(info.get("type") or "").strip() != "service_account" or not email or not key:
        return None
    return dict(info)


def parse_gcs_service_account_json(raw: Any) -> dict:
    if isinstance(raw, bytes):
        text = raw.decode("utf-8")
    else:
        text = str(raw or "")
    try:
        data = json.loads(text)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Upload the Google Cloud service-account JSON key.",
        ) from exc
    info = _normalized_sa_info(data)
    if not info:
        raise HTTPException(
            status_code=400,
            detail="That file is not a Google Cloud service-account JSON key.",
        )
    return info


def set_gcs_service_account_info(info: Any) -> Optional[dict]:
    global _SA_INFO
    _SA_INFO = _normalized_sa_info(info)
    return _SA_INFO


def public_gcs_credentials_status(
    info: Any = None,
    filename: str = "",
) -> dict:
    sa = _normalized_sa_info(info) or gcs_service_account_info()
    email = str((sa or {}).get("client_email") or "").strip()
    return {
        "gcs_credentials_configured": bool(sa),
        "gcs_credentials_email": email,
        "gcs_credentials_filename": (filename or "").strip(),
    }


def persist_gcs_credentials_file(info: Mapping[str, Any]) -> str:
    sa = _normalized_sa_info(info)
    if not sa:
        return ""
    folder = os.path.dirname(DEFAULT_GCS_CREDENTIALS_FILE)
    try:
        os.makedirs(folder, mode=0o700, exist_ok=True)
        with open(DEFAULT_GCS_CREDENTIALS_FILE, "w", encoding="utf-8") as handle:
            json.dump(sa, handle, indent=2)
        os.chmod(DEFAULT_GCS_CREDENTIALS_FILE, 0o600)
        return DEFAULT_GCS_CREDENTIALS_FILE
    except Exception as exc:
        logger.warning("ITSM GCS credentials file write skipped: %s", exc)
        return ""


def _info_from_credentials_file() -> Optional[dict]:
    path = gcs_credentials_path()
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return _normalized_sa_info(json.load(handle))
    except Exception:
        return None


def _info_from_runtime_file() -> Optional[dict]:
    try:
        if not os.path.isfile(_ENV_RUNTIME_FILE):
            return None
        with open(_ENV_RUNTIME_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        shared = data.get("shared") if isinstance(data, dict) else {}
        if not isinstance(shared, dict):
            return None
        return _normalized_sa_info(shared.get("gcs_service_account"))
    except Exception:
        return None


def gcs_service_account_info() -> Optional[dict]:
    return _SA_INFO or _info_from_runtime_file() or _info_from_credentials_file()


def _gcs_access_token() -> str:
    """Mint a short-lived GCS token from ITSM Setup / the gitignored JSON key."""
    info = gcs_service_account_info()
    path = "" if info else gcs_credentials_path()
    if not info and not path:
        logger.error(
            "ITSM ticket attachment GCS credentials missing. "
            "Upload the service-account JSON in ITSM Setup or place it at %s.",
            DEFAULT_GCS_CREDENTIALS_FILE,
        )
        raise HTTPException(
            status_code=502,
            detail="Could not authenticate to Google Cloud Storage.",
        )
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        if info:
            creds = service_account.Credentials.from_service_account_info(
                info,
                scopes=[_GCS_SCOPE],
            )
        else:
            creds = service_account.Credentials.from_service_account_file(
                path,
                scopes=[_GCS_SCOPE],
            )
        creds.refresh(Request())
        token = (creds.token or "").strip()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ITSM ticket attachment GCS auth failed")
        raise HTTPException(status_code=502, detail="Could not authenticate to Google Cloud Storage.") from exc
    if not token:
        raise HTTPException(status_code=502, detail="Could not authenticate to Google Cloud Storage.")
    return token


async def upload_ticket_attachment_bytes(
    *,
    filename: str,
    content: bytes,
    content_type: str = "",
) -> str:
    size = len(content or b"")
    validate_ticket_attachment_file(
        filename=filename,
        size=size,
        content_type=content_type,
    )
    bucket = attachment_bucket_name()
    object_key = build_object_key(filename)
    token = _gcs_access_token()
    mime = (content_type or "").split(";")[0].strip() or "application/octet-stream"
    upload_url = f"https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o"
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                upload_url,
                params={"uploadType": "media", "name": object_key},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": mime,
                },
                content=content,
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("ITSM ticket attachment upload failed")
        raise HTTPException(status_code=502, detail="Could not upload the attachment.") from exc
    if response.status_code >= 400:
        logger.error(
            "ITSM ticket attachment GCS %s -> %s %s",
            object_key,
            response.status_code,
            (response.text or "")[:300],
        )
        raise HTTPException(status_code=502, detail="Could not upload the attachment.")
    return public_attachment_url(bucket, object_key)


async def upload_ticket_attachment_files(uploads: Iterable[Any]) -> List[str]:
    prepared: List[Tuple[str, bytes, str]] = []
    for item in uploads or []:
        raw_name = str(getattr(item, "filename", "") or "").strip()
        mime = str(getattr(item, "content_type", "") or "")
        filename = resolve_upload_filename(raw_name, mime)
        content = await item.read()
        if not content and not raw_name:
            continue
        prepared.append((filename, content or b"", mime))
    if not prepared:
        return []
    validate_ticket_attachment_batch(
        [(name, len(body), mime) for name, body, mime in prepared]
    )
    urls: List[str] = []
    for filename, content, mime in prepared:
        urls.append(
            await upload_ticket_attachment_bytes(
                filename=filename,
                content=content,
                content_type=mime,
            )
        )
    return urls
