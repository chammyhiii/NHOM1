import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path

# Tự động khôi phục cv2 (opencv-python-headless) nếu pip uninstall opencv-python trên Render làm mất thư mục cv2
try:
    import cv2  # noqa: F401
except (ModuleNotFoundError, ImportError):
    import importlib
    import subprocess
    import sys
    for _k in [k for k in list(sys.modules.keys()) if k == "cv2" or k.startswith("cv2.")]:
        sys.modules.pop(_k, None)
    subprocess.check_call([
        sys.executable, "-m", "pip", "install",
        "--force-reinstall", "--no-deps", "--no-cache-dir",
        "opencv-python-headless>=4.8.0.76",
    ])
    importlib.invalidate_caches()
    import cv2  # noqa: F401

try:
    import onnxruntime  # noqa: F401
except (ModuleNotFoundError, ImportError):
    import importlib
    import subprocess
    import sys
    subprocess.check_call([
        sys.executable, "-m", "pip", "install",
        "--no-cache-dir", "onnxruntime>=1.16.0",
    ])
    importlib.invalidate_caches()
    import onnxruntime  # noqa: F401

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import settings
from core.storage import storage
from core.logger import log
from core.emailer import send_email
from core.accounts import accounts
from core import caller
from routes import stream as stream_router
from routes import alerts as alerts_router
from routes import cameras as cameras_router
from routes import health as health_router
from routes import zones as zones_router
from routes import radar as radar_router
from routes import settings as settings_router
from routes import auth as auth_router
from routes import billing as billing_router
from routes import emergency as emergency_router
from ai.pipeline import CameraPipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"=== {settings.app_name} v{settings.app_version} ===")
    log.info(f"Mock mode: {settings.mock_mode} · Mock AI: {settings.mock_ai}")
    log.info(f"Model dir: {settings.model_dir} (exists={settings.model_dir.exists()})")
    log.info(f"Data dir:  {settings.data_dir}")

    async def on_alert(ev: dict):
        alert = storage.create_alert(
            alert_type=ev["type"],
            camera_id=ev["cameraId"],
            camera_name=ev["cameraName"],
            zone=ev["zone"],
            confidence=ev["confidence"],
            note=ev.get("note", ""),
            snapshot_path=ev.get("snapshotPath"),
            ts=ev.get("ts"),
        )
        log.info(
            f"[alert] {alert['id']} · {alert['typeLabel']} · "
            f"{alert['cameraName']} · conf={alert['confidence']:.2f}"
        )

        await stream_router.ws_manager.broadcast({
            "type": "alert",
            "data": alert,
        })

        # ============================================================
        # Kiểm tra xem có nên gửi mail không (theo setting trong config)
        # ============================================================
        should_email = False
        emoji = "⚠️"

        if alert["type"] == "fall" and settings.email_on_fall:
            should_email = True
            emoji = "🚨"
        elif alert["type"] == "stroke" and settings.email_on_stroke:
            should_email = True
            emoji = "⚕️"
        elif alert["type"] == "zone_dwell" and settings.email_on_zone_dwell:
            should_email = True
            emoji = "⚠️"
        elif alert["type"] == "zone_critical" and settings.email_on_zone_critical:
            should_email = True
            emoji = "🚨"

        if should_email:
            subject = f"{emoji} CẢNH BÁO {alert['typeLabel'].upper()} — {alert['cameraName']}"

            time_str = datetime.fromtimestamp(alert["ts"] / 1000).strftime("%H:%M:%S %d/%m/%Y")

            body = f"""
            <h3 style="color:#f43f5e;margin:0 0 12px 0">{emoji} {alert['typeLabel']}</h3>
            <p><b>📍 Vị trí:</b> {alert['cameraName']} — {alert['zone']}</p>
            <p><b>🎯 Độ tin cậy:</b> {alert['confidence']*100:.0f}%</p>
            <p><b>🕐 Thời gian:</b> {time_str}</p>
            <p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;color:#92400e">
              <b>⚠️ Vui lòng kiểm tra ngay!</b>
            </p>
            """

            snapshot = None
            if alert.get("snapshotPath"):
                p = Path(settings.data_dir.parent) / alert["snapshotPath"]
                if p.exists():
                    snapshot = str(p)

            await send_email(subject, body, image_path=snapshot)

        # ============================================================
        # Gọi điện khẩn cấp tự động (chỉ gói Pro / Business)
        # ============================================================
        if alert["type"] in ("fall", "stroke", "zone_critical"):
            contacts = []
            for u in accounts.users_with_feature("emergency_call"):
                contacts.extend(accounts.list_contacts(u["id"]))
            if contacts:
                msg = (
                    f"Cảnh báo khẩn cấp từ VigiCare. Phát hiện {alert['typeLabel']} "
                    f"tại {alert['cameraName']}. Vui lòng kiểm tra ngay."
                )
                asyncio.create_task(caller.call_contacts(contacts, msg, alert_type=alert["type"]))

        return alert

    pipeline = CameraPipeline(
        camera_id="cam-01",
        camera_name="Bờ Bắc · Vách đá dựng đứng",
        zone="Cụm Hồ Chính ĐHQG",
        on_alert=on_alert,
        bus=stream_router.bus,
        camera_index=settings.camera_index,
    )
    await pipeline.start()
    app.state.pipeline = pipeline

    log.info("Application startup complete.")

    yield

    await pipeline.stop()
    log.info("=== shutdown ===")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stream_router.router)
