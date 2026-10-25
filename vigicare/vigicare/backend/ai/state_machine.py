import time
from collections import deque


class FallStateMachine:
    """
    Debounced state machine — chống báo giả nhưng phản hồi tức thì khi té ngã / ngất xỉu:
      - Yêu cầu 2 frame xác nhận (vì BehaviorAnalyzer đã lọc trung bình trượt trên chuỗi frame).
      - Tự động mở khóa cooldown ngay khi người dùng ngồi/đứng dậy bình thường.
    """

    def __init__(self, confirm_frames: int = 2, cooldown_seconds: int = 12):
        self.confirm_frames = confirm_frames
        self.cooldown = min(cooldown_seconds, 15)
        self.buffers: dict[tuple, deque] = {}
        self.last_fired: dict[str, float] = {}
        self._normal_streak: int = 0

    def on_frame_postures(self, postures: list[str]):
        """Nếu tất cả người trong khung hình đã ngồi/đứng thẳng bình thường liên tiếp 4 frame,
        reset cooldown để sẵn sàng báo động ngay cho lần té/xỉu tiếp theo."""
        if postures and all(p == "normal" for p in postures):
            self._normal_streak += 1
            if self._normal_streak >= 4:
                self.last_fired.pop("fall", None)
                self.last_fired.pop("stroke", None)
                self.buffers.clear()
        else:
            self._normal_streak = 0

    def should_fire(self, event: dict) -> bool:
        ev_type = event.get("type", "")
        track_id = event.get("track_id", 0)
        confidence = float(event.get("confidence", 0.7))

        key = (ev_type, track_id)
        buf = self.buffers.setdefault(key, deque(maxlen=self.confirm_frames))
        buf.append(event)

        req_frames = 1 if confidence >= 0.88 else self.confirm_frames
        if len(buf) < req_frames:
            return False

        now = time.time()
        last = self.last_fired.get(ev_type, 0)
        if now - last < self.cooldown:
            return False

        avg_conf = sum(e["confidence"] for e in buf) / len(buf)
        if avg_conf < 0.60:
            return False

        self.last_fired[ev_type] = now
        buf.clear()
        return True

    def reset(self):
        self.buffers.clear()
        self.last_fired.clear()
        self._normal_streak = 0
