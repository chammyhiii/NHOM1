"""
SafeZone-HD — ai/zone_monitor.py
Kiểm tra người có trong vùng cấm không + đếm dwell time
"""
import time
from typing import Optional

from core.storage import storage
from core.logger import log


# Trạng thái dwell cho mỗi track: { track_id: {zone_id, zone_name, enter_ts, max_dwell, warned_dwell, warned_critical} }
_zone_states: dict[int, dict] = {}
_last_fired: dict[int, float] = {}       # track_id → timestamp lần fire cuối

DWELL_WARN_AFTER = 5
AUTO_RELOAD_SEC = 30
ENTER_COOLDOWN = 15                      # Cooldown 15s giữa 2 lần fire zone_enter cùng track
ENTER_MIN_DWELL = 2.0                    # Phải ở trong zone ít nhất 2s mới fire


class ZoneMonitor:
    def __init__(self):
        self.zones = []
        self._last_zone_count = -1
        self.last_reload = 0
        self.load_zones()

    def load_zones(self):
        """Load danh sách zones từ DB."""
        self.zones = storage.list_zones(enabled_only=True)
        self.last_reload = time.time()
        if len(self.zones) != self._last_zone_count:
            log.info(f"[zone_monitor] Loaded {len(self.zones)} zones")
            self._last_zone_count = len(self.zones)

    def reload(self):
        self.load_zones()

    def _maybe_reload(self):
        if time.time() - self.last_reload > AUTO_RELOAD_SEC:
            self.load_zones()

    def check(self, tracks, frame_shape) -> list[dict]:
        """Kiểm tra tất cả tracks với tất cả zones."""
        self._maybe_reload()

        if not self.zones:
            return []

        h, w = frame_shape[:2]
        if w == 0 or h == 0:
            return []

        events = []
        now = time.time()
        active_ids = set()

        for track in tracks:
            active_ids.add(track.id)

            x1, y1, x2, y2 = track.bbox
            cx = (x1 + x2) / 2

            # 3 điểm kiểm tra: đầu (10%), ngực (50%), chân (100%)
            check_points = [
                (cx, y1 + (y2 - y1) * 0.10),
                (cx, y1 + (y2 - y1) * 0.50),
                (cx, y2),
            ]

            # Scale sang tọa độ polygon (1280x720)
            scaled = [(px * 1280 / w, py * 720 / h) for px, py in check_points]

            # Tìm zone chứa bất kỳ điểm nào
            current_zone = None
            for zone in self.zones:
                polygon = zone.get("polygon", [])
                if len(polygon) < 3:
                    continue
                for px, py in scaled:
                    if self.point_in_polygon(px, py, polygon):
                        current_zone = zone
                        break
                if current_zone:
                    break

            prev = _zone_states.get(track.id)
            prev_zone_id = prev["zone_id"] if prev else None

            # === 1. Vừa vào zone mới ===
            if current_zone and prev_zone_id != current_zone["id"]:
                _zone_states[track.id] = {
                    "zone_id": current_zone["id"],
                    "zone_name": current_zone["name"],
                    "enter_ts": now,
                    "max_dwell": 0,
                    "warned_dwell": False,
                    "warned_critical": False,
                    "fired_enter": False,        # chưa fire
                }
                continue

            # === 2. Đang ở trong zone ===
            if current_zone and prev_zone_id == current_zone["id"]:
                state = _zone_states[track.id]
                dwell = now - state["enter_ts"]
                state["max_dwell"] = max(state["max_dwell"], dwell)

                # Fire zone_enter sau khi confirm 2s + cooldown 15s
                if not state.get("fired_enter", False):
                    last = _last_fired.get(track.id, 0)
                    if dwell >= ENTER_MIN_DWELL and (now - last) >= ENTER_COOLDOWN:
                        state["fired_enter"] = True
                        _last_fired[track.id] = now
                        events.append({
                            "type": "zone_enter",
                            "zone_id": current_zone["id"],
                            "zone_name": current_zone["name"],
                            "track_id": track.id,
                            "bbox": track.bbox,
                            "confidence": 0.9,
                        })
                        log.info(f"[zone_monitor] Track {track.id} CONFIRMED enter zone {current_zone['id']} after {dwell:.1f}s")

                if dwell > DWELL_WARN_AFTER and not state["warned_dwell"]:
                    state["warned_dwell"] = True
                    events.append({
                        "type": "zone_dwell",
                        "zone_id": current_zone["id"],
                        "zone_name": current_zone["name"],
                        "track_id": track.id,
                        "dwell": round(dwell, 1),
                        "bbox": track.bbox,
                        "confidence": 0.85,
                    })

                max_allowed = current_zone.get("maxDwellSeconds", 30)
                if dwell > max_allowed and not state["warned_critical"]:
                    state["warned_critical"] = True
                    events.append({
                        "type": "zone_critical",
                        "zone_id": current_zone["id"],
                        "zone_name": current_zone["name"],
                        "track_id": track.id,
                        "dwell": round(dwell, 1),
                        "bbox": track.bbox,
                        "confidence": 0.95,
                    })
                    log.warning(f"[zone_monitor] Track {track.id} CRITICAL in zone {current_zone['id']} — dwell {dwell:.1f}s")

            # === 3. Vừa rời zone ===
            elif not current_zone and prev_zone_id:
                state = _zone_states.pop(track.id, None)
                if state:
                    events.append({
                        "type": "zone_exit",
                        "zone_id": state["zone_id"],
                        "zone_name": state.get("zone_name", ""),
                        "track_id": track.id,
                        "max_dwell": round(state["max_dwell"], 1),
                        "bbox": track.bbox,
                        "confidence": 0.9,
                    })
                    log.info(f"[zone_monitor] Track {track.id} EXITED zone {state['zone_id']} — max dwell {state['max_dwell']:.1f}s")

        # Cleanup: xóa state của track đã biến mất
        for tid in list(_zone_states.keys()):
            if tid not in active_ids:
                state = _zone_states.pop(tid, None)
                if state:
                    events.append({
                        "type": "zone_exit",
                        "zone_id": state["zone_id"],
                        "zone_name": state.get("zone_name", ""),
                        "track_id": tid,
                        "max_dwell": round(state["max_dwell"], 1),
                        "confidence": 0.8,
                    })

        return events

    @staticmethod
    def point_in_polygon(px: float, py: float, polygon: list) -> bool:
        """Ray casting algorithm."""
        n = len(polygon)
        if n < 3:
            return False
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = polygon[i][0], polygon[i][1]
            xj, yj = polygon[j][0], polygon[j][1]
            if ((yi > py) != (yj > py)) and \
               (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
                inside = not inside
            j = i
        return inside
