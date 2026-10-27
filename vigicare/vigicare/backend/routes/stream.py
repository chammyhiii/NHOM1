import asyncio
import json
import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse

from ai.pipeline import FrameBus


router = APIRouter(tags=["stream"])


class WSManager:
    def __init__(self):
        self.clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self.clients.add(ws)
        print(f"[ws] client connected · total={len(self.clients)}")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self.clients.discard(ws)
        print(f"[ws] client disconnected · total={len(self.clients)}")

    async def broadcast(self, payload: dict):
        if not self.clients:
            return
        msg = json.dumps(payload, ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.disconnect(ws)


ws_manager = WSManager()
bus = FrameBus()


def mjpeg_response():
    boundary = "frame"

    async def gen():
        while True:
            frame = await bus.wait_frame(timeout=1.0)
            if frame is None:
                await asyncio.sleep(0.05)
                continue
            yield (
                b"--" + boundary.encode() + b"\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                + frame + b"\r\n"
            )

    return StreamingResponse(
        gen(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Connection": "close",
        },
    )


@router.get("/stream")
async def stream():
    return mjpeg_response()


@router.get("/video_feed")
async def video_feed_alias():
    return mjpeg_response()


@router.post("/api/stream/upload_frame")
@router.post("/stream/upload_frame")
async def upload_frame(request: Request):
    """Nhận frame JPEG từ webcam phía trình duyệt để AI xử lý khi không có camera trực tiếp trên server."""
    pipeline = getattr(request.app.state, "pipeline", None)
    if not pipeline:
        return {"ok": False, "error": "no pipeline"}

    body = await request.body()
    if not body:
        return {"ok": False, "error": "empty body"}

    nparr = np.frombuffer(body, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is not None:
        client_id = (
            request.headers.get("X-Client-Id")
            or (f"{request.client.host}:{request.client.port}" if request.client else "anon")
        )
        res = await pipeline.process_client_frame(img, client_id=client_id)
        h_f, w_f = img.shape[:2]
        return {
            "ok": True,
            "model": getattr(pipeline.pose, "model_label", "YOLOv8x-Pose"),
            "detections": res.get("detections", []),
            "events": res.get("events", []),
            "zones": getattr(pipeline.zone_monitor, "zones", []) if hasattr(pipeline, "zone_monitor") else [],
            "alerts": res.get("alerts", []),
            "frame_w": w_f,
            "frame_h": h_f,
        }
    return {"ok": False, "error": "decode failed"}


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                if data == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type": "heartbeat"}))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[ws] error: {e}")
    finally:
        await ws_manager.disconnect(ws)
