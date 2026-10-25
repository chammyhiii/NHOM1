"""
SafeZone-HD — routes/settings.py
API đọc/ghi cấu hình email triggers
"""
from fastapi import APIRouter
from pydantic import BaseModel

from core.config import settings
from core.logger import log


router = APIRouter(prefix="/api/settings", tags=["settings"])


# ============================================================
# SCHEMAS
# ============================================================

class EmailSettings(BaseModel):
    email_on_fall: bool
    email_on_stroke: bool
    email_on_zone_dwell: bool
    email_on_zone_critical: bool


# ============================================================
# ROUTES
# ============================================================

@router.get("/email")
async def get_email_settings():
    """Lấy cấu hình gửi mail hiện tại."""
    return {
        "email_on_fall": settings.email_on_fall,
        "email_on_stroke": settings.email_on_stroke,
        "email_on_zone_dwell": settings.email_on_zone_dwell,
        "email_on_zone_critical": settings.email_on_zone_critical,
    }


@router.patch("/email")
async def update_email_settings(body: EmailSettings):
    """Cập nhật cấu hình gửi mail (chỉ trong runtime, không lưu file .env)."""
    settings.email_on_fall = body.email_on_fall
    settings.email_on_stroke = body.email_on_stroke
    settings.email_on_zone_dwell = body.email_on_zone_dwell
    settings.email_on_zone_critical = body.email_on_zone_critical

    log.info(
        f"[settings] Email updated: fall={body.email_on_fall}, "
        f"stroke={body.email_on_stroke}, "
        f"zone_dwell={body.email_on_zone_dwell}, "
        f"zone_critical={body.email_on_zone_critical}"
    )

    return {
        "email_on_fall": settings.email_on_fall,
        "email_on_stroke": settings.email_on_stroke,
        "email_on_zone_dwell": settings.email_on_zone_dwell,
        "email_on_zone_critical": settings.email_on_zone_critical,
    }