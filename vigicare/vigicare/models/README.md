# Models

Thư mục này chứa model ONNX. Hiện tại **đang chạy mock mode** — không cần model.

## Muốn dùng model thật?

Đặt 3 file sau vào đây:
- `rtmo-s.onnx` — Pose estimation (RTMO-S từ OpenMMLab)
- `behavior_transformer.onnx` — Phân tích hành vi
- `pose_autoencoder.onnx` — Phát hiện bất thường

Tải từ: https://github.com/open-mmlab/mmpose/tree/main/projects/rtmo

Kiểm tra file hợp lệ:
```python
import onnxruntime as ort
ort.InferenceSession("rtmo-s.onnx")  # Không lỗi = OK