app.include_router(alerts_router.router)
app.include_router(cameras_router.router)
app.include_router(health_router.router)
app.include_router(zones_router.router)
app.include_router(radar_router.router)
app.include_router(settings_router.router)
app.include_router(auth_router.router)
app.include_router(billing_router.router)
app.include_router(emergency_router.router)


@app.get("/health")
async def health():
    pipeline = getattr(app.state, "pipeline", None)
    stats = storage.stats()
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "time": datetime.now().isoformat(),
        "camera_running": bool(pipeline and pipeline._running),
        "camera_on": bool(pipeline and pipeline.is_camera_on()),
        "yolo_model": getattr(pipeline.pose, "model_label", "YOLOv8x-Pose") if pipeline else None,
        "pose_mock": pipeline.pose.is_mock if pipeline else None,
        "ws_clients": len(stream_router.ws_manager.clients),
        "alerts_today": stats["totalToday"],
        "alerts_pending": stats["pending"],
        "email_configured": bool(settings.email_user and settings.email_pass),
    }


@app.get("/api/debug/detections")
async def debug_detections():
    pipeline = getattr(app.state, "pipeline", None)
    if not pipeline:
        return {"error": "no pipeline"}

    dets = pipeline._last_detections or []
    events = pipeline._last_events or []

    return {
        "count": len(dets),
        "camera_on": pipeline.is_camera_on(),
        "detections": [
            {
                "bbox": [round(x, 1) for x in d["bbox"]],
                "score": round(d["score"], 3),
                "posture": d.get("posture", "normal"),
                "keypoints_count": len(d["keypoints"]) if d.get("keypoints") else 0,
            }
            for d in dets
        ],
        "events": events,
    }


@app.get("/api/debug/tracks")
async def debug_tracks():
    """Xem trạng thái track hiện tại của AI — dùng để debug fall detection."""
    pipeline = getattr(app.state, "pipeline", None)
    if not pipeline:
        return {"error": "no pipeline"}

    behavior = pipeline.behavior
    out = []
    for tid, hist in behavior.histories.items():
        if len(hist) < 2:
            continue
        recent = list(hist)
        old = recent[0]
        cur = recent[-1]
        old_ar = old.get("aspect_ratio", old.get("ar", 0.0))
        cur_ar = cur.get("aspect_ratio", cur.get("ar", 0.0))
        out.append({
            "track_id": tid,
            "history_len": len(recent),
            "is_lying": cur.get("is_lying", False),
            "torso_angle": round(cur.get("torso_angle", 90.0), 1),
            "old_ar": round(old_ar, 3),
            "cur_ar": round(cur_ar, 3),
            "old_bh": round(old["bh"], 1),
            "cur_bh": round(cur["bh"], 1),
            "cy_drop": round((cur["cy"] - old["cy"]) / 720, 3),
            "old_bh_ratio": round(old["bh"] / 720, 3),
            "cur_bh_ratio": round(cur["bh"] / 720, 3),
        })
    return {"tracks": out, "count": len(out)}


if settings.frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(settings.frontend_dir), html=True), name="ui")
    log.info(f"[static] Serving frontend from {settings.frontend_dir}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level="info",
    )
