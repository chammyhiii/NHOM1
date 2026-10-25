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
        self._ai_task: asyncio.Task | None = None
        self._current_frame: np.ndarray | None = None
        self._is_synthetic_frame: bool = True
        self._infer_lock = asyncio.Lock()
        self._last_detections: list[dict] = []
        self._last_events: list[dict] = []
        self._pending_alerts: list[dict] = []
        self._last_alert_ts: dict[str, float] = {}
        self._camera_on = True
        self._client_frame: np.ndarray | None = None
        self._client_frame_ts: float = 0

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        self._ai_task = asyncio.create_task(self._ai_loop())
        log.info(
            f"[pipeline] {self.camera_id} started · model={self.pose.model_label} "
            f"· pose_mock={self.pose.is_mock}"
        )

    async def stop(self):
        self._running = False
        for t in (self._task, self._ai_task):
            if t:
                t.cancel()
                try:
                    await t
                except (asyncio.CancelledError, Exception):
                    pass
        self._task = self._ai_task = None
        log.info(f"[pipeline] {self.camera_id} stopped")

    # ============================================================
    # Camera toggle & Client Frame Processing
    # ============================================================

    async def enable_camera(self):
        if self._camera_on:
            return True
        self._camera_on = True
        self._client_frame = None
        self._client_frame_ts = 0
        log.info(f"[pipeline] {self.camera_id} camera ENABLED")
        return True

    async def disable_camera(self):
        if not self._camera_on:
            return True
        self._camera_on = False
        log.info(f"[pipeline] {self.camera_id} camera DISABLED")
        return True

    def is_camera_on(self) -> bool:
        return self._camera_on

    def feed_frame(self, frame_bgr: np.ndarray):
        self._client_frame = frame_bgr
        self._client_frame_ts = time.time()
        self._current_frame = frame_bgr
        self._is_synthetic_frame = False

    async def process_client_frame(self, frame_bgr: np.ndarray) -> list[dict]:
        """Nhận frame từ trình duyệt, chạy suy luận YOLOv8-Pose trực tiếp và trả về cảnh báo mới."""
        self.feed_frame(frame_bgr)
        async with self._infer_lock:
            await self._run_ai_step(frame_bgr)
        if self._pending_alerts:
            out = list(self._pending_alerts)
            self._pending_alerts.clear()
            return out
        return []

    # ============================================================
    # Main loop
    # ============================================================

    async def _loop(self):
        cap = None
        last_open_attempt = 0.0
        interval = 1.0 / settings.target_fps
        frame_id = 0
        loop = asyncio.get_event_loop()

        try:
            while self._running:
                t0 = time.perf_counter()

                if not self._camera_on:
                    if cap is not None:
                        cap.release()
                        cap = None
                    frame = self._disabled_frame()
                    display = frame.copy()

                    def _encode_off(f):
                        ok, jpg = cv2.imencode(
                            ".jpg", f,
                            [int(cv2.IMWRITE_JPEG_QUALITY), settings.jpeg_quality],
                        )
                        return jpg.tobytes() if ok else None

                    jpg_bytes = await loop.run_in_executor(None, _encode_off, display)
                    if jpg_bytes:
                        await self.bus.publish(jpg_bytes)
                    await asyncio.sleep(0.5)
                    continue

                now = time.time()
                has_client_stream = (
                    self._client_frame is not None and (now - self._client_frame_ts) < 12.0
                )

                if has_client_stream:
                    if cap is not None:
                        cap.release()
                        cap = None
                    frame = self._client_frame.copy()
                    self._is_synthetic_frame = False
                else:
                    if cap is None and (now - last_open_attempt) >= 8.0:
                        last_open_attempt = now
                        cap = await loop.run_in_executor(None, self._open_camera)

                    if cap is not None:
                        ok, frame = cap.read()
                        if not ok:
                            cap.release()
                            cap = None
                            frame = None
                        else:
                            self._is_synthetic_frame = False
                    else:
                        frame = None

                    if frame is None:
                        frame = self._synthetic_frame(frame_id)
                        self._is_synthetic_frame = True
                        if not settings.mock_mode and (now - self._client_frame_ts) >= 12.0:
                            self._last_detections = []
                            self._last_events = []

                self._current_frame = frame
                frame_id += 1

                display = frame.copy()
                if self._last_detections:
                    self._draw_overlay(display, self._last_detections, self._last_events)

                def _encode(f):
                    ok, jpg = cv2.imencode(
                        ".jpg", f,
                        [int(cv2.IMWRITE_JPEG_QUALITY), settings.jpeg_quality],
                    )
                    return jpg.tobytes() if ok else None

                jpg_bytes = await loop.run_in_executor(None, _encode, display)
                if jpg_bytes:
                    await self.bus.publish(jpg_bytes)

                elapsed = time.perf_counter() - t0
                # Trên Cloud hoặc khi đang dùng luồng upload_frame từ trình duyệt, giảm nhịp MJPEG phụ để nhường 100% CPU cho AI
                target_wait = 0.25 if (getattr(self.pose, "_is_cloud", False) or has_client_stream) else interval
                await asyncio.sleep(max(0.005, target_wait - elapsed))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.error(f"[pipeline] loop crashed: {e}", exc_info=True)
            if self._running:
                log.info("[pipeline] Restarting loop in 3s...")
                await asyncio.sleep(3)
                self._task = asyncio.create_task(self._loop())
        finally:
            if cap is not None:
                cap.release()

    async def _run_ai_step(self, frame: np.ndarray):
        loop = asyncio.get_event_loop()
        try:
            detections = await loop.run_in_executor(
                None, self.pose.infer, frame
            )
            tracks = self.tracker.update(detections)

            # Đánh dấu track nào được nhận ra nhờ pass xoay 90° (dấu hiệu người đang nằm ngang)
            for tr in tracks:
                tr.rotated = any(d.get("rotated") and d["bbox"] == tr.bbox for d in detections)

            fall_events = self.behavior.analyze(tracks, frame.shape)

            # Nếu người dùng đã ngồi/đứng thẳng dậy bình thường, mở khóa cooldown để sẵn sàng báo tiếp
            postures = [getattr(tr, "posture", "normal") for tr in tracks]
            self.state.on_frame_postures(postures)
            if self.state._normal_streak >= 4:
                self._last_alert_ts.pop("fall", None)
                self._last_alert_ts.pop("stroke", None)

            for det in detections:
                det["posture"] = "normal"
                for tr in tracks:
                    if tr.bbox == det["bbox"]:
                        det["posture"] = getattr(tr, "posture", "normal")
                        det["track_id"] = tr.id
                        break

            self._last_detections = detections

            zone_events = []
            try:
                zone_events = self.zone_monitor.check(tracks, frame.shape)
            except Exception as ze:
                log.error(f"[zone_monitor] error: {ze}", exc_info=True)

            events = fall_events + zone_events
            self._last_events = events

            try:
                from routes.stream import ws_manager
                if ws_manager.clients:
                    h_f, w_f = frame.shape[:2]
                    asyncio.create_task(ws_manager.broadcast({
                        "type": "detections",
                        "data": {
                            "detections": detections,
                            "events": events,
                            "frame_w": w_f,
                            "frame_h": h_f,
                            "camera_id": self.camera_id,
                            "model": self.pose.model_label,
                        }
                    }))
            except Exception:
                pass
        except Exception as e:
            log.error(f"[ai] inference error: {e}", exc_info=True)
            events = []
            self._last_events = []
            return

        now_ts = time.time()
        for ev in events:
            ev_type = ev.get("type", "")

            if ev_type.startswith("zone_"):
                should_fire = True
            else:
                should_fire = self.state.should_fire(ev)

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

            last = self._last_alert_ts.get(ev_type, 0)
            if now_ts - last < COOLDOWN:
                continue
            self._last_alert_ts[ev_type] = now_ts

            snapshot = self._save_snapshot(frame, ev)
            alert = {
                "type": ev["type"],
                "cameraId": self.camera_id,
                "cameraName": self.camera_name,
                "zone": ev.get("zone_name", self.zone),
                "confidence": ev["confidence"],
                "note": ev.get("note", ""),
                "snapshotPath": snapshot,
                "ts": int(time.time() * 1000),
            }
            try:
                created = await self.on_alert(alert)
                if created:
                    self._pending_alerts.append(created)
                    if len(self._pending_alerts) > 10:
                        self._pending_alerts.pop(0)
            except Exception as e:
                log.error(f"[ai] on_alert error: {e}", exc_info=True)

    async def _ai_loop(self):
        interval = 1.0 / settings.ai_fps

        try:
            while self._running:
                t0 = time.perf_counter()

                if not self._camera_on:
                    await asyncio.sleep(0.3)
                    continue

                # Khi trình duyệt đang truyền frame qua upload_frame, process_client_frame đã chạy AI trực tiếp
                if self._client_frame is not None and (time.time() - self._client_frame_ts) < 5.0:
                    await asyncio.sleep(0.25)
                    continue

                frame = self._current_frame
                if frame is None or (self._is_synthetic_frame and not settings.mock_mode):
                    await asyncio.sleep(0.2)
                    continue

                if not self._infer_lock.locked():
                    async with self._infer_lock:
                        await self._run_ai_step(frame)

                elapsed = time.perf_counter() - t0
                await asyncio.sleep(max(0.01, interval - elapsed))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.error(f"[ai] loop crashed: {e}", exc_info=True)
            if self._running:
                log.info("[ai] Restarting AI loop in 3s...")
                await asyncio.sleep(3)
                self._ai_task = asyncio.create_task(self._ai_loop())

    # ============================================================
    # Draw
    # ============================================================

    def _draw_overlay(self, frame: np.ndarray, detections: list[dict], events: list[dict]):
        h, w = frame.shape[:2]

        try:
            for zone in self.zone_monitor.zones:
                polygon = zone.get("polygon", [])
                if len(polygon) < 3:
                    continue
                pts = []
                for p in polygon:
                    x = int(p[0] * w / 1280)
                    y = int(p[1] * h / 720)
                    pts.append([x, y])
                pts = np.array(pts, dtype=np.int32)

                color = (0, 0, 255) if zone.get("severity") == "critical" else (0, 165, 255)
                overlay = frame.copy()
                cv2.fillPoly(overlay, [pts], color)
                cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)
                cv2.polylines(frame, [pts], True, color, 2)

                label = f"ZONE: {zone.get('name', '')}"
                cv2.putText(frame, label, (pts[0][0] + 5, pts[0][1] + 20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        except Exception as e:
            log.error(f"[draw] zone error: {e}")

        for det in detections:
            x1, y1, x2, y2 = map(int, det["bbox"])
            score = det.get("score", 0)
            posture = det.get("posture", "normal")

            if posture in ("fall", "faint"):
                color = (0, 0, 255)
                tag = "FAINT" if posture == "faint" else "FALL"
                label = f"{tag} {score:.2f}"
                text_color = (255, 255, 255)
            else:
                color = (0, 255, 0) if score > 0.7 else (0, 200, 255)
                label = f"PERSON {score:.2f}"
                text_color = (0, 0, 0)

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            label_y1 = max(0, y1 - th - 10)
            cv2.rectangle(frame, (x1, label_y1), (x1 + tw + 10, label_y1 + th + 10), color, -1)
            cv2.putText(frame, label, (x1 + 5, label_y1 + th + 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, text_color, 2)

            kpts = det.get("keypoints")
            if not kpts:
                continue

            for a, b in SKELETON:
                if a >= len(kpts) or b >= len(kpts):
                    continue
                ka, kb = kpts[a], kpts[b]
                if float(ka[2]) > 0.18 and float(kb[2]) > 0.18:
                    cv2.line(
                        frame,
                        (int(ka[0]), int(ka[1])),
                        (int(kb[0]), int(kb[1])),
                        (0, 255, 255), 2,
                    )

            for idx, kp in enumerate(kpts):
                if float(kp[2]) > 0.18:
                    cv2.circle(
                        frame,
                        (int(kp[0]), int(kp[1])),
                        4,
                        KP_COLORS[idx % len(KP_COLORS)],
                        -1,
                    )

        y_offset = 30
        for ev in events:
            ev_type = ev.get("type", "?")
            conf = ev.get("confidence", 0)
            label = f"{ev_type.upper()} {conf:.0%}"
            if ev_type in ("fall", "stroke", "zone_critical"):
                color = (0, 0, 255)
            elif ev_type.startswith("zone_"):
                color = (0, 140, 255)
            else:
                color = (0, 165, 255)
            cv2.putText(frame, label, (w - 260, y_offset),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            y_offset += 30

        cv2.putText(frame, f"YOLOv8x-Pose · People: {len(detections)}", (10, h - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # ============================================================
    # Frame generators
    # ============================================================

    def _disabled_frame(self) -> np.ndarray:
        w, h = settings.frame_width, settings.frame_height
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (24, 24, 30)

        text1 = "CAMERA ĐÃ TẮT"
        text2 = "Nhấn nút Bật camera trên topbar để tiếp tục"
        text3 = time.strftime("%Y-%m-%d %H:%M:%S")

        (tw1, _), _ = cv2.getTextSize(text1, cv2.FONT_HERSHEY_SIMPLEX, 1.6, 3)
        (tw2, _), _ = cv2.getTextSize(text2, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        (tw3, _), _ = cv2.getTextSize(text3, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)

        cv2.putText(img, text1,
                    ((w - tw1) // 2, h // 2 - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.6, (140, 140, 200), 3)
        cv2.putText(img, text2,
                    ((w - tw2) // 2, h // 2 + 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (160, 160, 180), 2)
        cv2.putText(img, text3,
                    ((w - tw3) // 2, h // 2 + 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (100, 100, 140), 1)
        return img

    def _synthetic_frame(self, frame_id: int) -> np.ndarray:
        w, h = settings.frame_width, settings.frame_height
        img = np.zeros((h, w, 3), dtype=np.uint8)
        t = frame_id * 0.03
        for y in range(0, h, 40):
            shade = int(30 + 30 * np.sin(t + y * 0.01))
            img[y:y + 40, :] = (shade, shade + 10, shade + 30)
        cv2.putText(img, f"YOLOv8x-POSE READY · {self.camera_id.upper()}",
                    (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.putText(img, "Nhan 'Bat camera cua toi' de truyen Webcam vao AI",
                    (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (120, 255, 180), 2)
        cv2.putText(img, time.strftime("%Y-%m-%d %H:%M:%S"),
                    (20, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 220, 255), 1)
        return img

    def _open_camera(self):
        if settings.mock_mode or getattr(self.pose, "_is_cloud", False):
            return None
        try:
            src = self.camera_index
            if isinstance(src, str) and src.isdigit():
                src = int(src)
            cap = cv2.VideoCapture(src)
            if not cap.isOpened():
                log.warning(f"[pipeline] Camera {self.camera_index} không mở được")
                return None
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings.frame_width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings.frame_height)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
            return cap
        except Exception as e:
            log.error(f"[pipeline] Lỗi mở camera: {e}")
            return None

    def _save_snapshot(self, frame: np.ndarray, event: dict) -> str | None:
        try:
            ts = time.strftime("%Y%m%d-%H%M%S")
            name = f"{self.camera_id}_{event['type']}_{ts}.jpg"
            path = Path(settings.snapshots_dir) / name
            snap = frame.copy()
            if self._last_detections:
                self._draw_overlay(snap, self._last_detections, [event])
            cv2.imwrite(str(path), snap)
            return str(path.relative_to(settings.data_dir.parent))
        except Exception as e:
            log.error(f"[pipeline] snapshot error: {e}")
            return None
