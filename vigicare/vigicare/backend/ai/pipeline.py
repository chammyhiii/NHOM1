import asyncio
import time
from pathlib import Path
from typing import Callable, Awaitable

import cv2
import numpy as np

from core.config import settings
from core.logger import log
from .pose import PoseEstimator
from .tracker import ByteTracker
from .behavior import BehaviorAnalyzer
from .state_machine import FallStateMachine
from .zone_monitor import ZoneMonitor


SKELETON = [
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
    (5, 11), (6, 12), (11, 12),
    (11, 13), (13, 15), (12, 14), (14, 16),
    (0, 1), (0, 2), (1, 3), (2, 4),
]
KP_COLORS = [
    (0, 0, 255), (0, 100, 255), (0, 200, 255),
    (0, 255, 255), (100, 255, 0), (200, 255, 0),
    (255, 200, 0), (255, 100, 0), (255, 0, 0),
    (255, 0, 100), (255, 0, 200), (255, 0, 255),
    (200, 0, 255), (100, 0, 255), (0, 0, 255),
    (0, 100, 200), (0, 200, 100),
]


class FrameBus:
    def __init__(self, maxsize: int = 2):
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._latest: bytes | None = None
        self._lock = asyncio.Lock()

    async def publish(self, jpeg_bytes: bytes):
        async with self._lock:
            self._latest = jpeg_bytes
        try:
            self._queue.put_nowait(jpeg_bytes)
        except asyncio.QueueFull:
            try:
                self._queue.get_nowait()
                self._queue.put_nowait(jpeg_bytes)
            except Exception:
                pass

    async def wait_frame(self, timeout: float = 2.0) -> bytes | None:
        try:
            return await asyncio.wait_for(self._queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            async with self._lock:
                return self._latest

    def latest(self) -> bytes | None:
        return self._latest


class _ClientAISession:
    """Bộ trạng thái AI độc lập (Private) cho từng trình duyệt / thiết bị kết nối."""

    def __init__(self, model_dir: Path, use_mock: bool, cooldown_seconds: int):
        self.tracker = ByteTracker()
        behavior_model = model_dir / "behavior_transformer.onnx"
        self.behavior = BehaviorAnalyzer(
            str(behavior_model) if (behavior_model.exists() and not use_mock) else None
        )
        self.state = FallStateMachine(cooldown_seconds=cooldown_seconds)
        self.last_alert_ts: dict[str, float] = {}
        self.last_detections: list[dict] = []
        self.last_events: list[dict] = []
        self.last_seen: float = time.time()


class CameraPipeline:
    def __init__(
        self,
        camera_id: str,
        camera_name: str,
        zone: str,
        on_alert: Callable[[dict], Awaitable[None]],
        bus: FrameBus,
        camera_index: int = 0,
    ):
        self.camera_id = camera_id
        self.camera_name = camera_name
        self.zone = zone
        self.on_alert = on_alert
        self.bus = bus
        self.camera_index = camera_index

        use_mock = settings.mock_ai
        self._use_mock = use_mock

        if use_mock:
            self.pose = PoseEstimator("")
        else:
            yolo_target = getattr(settings, "yolo_model", "yolov8x-pose.pt")
            self.pose = PoseEstimator(yolo_target)

        self.tracker = ByteTracker()

        behavior_model = settings.model_dir / "behavior_transformer.onnx"
        self.behavior = BehaviorAnalyzer(
            str(behavior_model) if (behavior_model.exists() and not use_mock) else None
        )

        self.state = FallStateMachine(cooldown_seconds=settings.alert_cooldown)
        self.zone_monitor = ZoneMonitor()

        self._running = False
        self._task: asyncio.Task | None = None
        self._current_frame: np.ndarray | None = None
        self._is_synthetic_frame: bool = True
        self._infer_lock = asyncio.Lock()
        self._last_detections: list[dict] = []
        self._last_events: list[dict] = []
        self._last_alert_ts: dict[str, float] = {}
        self._camera_on = True

        # Lưu trữ phiên AI riêng biệt (Private) theo từng client_id, tuyệt đối không chia sẻ hình ảnh giữa các máy
        self._client_sessions: dict[str, _ClientAISession] = {}

    def _get_client_session(self, client_id: str) -> _ClientAISession:
        now = time.time()
        # Dọn các phiên không hoạt động quá 90 giây
        stale = [cid for cid, sess in self._client_sessions.items() if now - sess.last_seen > 90.0]
        for cid in stale:
            self._client_sessions.pop(cid, None)

        sess = self._client_sessions.get(client_id)
        if sess is None:
            sess = _ClientAISession(
                model_dir=settings.model_dir,
                use_mock=self._use_mock,
                cooldown_seconds=settings.alert_cooldown,
            )
            self._client_sessions[client_id] = sess
        sess.last_seen = now
        return sess

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        log.info(
            f"[pipeline] {self.camera_id} started (private client camera mode) · "
            f"model={self.pose.model_label} · pose_mock={self.pose.is_mock}"
        )

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        log.info(f"[pipeline] {self.camera_id} stopped")

    # ============================================================
    # Camera toggle & Private Client Frame Processing
    # ============================================================

    async def enable_camera(self):
        self._camera_on = True
        return True

    async def disable_camera(self):
        self._camera_on = False
        return True

    def is_camera_on(self) -> bool:
        return self._camera_on

    async def process_client_frame(
        self,
        frame_bgr: np.ndarray,
        client_id: str = "default",
    ) -> dict:
        """
        Xử lý frame webcam RIÊNG TƯ (Private) của đúng thiết bị gửi lên:
        - KHÔNG lưu frame vào luồng chung `_current_frame` hay `FrameBus` (/stream).
        - KHÔNG phát tán (broadcast) hình ảnh hay khung xương sang máy tính khác.
        - Mỗi `client_id` có bộ Tracker & StateMachine riêng.
        """
        sess = self._get_client_session(client_id)
        loop = asyncio.get_event_loop()
        created_alerts: list[dict] = []

        try:
            async with self._infer_lock:
                detections = await loop.run_in_executor(None, self.pose.infer, frame_bgr)

            tracks = sess.tracker.update(detections)
            for tr in tracks:
                tr.rotated = any(d.get("rotated") and d["bbox"] == tr.bbox for d in detections)

            fall_events = sess.behavior.analyze(tracks, frame_bgr.shape)

            postures = [getattr(tr, "posture", "normal") for tr in tracks]
            sess.state.on_frame_postures(postures)
            if sess.state._normal_streak >= 4:
                sess.last_alert_ts.pop("fall", None)
                sess.last_alert_ts.pop("stroke", None)

            for det in detections:
                det["posture"] = "normal"
                for tr in tracks:
                    if tr.bbox == det["bbox"]:
                        det["posture"] = getattr(tr, "posture", "normal")
                        det["track_id"] = tr.id
                        break

            sess.last_detections = detections

            zone_events = []
            try:
                zone_events = self.zone_monitor.check(tracks, frame_bgr.shape)
            except Exception as ze:
                log.error(f"[zone_monitor] error: {ze}", exc_info=True)

            events = fall_events + zone_events
            sess.last_events = events

            now_ts = time.time()
            for ev in events:
                ev_type = ev.get("type", "")
                if ev_type.startswith("zone_"):
                    should_fire = True
                else:
                    should_fire = sess.state.should_fire(ev)

                if not should_fire:
                    continue

                COOLDOWN = {
                    "fall": 12,
                    "stroke": 12,
                    "abnormal": 20,
                    "inactive": 60,
                    "zone_enter": 60,
                    "zone_dwell": 45,
                    "zone_critical": 30,
                    "zone_exit": 30,
                }.get(ev_type, 15)

                last = sess.last_alert_ts.get(ev_type, 0)
                if now_ts - last < COOLDOWN:
                    continue
                sess.last_alert_ts[ev_type] = now_ts

                alert_payload = {
                    "type": ev["type"],
                    "cameraId": self.camera_id,
                    "cameraName": self.camera_name,
                    "zone": ev.get("zone_name", self.zone),
                    "confidence": ev["confidence"],
                    "note": ev.get("note", ""),
                    "snapshotPath": None,
                    "ts": int(time.time() * 1000),
                    "privateClient": True,
                }
                try:
                    created = await self.on_alert(alert_payload)
                    if created:
                        created_alerts.append(created)
                except Exception as e:
                    log.error(f"[ai] private on_alert error: {e}", exc_info=True)

        except Exception as e:
            log.error(f"[ai] private inference error: {e}", exc_info=True)
            detections = []
            events = []

        return {
            "detections": detections,
            "events": events,
            "alerts": created_alerts,
        }

    # ============================================================
    # Main loop (chỉ phát hình nền mô phỏng Hồ Đá, KHÔNG mở webcam máy chủ, KHÔNG phát webcam của khách)
    # ============================================================

    async def _loop(self):
        frame_id = 0
        loop = asyncio.get_event_loop()

        try:
            while self._running:
                if not self._camera_on:
                    frame = self._disabled_frame()
                else:
                    frame = self._synthetic_frame(frame_id)
                self._is_synthetic_frame = True
                self._current_frame = frame
                frame_id += 1

                def _encode(f):
                    ok, jpg = cv2.imencode(
                        ".jpg", f,
                        [int(cv2.IMWRITE_JPEG_QUALITY), settings.jpeg_quality],
                    )
                    return jpg.tobytes() if ok else None

                jpg_bytes = await loop.run_in_executor(None, _encode, frame)
                if jpg_bytes:
                    await self.bus.publish(jpg_bytes)

                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.error(f"[pipeline] loop crashed: {e}", exc_info=True)
            if self._running:
                await asyncio.sleep(3)
                self._task = asyncio.create_task(self._loop())

    # ============================================================
    # Frame generators
    # ============================================================

    def _disabled_frame(self) -> np.ndarray:
        w, h = settings.frame_width, settings.frame_height
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (24, 24, 30)

        text1 = "CAMERA DANG TAT"
        text2 = "Nhan 'Ket noi Camera Thuc te' de bat camera rieng cua thiet bi nay"
        text3 = time.strftime("%Y-%m-%d %H:%M:%S")

        (tw1, _), _ = cv2.getTextSize(text1, cv2.FONT_HERSHEY_SIMPLEX, 1.4, 3)
        (tw2, _), _ = cv2.getTextSize(text2, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        (tw3, _), _ = cv2.getTextSize(text3, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)

        cv2.putText(img, text1,
                    ((w - tw1) // 2, h // 2 - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.4, (140, 180, 200), 3)
        cv2.putText(img, text2,
                    ((w - tw2) // 2, h // 2 + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (160, 180, 190), 2)
        cv2.putText(img, text3,
                    ((w - tw3) // 2, h // 2 + 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (100, 120, 140), 1)
        return img

    def _synthetic_frame(self, frame_id: int) -> np.ndarray:
        w, h = settings.frame_width, settings.frame_height
        img = np.zeros((h, w, 3), dtype=np.uint8)
        t = frame_id * 0.03
        for y in range(0, h, 40):
            shade = int(28 + 22 * np.sin(t + y * 0.01))
            img[y:y + 40, :] = (shade + 25, shade + 18, shade)
        cv2.putText(img, f"SAFEZONE HO DA DHQG-HCM · {self.camera_id.upper()} (CHE DO RIENG TU)",
                    (20, 42), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2)
        cv2.putText(img, "Camera cua moi thiet bi la PRIVATE (khong chia se sang laptop khac)",
                    (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (120, 255, 200), 2)
        cv2.putText(img, time.strftime("%Y-%m-%d %H:%M:%S"),
                    (20, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (200, 220, 255), 1)
        return img
