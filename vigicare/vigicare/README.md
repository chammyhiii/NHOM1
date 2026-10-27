# Dự án Hệ Thống Cảnh Báo An Toàn Hồ Đá — Ứng dụng Thị giác Máy tính & Camera AI (ĐHQG TP.HCM)

Hệ thống ứng dụng **Thị giác máy tính (Computer Vision)** và **Camera AI (YOLOv8x-Pose + ByteTrack + Polygon Geofencing)** nhằm giám sát an toàn, phát hiện người vượt rào vào vách đá dựng đứng hoặc trượt ngã sát mép vực nước sâu tại khu vực **Hồ Đá — Khu đô thị Đại học Quốc gia TP.HCM**.

Bên cạnh bài toán trọng tâm tại Hồ Đá ĐHQG-HCM, nền tảng hỗ trợ **Thương mại hóa & Mở rộng Đa lĩnh vực** (bản quyền trọn đời thanh toán qua VietQR MB Bank):
- **Gói Pro (10.000đ)**: Triển khai cho **Trường mầm non tư thục**, nhóm trẻ, cụm trạm gác bờ hồ (tối đa 4 camera, xuất báo cáo CSV, gọi khẩn cấp).
- **Gói Business (599.000đ)**: Triển khai cho **Ban Quản lý Khu đô thị ĐHQG**, **Viện dưỡng lão**, khu du lịch sinh thái, hồ bơi (không giới hạn camera).

## Cài đặt & Khởi chạy

```bash
pip install -r backend/requirements.txt
cd backend
python main.py
```

Mở giao diện Trung tâm Điều hành tại `http://localhost:8000`.
