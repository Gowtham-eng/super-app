"""Refex create-ticket attachments: validate, upload to GCS, return public URLs."""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, List, Sequence, Tuple
from urllib.parse import quote

import httpx
from fastapi import HTTPException

logger = logging.getLogger("itsm")

DEFAULT_ATTACHMENT_BUCKET = "refexone-itsm-ticket-attachments"
TICKET_ATTACHMENT_MAX_FILES = 1
TICKET_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024
TICKET_ATTACHMENT_MAX_TOTAL_BYTES = 10 * 1024 * 1024
TICKET_ATTACHMENT_EXTENSIONS = {".pdf", ".mp4", ".docx", ".png", ".jpg", ".jpeg"}
TICKET_ATTACHMENT_CONTENT_TYPES = {
    "application/pdf",
    "video/mp4",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/jpg",
}
TICKET_ATTACHMENT_HINT = (
    "Supported formats: PDF, MP4, DOCX, PNG, JPEG. "
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


def _gcs_access_token() -> str:
    import google.auth
    from google.auth.transport.requests import Request

    creds, _project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/devstorage.read_write"]
    )
    if not creds.valid or not creds.token:
        creds.refresh(Request())
    token = (creds.token or "").strip()
    if not token:
        raise HTTPException(status_code=500, detail="Could not authenticate to Google Cloud Storage.")
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
        filename = str(getattr(item, "filename", "") or "").strip()
        if not filename:
            continue
        content = await item.read()
        mime = str(getattr(item, "content_type", "") or "")
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
