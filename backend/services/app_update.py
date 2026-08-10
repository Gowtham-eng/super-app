"""
RefexOne native app update control.
Stores global config in MongoDB collection `app_update_config`.
"""
from datetime import datetime, timezone
from typing import Any, Optional

CONFIG_ID = "global"

DEFAULT_PLATFORM = {
    "min_build": 1,
    "latest_build": 1,
    "store_url": "",
    "force_title": "Update required",
    "force_message": "A new version of RefexOne is required to continue. Please update from the store.",
    "optional_title": "Update available",
    "optional_message": "A new version of RefexOne is available. Update now for the latest features and fixes.",
}

DEFAULT_CONFIG = {
    "id": CONFIG_ID,
    "enabled": False,
    "android": {
        **DEFAULT_PLATFORM,
        "store_url": "https://play.google.com/store/apps/details?id=com.refex.refexone",
    },
    "ios": {
        **DEFAULT_PLATFORM,
        "store_url": "https://apps.apple.com/",
    },
    "updated_at": None,
}


def _to_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return fallback


def _normalize_platform(data: Optional[dict], defaults: dict) -> dict:
    src = data or {}
    out = {**defaults, **{k: v for k, v in src.items() if v is not None}}
    out["min_build"] = max(1, _to_int(out.get("min_build"), 1))
    out["latest_build"] = max(out["min_build"], _to_int(out.get("latest_build"), out["min_build"]))
    out["store_url"] = (out.get("store_url") or defaults.get("store_url") or "").strip()
    for key in ("force_title", "force_message", "optional_title", "optional_message"):
        out[key] = (out.get(key) or defaults.get(key) or "").strip()
    return out


def normalize_config(doc: Optional[dict]) -> dict:
    base = {**DEFAULT_CONFIG, **(doc or {})}
    base["id"] = CONFIG_ID
    base["enabled"] = bool(base.get("enabled"))
    base["android"] = _normalize_platform(base.get("android"), DEFAULT_CONFIG["android"])
    base["ios"] = _normalize_platform(base.get("ios"), DEFAULT_CONFIG["ios"])
    return base


async def get_app_update_config(db) -> dict:
    doc = await db.app_update_config.find_one({"id": CONFIG_ID}, {"_id": 0})
    return normalize_config(doc)


async def save_app_update_config(db, payload: dict) -> dict:
    current = await get_app_update_config(db)
    merged = normalize_config({
        **current,
        "enabled": payload.get("enabled", current["enabled"]),
        "android": {**current["android"], **(payload.get("android") or {})},
        "ios": {**current["ios"], **(payload.get("ios") or {})},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.app_update_config.update_one(
        {"id": CONFIG_ID},
        {"$set": merged},
        upsert=True,
    )
    return merged


def evaluate_update(config: dict, platform: str, build: Any) -> dict:
    """
    Public check response used by iOS/Android native shells.
    """
    cfg = normalize_config(config)
    platform_key = "ios" if str(platform).lower().startswith("ios") else "android"
    plat = cfg.get(platform_key) or DEFAULT_CONFIG[platform_key]
    current_build = _to_int(build, 0)

    if not cfg.get("enabled"):
        return {
            "enabled": False,
            "platform": platform_key,
            "current_build": current_build,
            "update_available": False,
            "force_update": False,
        }

    min_build = _to_int(plat.get("min_build"), 1)
    latest_build = _to_int(plat.get("latest_build"), min_build)
    force = current_build < min_build
    soft = (not force) and current_build < latest_build
    update_available = force or soft

    title = plat.get("force_title") if force else plat.get("optional_title")
    message = plat.get("force_message") if force else plat.get("optional_message")

    return {
        "enabled": True,
        "platform": platform_key,
        "current_build": current_build,
        "min_build": min_build,
        "latest_build": latest_build,
        "update_available": update_available,
        "force_update": force,
        "title": title,
        "message": message,
        "store_url": plat.get("store_url") or "",
    }
