from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path

from core.config import settings
from core.storage import storage


router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class StatusUpdate(BaseModel):
    status: str


@router.get("")
async def list_alerts(
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    type: str | None = None,
    camera: str | None = None,
    status: str | None = None,
):
    items = storage.list_alerts(
        limit=limit, offset=offset,
        alert_type=type, camera_id=camera, status=status,
    )
    return {"items": items, "total": len(items)}


@router.get("/stats")
async def stats():
    return storage.stats()


@router.get("/{alert_id}")
async def get_alert(alert_id: str):
    alert = storage.get_alert(alert_id)
    if not alert:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return alert


@router.patch("/{alert_id}")
async def update_alert(alert_id: str, body: StatusUpdate):
    if body.status not in ("pending", "processing", "resolved", "dismissed"):
        raise HTTPException(400, "Trạng thái không hợp lệ")
    updated = storage.update_status(alert_id, body.status)
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


@router.post("/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    updated = storage.update_status(alert_id, "resolved")
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


@router.post("/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str):
    updated = storage.update_status(alert_id, "dismissed")
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


@router.delete("")
async def clear_alerts():
    n = storage.delete_all()
    return {"deleted": n}


@router.get("/{alert_id}/snapshot")
async def get_snapshot(alert_id: str):
    alert = storage.get_alert(alert_id)
    if not alert or not alert.get("snapshotPath"):
        raise HTTPException(404, "Không có snapshot")
    p = Path(settings.data_dir.parent) / alert["snapshotPath"]
    if not p.exists():
        raise HTTPException(404, "File không tồn tại")
    return FileResponse(p, media_type="image/jpeg")
@router.post("/test-email")
async def test_email():
    """Route test — gửi 1 email thử để kiểm tra cấu hình."""
    from core.emailer import send_email
    from datetime import datetime

    subject = "🛡️ VigiCare — Email thử nghiệm"
    body = f"""
    <h3 style="color:#10b981">✅ Cấu hình email thành công!</h3>
    <p>Nếu bạn nhận được email này, hệ thống VigiCare đã sẵn sàng gửi cảnh báo.</p>
    <p><b>🕐 Thời gian test:</b> {datetime.now().strftime('%H:%M:%S %d/%m/%Y')}</p>
    """
    ok = await send_email(subject, body)
    return {"sent": ok}