import math
import numpy as np


def _iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    ua = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / ua if ua > 0 else 0.0


def _center_distance(a, b):
    acx = (a[0] + a[2]) / 2.0
    acy = (a[1] + a[3]) / 2.0
    bcx = (b[0] + b[2]) / 2.0
    bcy = (b[1] + b[3]) / 2.0
    return math.hypot(acx - bcx, acy - bcy)


class Track:
    _next_id = 1

    def __init__(self, bbox, keypoints, score):
        self.id = Track._next_id
        Track._next_id += 1
        self.bbox = bbox
        self.keypoints = keypoints
        self.score = score
        self.age = 0
        self.misses = 0
        self.history: list[tuple] = []
        self.standing_height = self._get_height()
        self.posture = "normal"

    def _get_height(self):
        return max(1.0, self.bbox[3] - self.bbox[1])

    def update(self, bbox, keypoints, score):
        self.bbox = bbox
        self.keypoints = keypoints
        self.score = score
        self.misses = 0
        self.age += 1

        cur_h = self._get_height()
        cur_w = max(1.0, self.bbox[2] - self.bbox[0])

        # Cập nhật chiều cao đứng nếu người đang đứng (h > 1.3 * w)
        if cur_h > 1.3 * cur_w:
            self.standing_height = max(self.standing_height, cur_h)

        self.history.append((bbox, keypoints))
        if len(self.history) > 90:
            self.history.pop(0)


class ByteTracker:
    """
    ByteTracker mở rộng với IoU + Khoảng cách trọng tâm
    Chống mất track_id khi người đổi tư thế đột ngột từ đứng sang ngã/nằm xỉu.
    """

    def __init__(self, max_misses: int = 30, iou_threshold: float = 0.20):
        self.tracks: list[Track] = []
        self.max_misses = max_misses
        self.iou_threshold = iou_threshold

    def update(self, detections: list[dict]) -> list[Track]:
        for t in self.tracks:
            t.misses += 1

        unmatched_dets = list(range(len(detections)))
        unmatched_tracks = list(self.tracks)

        # Pha 1: Ghép theo IoU
        matched_tracks = set()
        for track in unmatched_tracks:
            best_iou, best_j = 0.0, -1
            for j in unmatched_dets:
                iou = _iou(track.bbox, detections[j]["bbox"])
                if iou > best_iou:
                    best_iou, best_j = iou, j
            if best_j >= 0 and best_iou >= self.iou_threshold:
                d = detections[best_j]
                track.update(d["bbox"], d["keypoints"], d["score"])
                unmatched_dets.remove(best_j)
                matched_tracks.add(track)

        # Pha 2: Ghép bằng khoảng cách không gian (Spatial Fall Matching)
        # Khi té ngã / xỉu xuống sàn, IoU có thể giảm dưới threshold,
        # nhưng vị trí rơi sẽ nằm sát chân hoặc gần vị trí đứng trước đó.
        remaining_tracks = [t for t in unmatched_tracks if t not in matched_tracks and t.misses <= 3]
        for track in remaining_tracks:
            if not unmatched_dets:
                break
            tb = track.bbox
            tw = max(1.0, tb[2] - tb[0])
            th = max(1.0, tb[3] - tb[1])
            max_dist = max(tw, th) * 1.5

            best_dist, best_j = float("inf"), -1
            for j in unmatched_dets:
                dist = _center_distance(tb, detections[j]["bbox"])
                if dist < best_dist:
                    best_dist, best_j = dist, j

            if best_j >= 0 and best_dist <= max_dist:
                d = detections[best_j]
                track.update(d["bbox"], d["keypoints"], d["score"])
                unmatched_dets.remove(best_j)
                matched_tracks.add(track)

        # Pha 3: Tạo track mới cho các detection còn lại
        for j in unmatched_dets:
            d = detections[j]
            self.tracks.append(Track(d["bbox"], d["keypoints"], d["score"]))

        self.tracks = [t for t in self.tracks if t.misses <= self.max_misses]
        return [t for t in self.tracks if t.misses == 0]
