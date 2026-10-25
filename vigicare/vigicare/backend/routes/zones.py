"""
SafeZone-HD — routes/zones.py
REST API CRUD cho vùng cấm (zones)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from core.storage import storage
from core.logger import log


router = APIRouter(prefix="/api/zones", tags=["zones"])


# ============================================================
# SCHEMAS
# ============================================================

class ZoneBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    cameraId: str = "cam-01"
    polygon: list[list[float]] = Field(default_factory=list)
    severity: str = "high"
    maxDwellSeconds: int = 30
    enabled: bool = True


class ZoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    polygon: Optional[list[list[float]]] = None
    severity: Optional[str] = None
    maxDwellSeconds: Optional[int] = None
    enabled: Optional[bool] = None


VALID_SEVERITIES = {"low", "medium", "high", "critical"}


# ============================================================
# ROUTES
# ============================================================

@router.post("")
async def create_zone(body: ZoneBody):
    """Tạo vùng cấm mới."""
    if len(body.polygon) < 3:
        raise HTTPException(400, "Polygon phải có ít nhất 3 điểm")
    if body.severity not in VALID_SEVERITIES:
        raise HTTPException(400, f"severity phải là: {VALID_SEVERITIES}")
    if body.maxDwellSeconds < 1 or body.maxDwellSeconds > 3600:
        raise HTTPException(400, "maxDwellSeconds phải từ 1 đến 3600")

    zone = storage.create_zone(body.model_dump())
    log.info(f"[zones] Created {zone['id']} — {zone['name']} ({len(body.polygon)} điểm)")
    return zone


@router.get("")
async def list_zones(enabled_only: bool = Query(False)):
    """Danh sách vùng cấm."""
    items = storage.list_zones(enabled_only=enabled_only)
    return {"items": items, "total": len(items)}


@router.get("/stats")
async def zone_stats():
    """Thống kê tổng hợp."""
    return storage.zone_stats()


@router.get("/{zone_id}")
async def get_zone(zone_id: str):
    """Chi tiết 1 vùng."""
    zone = storage.get_zone(zone_id)
    if not zone:
        raise HTTPException(404, f"Không tìm thấy vùng {zone_id}")
    return zone


@router.patch("/{zone_id}")
async def update_zone(zone_id: str, body: ZoneUpdate):
    """Cập nhật vùng."""
    data = body.model_dump(exclude_none=True)

    if "severity" in data and data["severity"] not in VALID_SEVERITIES:
        raise HTTPException(400, f"severity phải là: {VALID_SEVERITIES}")
    if "polygon" in data and len(data["polygon"]) < 3:
        raise HTTPException(400, "Polygon phải có ít nhất 3 điểm")

    updated = storage.update_zone(zone_id, data)
    if not updated:
        raise HTTPException(404, f"Không tìm thấy vùng {zone_id}")

    log.info(f"[zones] Updated {zone_id}")
    return updated


@router.delete("/{zone_id}")
async def delete_zone(zone_id: str):
    """Xóa vùng."""
    ok = storage.delete_zone(zone_id)
    if not ok:
        raise HTTPException(404, f"Không tìm thấy vùng {zone_id}")
    log.info(f"[zones] Deleted {zone_id}")
    return {"deleted": True, "id": zone_id}


@router.get("/{zone_id}/events")
async def get_zone_events(
    zone_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Lịch sử xâm nhập của vùng."""
    zone = storage.get_zone(zone_id)
    if not zone:
        raise HTTPException(404, f"Không tìm thấy vùng {zone_id}")

    items = storage.list_zone_events(limit=limit, offset=offset, zone_id=zone_id)
    return {"items": items, "total": len(items)}