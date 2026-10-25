import os
import gc
import numpy as np
import cv2
from pathlib import Path
from typing import Optional

from core.config import settings
from core.logger import log


def _is_constrained_cloud() -> bool:
    """Kiểm tra môi trường Cloud giới hạn RAM (như Render Free 512MB)."""
    if os.environ.get("VIGICARE_FORCE_HEAVY_MODEL") == "1":
        return False
    if os.environ.get("RENDER") or os.environ.get("RENDER_SERVICE_ID"):
        return True
    try:
        if os.path.exists("/sys/fs/cgroup/memory/memory.limit_in_bytes"):
            with open("/sys/fs/cgroup/memory/memory.limit_in_bytes") as f:
                limit = int(f.read().strip())
                if 0 < limit <= 1600 * 1024 * 1024:
                    return True
        if os.path.exists("/sys/fs/cgroup/memory.max"):
            with open("/sys/fs/cgroup/memory.max") as f:
                val = f.read().strip()
                if val.isdigit() and int(val) <= 1600 * 1024 * 1024:
                    return True
    except Exception:
        pass
    return False


class PoseEstimator:
    """
    Bộ nhận diện người & 17 điểm khớp xương (YOLOv8-Pose) đa tầng:
      - Tầng 1: Ultralytics YOLO (yolov8x-pose.pt trên Local / yolov8n-pose.pt trên Cloud).
      - Tầng 2: ONNXRuntime (models/yolov8n-pose.onnx) — siêu nhẹ (~45MB RAM), chạy cực nhanh trên Render.
      - Tầng 3: OpenCV DNN (models/yolov8n-pose.onnx) — không phụ thuộc thư viện ngoài, đảm bảo 100% chạy thật.
    Không bao giờ vẽ icon giả đứng yên khi đang dùng camera thật.
    """

    KEYPOINT_NAMES = [
        "nose", "left_eye", "right_eye", "left_ear", "right_ear",
        "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
        "left_wrist", "right_wrist", "left_hip", "right_hip",
        "left_knee", "right_knee", "left_ankle", "right_ankle",
    ]

    def __init__(self, model_name: str = "yolov8x-pose.pt"):
        self.model_name = model_name
        self.model_label = "YOLOv8x-Pose"
        self.model = None
        self.ort_session = None
        self.dnn_net = None
        self.backend_type = "none"
        self.actual_model_path = ""
        self.has_pose = False
        self._is_cloud = _is_constrained_cloud()
        self._imgsz = 480 if self._is_cloud else 640
        self._load_model()

    def _resolve_model_name(self, name: str) -> str:
        if not name:
            return "yolov8n-pose.pt"

        raw = name.strip()
        lower = raw.lower()

        alias_map = {
            "yolo8x": "yolov8x-pose.pt",
            "yolov8x": "yolov8x-pose.pt",
            "yolo8x-pose": "yolov8x-pose.pt",
            "yolov8x-pose.pt": "yolov8x-pose.pt",
            "yolo8x.pt": "yolov8x.pt",
            "yolo8n": "yolov8n-pose.pt",
            "yolov8n": "yolov8n-pose.pt",
            "yolo8n-pose": "yolov8n-pose.pt",
            "yolov8n-pose.pt": "yolov8n-pose.pt",
            "yolo8s": "yolov8s-pose.pt",
            "yolov8s": "yolov8s-pose.pt",
            "yolo8m": "yolov8m-pose.pt",
            "yolov8m": "yolov8m-pose.pt",
            "yolo8l": "yolov8l-pose.pt",
            "yolov8l": "yolov8l-pose.pt",
        }
        resolved = alias_map.get(lower, raw)

        if self._is_cloud and "yolov8x" in resolved.lower():
            resolved = "yolov8n-pose.pt"

        if Path(raw).is_file() and not self._is_cloud:
            return str(Path(raw).resolve())

        in_models = settings.model_dir / resolved
        if in_models.is_file():
            return str(in_models.resolve())

        settings.model_dir.mkdir(parents=True, exist_ok=True)
        return str((settings.model_dir / resolved).resolve())

    def _load_model(self):
        if not self.model_name:
            log.info("[pose] Không có model path, sử dụng mock mode.")
            return

        onnx_path = settings.model_dir / "yolov8n-pose.onnx"

        # Trên Cloud Render (512MB RAM), ưu tiên ONNXRuntime với yolov8n-pose.onnx trước
        # để khởi động tức thì (<1s) và chỉ tốn ~45MB RAM, không bao giờ bị tràn RAM hay lỗi libGL
        if self._is_cloud and onnx_path.is_file():
            if self._try_load_onnx(onnx_path) or self._try_load_dnn(onnx_path):
                return

        # Tầng 1: Thử tải qua Ultralytics YOLO
        target = self._resolve_model_name(self.model_name)
        log.info(f"[pose] Đang tải YOLO model: {target} (cấu hình: '{self.model_name}')")

        try:
            import torch
            if self._is_cloud:
                torch.set_num_threads(2)
        except Exception:
            pass

        try:
            from ultralytics import YOLO

            candidates = [target]
            for fb in [
                settings.model_dir / "yolov8x-pose.pt",
                settings.model_dir / "yolov8n-pose.pt",
                "yolov8n-pose.pt",
            ]:
                fb_str = str(fb.resolve()) if isinstance(fb, Path) and fb.is_file() else str(fb)
                if fb_str not in candidates:
                    candidates.append(fb_str)

            for cand in candidates:
                try:
                    self.model = YOLO(cand)
                    self.actual_model_path = cand
                    self.backend_type = "ultralytics"
                    self.has_pose = True
                    gc.collect()
                    log.info(
                        f"[pose] Ultralytics {self.model_label} loaded thành công: "
                        f"{self.actual_model_path} (imgsz={self._imgsz})"
                    )
                    return
                except Exception as e:
                    log.warning(f"[pose] Không mở được '{cand}' qua Ultralytics: {e}")
        except Exception as e:
            log.warning(f"[pose] Ultralytics không khả dụng ({e}) — chuyển sang ONNX/DNN Engine")

        # Tầng 2 & 3: Fallback sang ONNXRuntime hoặc OpenCV DNN với models/yolov8n-pose.onnx
        if onnx_path.is_file():
            if self._try_load_onnx(onnx_path):
                return
            if self._try_load_dnn(onnx_path):
                return

        log.error("[pose] Không tải được bất kỳ AI engine nào!")

    def _try_load_onnx(self, onnx_path: Path) -> bool:
        try:
            import onnxruntime as ort
            sess_opts = ort.SessionOptions()
            sess_opts.intra_op_num_threads = 2
            self.ort_session = ort.InferenceSession(
                str(onnx_path),
                sess_options=sess_opts,
                providers=["CPUExecutionProvider"],
            )
            self.actual_model_path = str(onnx_path)
            self.backend_type = "onnxruntime"
            self.has_pose = True
            log.info(f"[pose] ONNXRuntime YOLOv8-Pose loaded thành công: {onnx_path}")
            return True
        except Exception as e:
            log.warning(f"[pose] ONNXRuntime load thất bại: {e}")
            self.ort_session = None
            return False

    def _try_load_dnn(self, onnx_path: Path) -> bool:
        try:
            self.dnn_net = cv2.dnn.readNetFromONNX(str(onnx_path))
            self.actual_model_path = str(onnx_path)
            self.backend_type = "opencv_dnn"
            self.has_pose = True
            log.info(f"[pose] OpenCV DNN YOLOv8-Pose loaded thành công: {onnx_path}")
            return True
        except Exception as e:
            log.warning(f"[pose] OpenCV DNN load thất bại: {e}")
            self.dnn_net = None
            return False

    @property
    def is_mock(self) -> bool:
        return self.model is None and self.ort_session is None and self.dnn_net is None

    # Ngưỡng tin cậy nhạy cho cả người đứng gần lẫn người nằm xa trên sàn
    MAIN_CONF = 0.25
    ROT_CONF = 0.25

    def infer(self, frame: np.ndarray) -> list[dict]:
        dets = self._infer_main(frame)

        # Lọc bỏ các vật thể thẳng đứng bị nhận nhầm (như ghế xoay không có điểm đầu/mặt)
        dets = [d for d in dets if self._is_valid_person(d)]

        # Nếu pass 0° chưa thấy người rõ ràng (score < 0.45), chạy thêm pass xoay 90° để bắt người đang nằm ngang
        has_person = any(d["score"] >= 0.45 for d in dets)
        if not has_person and not self.is_mock:
            self._rot_tick = getattr(self, "_rot_tick", 0) + 1
            # Trên Cloud CPU yếu, chạy xoay 90° cách nhịp nếu hoàn toàn trống để không nghẽn CPU
            if not self._is_cloud or (self._rot_tick % 2 == 1):
                try:
                    rot_dets = self._infer_rotated(frame)
                    if rot_dets:
                        dets = self._merge_dets(dets + rot_dets)
                except Exception as e:
                    log.error(f"[pose] Rotated inference lỗi: {e}", exc_info=True)

        return dets

    @staticmethod
    def _is_valid_person(d: dict) -> bool:
        """
        Loại bỏ vật thể giả (như lưng ghế văn phòng):
        Lưng ghế thường có khung đứng (bw < bh), score thấp (< 0.48) và hoàn toàn không có điểm khớp đầu/mặt (0..4) hay cổ chân (15..16).
        """
        score = float(d.get("score", 0.0))
        if score >= 0.48:
            return True
        kps = d.get("keypoints") or []
        if len(kps) < 17:
            return score >= 0.35
        x1, y1, x2, y2 = d["bbox"]
        bw = max(1.0, x2 - x1)
        bh = max(1.0, y2 - y1)
        head_conf = max((float(k[2]) for k in kps[0:5]), default=0.0)
        ankle_conf = max((float(k[2]) for k in kps[15:17]), default=0.0)
        valid_cnt = sum(1 for k in kps if float(k[2]) > 0.20)
        # Nếu là khung nằm ngang (người đang nằm trên sàn): chỉ cần >= 4 điểm khớp > 0.18
        if bw / bh >= 0.95:
            return valid_cnt >= 4
        # Nếu là khung đứng thẳng mà score thấp (< 0.48), bắt buộc phải thấy đầu/mặt hoặc cổ chân
        return (head_conf > 0.20 or ankle_conf > 0.25) and valid_cnt >= 4

    def _infer_main(self, frame: np.ndarray, conf: float | None = None) -> list[dict]:
        conf = self.MAIN_CONF if conf is None else conf
        if self.model is not None:
            try:
                return self._infer_ultralytics(frame, conf=conf)
            except Exception as e:
                log.error(f"[pose] Ultralytics inference lỗi: {e}", exc_info=True)

        if self.ort_session is not None or self.dnn_net is not None:
            try:
                return self._infer_onnx_pose(frame, conf_thres=conf)
            except Exception as e:
                log.error(f"[pose] ONNX/DNN inference lỗi: {e}", exc_info=True)

        if settings.mock_ai:
            return self._mock(frame)
        return []

    def _infer_rotated(self, frame: np.ndarray) -> list[dict]:
        """
        YOLOv8-Pose được huấn luyện chủ yếu trên người đứng/ngồi thẳng nên rất khó nhận
        người đang NẰM NGANG trên sàn. Xoay khung hình 90° (cả 2 chiều) để người nằm trở
        thành "đứng thẳng" trong mắt model, rồi chuyển toạ độ khung + khớp xương về ảnh gốc.
        Chỉ giữ các khung sau khi trả về ảnh gốc thực sự có phương nằm ngang (bw >= bh).
        """
        h, w = frame.shape[:2]
        out = []
        infer_fn = self._rotation_infer_fn()
        for rot in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
            rotated = cv2.rotate(frame, rot)
            for d in infer_fn(rotated):
                unrot = self._unrotate_det(d, rot, w, h)
                ux1, uy1, ux2, uy2 = unrot["bbox"]
                bw = max(1.0, ux2 - ux1)
                bh = max(1.0, uy2 - uy1)
                if bw / bh < 1.0:
                    continue
                kps = unrot.get("keypoints") or []
                vk = [k for k in kps if float(k[2]) > 0.20]
                if len(vk) < 4:
                    continue
                kxs = [k[0] for k in vk]
                kys = [k[1] for k in vk]
                if (max(kxs) - min(kxs)) < (max(kys) - min(kys)):
                    continue
                out.append(unrot)
        return out

    def _rotation_infer_fn(self):
        """Pass xoay dùng YOLOv8n-Pose ONNX siêu nhẹ (~60ms) để không làm chậm khi model chính là YOLOv8x."""
        if self.model is None:
            return lambda img: self._infer_main(img, conf=self.ROT_CONF)

        if not hasattr(self, "_rot_helper"):
            self._rot_helper = None
            onnx_path = settings.model_dir / "yolov8n-pose.onnx"
            if onnx_path.is_file():
                try:
                    import onnxruntime as ort
                    opts = ort.SessionOptions()
                    opts.intra_op_num_threads = 2
                    self._rot_helper = ort.InferenceSession(
                        str(onnx_path), sess_options=opts, providers=["CPUExecutionProvider"]
                    )
                    log.info("[pose] Bật pass xoay 90° (YOLOv8n-Pose ONNX) để nhận diện người nằm")
                except Exception as e:
                    log.warning(f"[pose] Không tạo được helper xoay ONNX: {e}")

        if self._rot_helper is None:
            return lambda img: self._infer_main(img, conf=self.ROT_CONF)

        def _helper(img):
            saved = self.ort_session
            self.ort_session = self._rot_helper
            try:
                return self._infer_onnx_pose(img, conf_thres=self.ROT_CONF)
            finally:
                self.ort_session = saved
        return _helper

    @staticmethod
    def _unrotate_pt(xr: float, yr: float, rot: int, w: int, h: int) -> tuple[float, float]:
        if rot == cv2.ROTATE_90_CLOCKWISE:
            # gốc (x, y) -> xoay (h-1-y, x)
            return float(yr), float(h - 1 - xr)
        # ROTATE_90_COUNTERCLOCKWISE: gốc (x, y) -> xoay (y, w-1-x)
        return float(w - 1 - yr), float(xr)

    def _unrotate_det(self, d: dict, rot: int, w: int, h: int) -> dict:
        x1, y1, x2, y2 = d["bbox"]
        pa = self._unrotate_pt(x1, y1, rot, w, h)
        pb = self._unrotate_pt(x2, y2, rot, w, h)
        bbox = [
            max(0.0, min(pa[0], pb[0])), max(0.0, min(pa[1], pb[1])),
            min(float(w), max(pa[0], pb[0])), min(float(h), max(pa[1], pb[1])),
        ]
        kps = None
        if d.get("keypoints"):
            kps = []
            for kx, ky, kc in d["keypoints"]:
                ox, oy = self._unrotate_pt(kx, ky, rot, w, h)
                kps.append([ox, oy, float(kc)])
        return {
            "bbox": bbox,
            "keypoints": kps,
            "score": float(d["score"]),
            "has_pose": kps is not None,
            "rotated": True,
        }

    @staticmethod
    def _merge_dets(dets: list[dict], iou_thres: float = 0.45) -> list[dict]:
        def iou(a, b):
            ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
            ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
            ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
            return inter / ua if ua > 0 else 0.0

        kept: list[dict] = []
        for d in sorted(dets, key=lambda x: x["score"], reverse=True):
            if all(iou(d["bbox"], k["bbox"]) < iou_thres for k in kept):
                kept.append(d)
        return kept

    def _infer_ultralytics(self, frame: np.ndarray, conf: float = 0.35) -> list[dict]:
        results = self.model(frame, verbose=False, conf=conf, imgsz=self._imgsz)
        if not results:
            return []

        r = results[0]
        if r.boxes is None or len(r.boxes) == 0:
            return []

        boxes = r.boxes.xyxy.cpu().numpy()
        scores = r.boxes.conf.cpu().numpy()
        classes = r.boxes.cls.cpu().numpy() if r.boxes.cls is not None else None

        kpts_xy = None
        kpts_conf = None
        if getattr(r, "keypoints", None) is not None:
            if r.keypoints.xy is not None:
                kpts_xy = r.keypoints.xy.cpu().numpy()
            if r.keypoints.conf is not None:
                kpts_conf = r.keypoints.conf.cpu().numpy()

        dets = []
        for i in range(len(boxes)):
            if classes is not None and int(classes[i]) != 0:
                continue

            kp_list = None
            if kpts_xy is not None and i < kpts_xy.shape[0]:
                kp = np.zeros((17, 3), dtype=np.float32)
                kp[:, :2] = kpts_xy[i]
                if kpts_conf is not None and i < kpts_conf.shape[0]:
                    kp[:, 2] = kpts_conf[i]
                else:
                    kp[:, 2] = 1.0
                kp_list = kp.tolist()

            dets.append({
                "bbox": [float(x) for x in boxes[i].tolist()],
                "keypoints": kp_list,
                "score": float(scores[i]),
                "has_pose": kp_list is not None,
            })

        return dets

    def _infer_onnx_pose(self, frame: np.ndarray, conf_thres: float = 0.20, iou_thres: float = 0.45) -> list[dict]:
        orig_h, orig_w = frame.shape[:2]
        input_size = 640
        scale = min(input_size / orig_w, input_size / orig_h)
        nw, nh = int(round(orig_w * scale)), int(round(orig_h * scale))
        resized = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_LINEAR)

        canvas = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
        pad_x = (input_size - nw) // 2
        pad_y = (input_size - nh) // 2
        canvas[pad_y:pad_y + nh, pad_x:pad_x + nw] = resized

        blob = cv2.dnn.blobFromImage(canvas, 1.0 / 255.0, (input_size, input_size), swapRB=True, crop=False)

        if self.ort_session is not None:
            inp_name = self.ort_session.get_inputs()[0].name
            output0 = self.ort_session.run(None, {inp_name: blob})[0]
        else:
            self.dnn_net.setInput(blob)
            output0 = self.dnn_net.forward()

        # output0 shape: (1, 56, 8400) -> (8400, 56)
        preds = np.squeeze(output0, axis=0).T
        scores = preds[:, 4]
        mask = scores >= conf_thres
        preds = preds[mask]
        scores = scores[mask]
        if len(preds) == 0:
            return []

        cx, cy, w, h = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        boxes_xywh = np.stack([x1, y1, w, h], axis=1).tolist()

        indices = cv2.dnn.NMSBoxes(boxes_xywh, scores.tolist(), conf_thres, iou_thres)
        if len(indices) == 0:
            return []

        dets = []
        for idx in np.array(indices).flatten():
            p = preds[idx]
            bx1 = float(max(0.0, min(float(orig_w), (p[0] - p[2] / 2.0 - pad_x) / scale)))
            by1 = float(max(0.0, min(float(orig_h), (p[1] - p[3] / 2.0 - pad_y) / scale)))
            bx2 = float(max(0.0, min(float(orig_w), (p[0] + p[2] / 2.0 - pad_x) / scale)))
            by2 = float(max(0.0, min(float(orig_h), (p[1] + p[3] / 2.0 - pad_y) / scale)))

            kps_raw = p[5:].reshape(17, 3)
            kps = []
            for kx, ky, kc in kps_raw:
                rx = float(max(0.0, min(float(orig_w), (float(kx) - pad_x) / scale)))
                ry = float(max(0.0, min(float(orig_h), (float(ky) - pad_y) / scale)))
                kps.append([rx, ry, float(kc)])

            dets.append({
                "bbox": [bx1, by1, bx2, by2],
                "keypoints": kps,
                "score": float(scores[idx]),
                "has_pose": True,
            })

        return dets

    def _mock(self, frame: np.ndarray) -> list[dict]:
        return []
