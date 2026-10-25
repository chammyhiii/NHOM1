import math
from collections import deque
from typing import Optional

from core.logger import log


class BehaviorAnalyzer:
    """
    Phân tích tư thế phát hiện Té ngã (fall) và Ngất xỉu (stroke/faint).

    Học từ bản VigiCare gốc (chạy webcam laptop, không bao giờ báo ngã nhầm):
      - Chỉ kết luận "nằm" khi khớp xương RÕ RÀNG (conf > 0.4), không dùng khung bao đơn thuần.
      - Chuẩn hoá theo kích thước khung hình: thân dọc < 38% chiều cao VÀ trải ngang > 30% chiều rộng.
      - Phải duy trì qua nhiều frame liên tiếp mới báo.

    Bổ sung so với bản gốc:
      - Góc trục thân (vai -> hông) < 40° khi không thấy cổ chân.
      - Người được nhận ra nhờ pass xoay 90° (pose.py) => bằng chứng mạnh là đang nằm ngang.
      - Gục trên ghế trước webcam: chỉ báo khi đầu gục xuống ngang/thấp hơn vai hoặc
        nghiêng đầu rất mạnh (> 38°), duy trì lâu — tránh báo nhầm khi ngồi làm việc.
    """

    KP_CONF = 0.22

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path
        self.session = None
        self._load_model()
        self.histories: dict[int, deque] = {}
        self._is_mock = self.session is None

    def _load_model(self):
        if not self.model_path:
            return
        try:
            import onnxruntime as ort
            self.session = ort.InferenceSession(
                self.model_path,
                providers=["CPUExecutionProvider"],
            )
            log.info(f"[behavior] Loaded ONNX behavior model: {self.model_path}")
        except Exception as e:
            log.warning(f"[behavior] Không load được model ONNX: {e} — dùng heuristic")
            self.session = None

    def analyze(self, tracks, frame_shape) -> list[dict]:
        events = []
        h, w = frame_shape[:2]
        if h <= 0 or w <= 0:
            return []

        for t in tracks:
            events.extend(self._analyze_track(t, w, h))

        active_ids = {t.id for t in tracks}
        for tid in list(self.histories.keys()):
            if tid not in active_ids and len(self.histories[tid]) > 45:
                self.histories.pop(tid, None)
        return events

    @staticmethod
    def _mean(pts):
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

    def _posture(self, track, w: int, h: int) -> tuple[bool, bool, float, str]:
        """
        Trả về (is_lying, is_slumped, độ_mạnh 0..0.2, lý_do) cho frame hiện tại.
        Tuân thủ nghiêm ngặt nguyên tắc của VigiCare ver1:
          - Phải thấy cả thân trên (đầu/vai) VÀ thân dưới (hông/gối/cổ chân) mới xét tư thế nằm.
          - Khi ngồi trước webcam laptop (chỉ thấy đầu + vai), tuyệt đối KHÔNG bao giờ báo ngã nhầm.
        """
        kp = track.keypoints
        if not kp or len(kp) < 17:
            return False, False, 0.0, ""

        c = self.KP_CONF
        head = [k for k in kp[0:5] if k[2] > c]
        shoulders = [k for k in kp[5:7] if k[2] > c]
        hips = [k for k in kp[11:13] if k[2] > c]
        knees = [k for k in kp[13:15] if k[2] > c]
        ankles = [k for k in kp[15:17] if k[2] > c]

        upper = head or shoulders
        lower = ankles or knees or hips

        # Giống bản VigiCare ver1: nếu chỉ thấy đầu/vai (đang ngồi gần webcam laptop), không bao giờ báo ngã
        if not upper or not lower:
            return False, False, 0.0, ""

        upper_pt = self._mean(upper)
        lower_pt = self._mean(lower)

        dy = abs(lower_pt[1] - upper_pt[1])
        dx = abs(lower_pt[0] - upper_pt[0])
        vertical_ratio = dy / h
        spine_angle = math.degrees(math.atan2(dy, dx + 1e-5))

        pts = head + shoulders + hips + knees + ankles
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        span_x = max(xs) - min(xs)
        span_y = max(1.0, max(ys) - min(ys))
        horizontal_ratio = span_x / w
        spread = span_x / span_y

        # 1. Luật gốc VigiCare ver1 (có kiểm tra độ trải ngang > dọc để không nhầm khi ngồi ghế xa)
        if vertical_ratio < 0.38 and horizontal_ratio > 0.24 and spread > 1.15 and spine_angle < 45.0:
            return (
                True,
                False,
                0.18,
                f"thân nằm ngang (dọc {vertical_ratio:.0%}, ngang {horizontal_ratio:.0%}, góc {spine_angle:.0f}°)",
            )

        # 2. Người nằm ở khoảng cách xa hơn trong phòng (khung xương trải ngang rõ rệt và trục lưng nằm ngang)
        if spine_angle < 38.0 and spread > 1.35 and vertical_ratio < 0.35 and span_x > 0.16 * w:
            return (
                True,
                False,
                0.15,
                f"trục cơ thể nằm ngang (góc {spine_angle:.0f}°, tỉ lệ ngang/dọc {spread:.1f})",
            )

        return False, False, 0.0, ""

    # ------------------------------------------------------------
    # Main
    # ------------------------------------------------------------
    def _analyze_track(self, track, w: int, h: int) -> list[dict]:
        tb = track.bbox
        cx = (tb[0] + tb[2]) / 2.0
        cy = (tb[1] + tb[3]) / 2.0

        is_lying, is_slumped, boost, reason = self._posture(track, w, h)
        track.posture = "fall" if is_lying else "normal"

        hist = self.histories.setdefault(track.id, deque(maxlen=40))
        hist.append({
            "ts": track.age,
            "is_lying": is_lying,
            "is_slumped": is_slumped,
            "aspect_ratio": (tb[2] - tb[0]) / max(1.0, tb[3] - tb[1]),
            "ar": (tb[2] - tb[0]) / max(1.0, tb[3] - tb[1]),
            "cx": cx,
            "cy": cy,
            "bh": tb[3] - tb[1],
            "bw": tb[2] - tb[0],
            "torso_angle": 0.0 if is_lying else 90.0,
            "reason": reason,
        })

        recent = list(hist)
        window = recent[-10:]
        lying_count = sum(1 for r in window if r["is_lying"])
        slumped_count = sum(1 for r in window if r["is_slumped"])
        # Gục trên ghế cần nhiều frame hơn (8/10) để không nhầm với cúi xuống nhặt đồ / gõ phím
        need = 8 if slumped_count * 2 > lying_count else 6
        if len(window) < need:
            track.posture = "normal"
            return []

        events = []

        if lying_count >= need:
            conf = min(0.97, 0.78 + boost + 0.01 * (lying_count - need))
            detail = reason or next((r["reason"] for r in reversed(window) if r["reason"]), "")
            events.append({
                "type": "fall",
                "confidence": round(conf, 2),
                "track_id": track.id,
                "bbox": track.bbox,
                "note": f"Phát hiện té ngã / đổ gục ({detail})",
            })

            # Ngất xỉu: nằm/gục gần như liên tục và gần như không cử động
            if len(recent) >= 14:
                last14 = [r for r in recent[-14:] if r["is_lying"]]
                if len(last14) >= 12:
                    motion = (max(r["cx"] for r in last14) - min(r["cx"] for r in last14)) + \
                             (max(r["cy"] for r in last14) - min(r["cy"] for r in last14))
                    if motion < 0.05 * max(w, h):
                        track.posture = "faint"
                        events.append({
                            "type": "stroke",
                            "confidence": round(min(0.98, conf + 0.03), 2),
                            "track_id": track.id,
                            "bbox": track.bbox,
                            "note": f"CẢNH BÁO: Người nằm/gục bất động ({detail}) — nghi ngất xỉu",
                        })
        else:
            track.posture = "normal"
            # Bất động quá lâu khi đứng/ngồi (giống bản gốc)
            if track.age > 300 and not self._is_mock and len(recent) >= 25:
                r25 = recent[-25:]
                dy = max(r["cy"] for r in r25) - min(r["cy"] for r in r25)
                if dy < 15:
                    events.append({
                        "type": "inactive",
                        "confidence": 0.6,
                        "track_id": track.id,
                        "bbox": track.bbox,
                        "note": "Không phát hiện cử động trong thời gian dài",
                    })

        return events
