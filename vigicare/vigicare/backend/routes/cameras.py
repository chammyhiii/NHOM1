from fastapi import APIRouter, Depends, HTTPException, Request

from core.auth import optional_user, plan_of

router = APIRouter(prefix="/api/cameras", tags=["cameras"])


_CAMERAS = [
    {"id": "cam-01", "name": "Bờ Bắc · Vách đá dựng đứng", "zone": "Cụm Hồ Chính ĐHQG",   "online": True,  "fps": 30, "target": True},
    {"id": "cam-02", "name": "Bờ Đông · Đường Nguyễn Du",  "zone": "Ven đường Nguyễn Du", "online": True,  "fps": 28, "target": True},
    {"id": "cam-03", "name": "Mỏm đá Tử thần · Bờ Tây",   "zone": "Vách đá sâu >30m",    "online": True,  "fps": 30, "target": True},
    {"id": "cam-04", "name": "Lối mòn Hàng rào Khu A",     "zone": "Giáp KTX Khu A",      "online": False, "fps": 0,  "target": False},
    {"id": "cam-05", "name": "Bờ Nam · Giáp Viện CNSH",    "zone": "Đường Marie Curie",   "online": True,  "fps": 25, "target": False},
    {"id": "cam-06", "name": "Chốt Bảo vệ Ống Nước Thô",   "zone": "Cổng tuần tra Tây Nam", "online": True, "fps": 30, "target": True},
]


@router.get("")
async def list_cameras(user: dict | None = Depends(optional_user)):
    limit = plan_of(user)["max_cameras"]
    items = [
        {**c, "locked": limit is not None and i >= limit}
        for i, c in enumerate(_CAMERAS)
    ]
    return {"items": items, "maxCameras": limit}


@router.get("/{camera_id}")
async def get_camera(camera_id: str):
    for c in _CAMERAS:
        if c["id"] == camera_id:
            return c
    raise HTTPException(404, "Không tìm thấy camera")


# ============================================================
# Camera toggle (bật/tắt pipeline chính)
# ============================================================

@router.get("/control/status")
async def camera_status(request: Request):
    pipeline = getattr(request.app.state, "pipeline", None)
    if not pipeline:
        raise HTTPException(500, "Pipeline chưa khởi động")
    return {
        "camera_on": pipeline.is_camera_on(),
        "camera_id": pipeline.camera_id,
        "camera_name": pipeline.camera_name,
    }


@router.post("/control/on")
async def camera_on(request: Request):
    pipeline = getattr(request.app.state, "pipeline", None)
    if not pipeline:
        raise HTTPException(500, "Pipeline chưa khởi động")
    await pipeline.enable_camera()
    return {"camera_on": True}


@router.post("/control/off")
async def camera_off(request: Request):
    pipeline = getattr(request.app.state, "pipeline", None)
    if not pipeline:
        raise HTTPException(500, "Pipeline chưa khởi động")
    await pipeline.disable_camera()
    return {"camera_on": False}


@router.post("/control/toggle")
async def camera_toggle(request: Request):
    pipeline = getattr(request.app.state, "pipeline", None)
    if not pipeline:
        raise HTTPException(500, "Pipeline chưa khởi động")
    if pipeline.is_camera_on():
        await pipeline.disable_camera()
        return {"camera_on": False}
    else:
        await pipeline.enable_camera()
        return {"camera_on": True}