# VigiCare

Hệ thống giám sát an toàn người cao tuổi — phát hiện té ngã và dấu hiệu bất thường theo thời gian thực.

## Cài đặt

```bash
pip install -r backend/requirements.txt
cd backend
python main.py

```

Mở giao diện tại `http://localhost:8000` (không mở trực tiếp bằng
`file:///.../index.html`). Nếu buộc phải mở file HTML trực tiếp, frontend sẽ
thử gọi API tại `http://127.0.0.1:8000`, nhưng camera trình duyệt vẫn yêu cầu
HTTPS hoặc localhost nên chế độ này chỉ là fallback cho API.

## Sử dụng camera của người truy cập

Ở trang Tổng quan hoặc Giám sát đa camera, bấm **Bật camera của tôi** rồi chọn
camera trong danh sách. Ứng dụng dùng `getUserMedia` của trình duyệt nên có thể
chọn webcam USB, camera tích hợp hoặc camera sau trên điện thoại.

Trình duyệt chỉ cho phép camera trên `https://` hoặc `http://localhost`. Khi mở
frontend từ máy khác, hãy dùng HTTPS và cấp quyền camera khi trình duyệt hỏi.
Nếu không cấp quyền hoặc trình duyệt không hỗ trợ API này, giao diện tự dùng
luồng camera backend hiện có làm dự phòng.