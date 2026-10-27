from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_prefix="VIGICARE_",
        extra="ignore",
        protected_namespaces=("settings_",),
    )
    # ---------- App ----------
    app_name: str = "SafeZone Hồ Đá · ĐHQG-HCM"
    app_version: str = "1.0.0"
    debug: bool = True

    # ---------- Server ----------
    host: str = "0.0.0.0"
    port: int = 8000

    # ---------- Camera ----------
    camera_index: int = 0
    target_fps: int = 30
    ai_fps: int = 20
    jpeg_quality: int = 80
    frame_width: int = 1280
    frame_height: int = 720

    # ---------- AI Model ----------
    # Hỗ trợ: yolov8x-pose.pt, yolov8n-pose.pt, yolov8s-pose.pt, yolov8m-pose.pt, yolov8x.pt, etc.
    yolo_model: str = "yolov8x-pose.pt"

    # ---------- AI thresholds ----------
    fall_confidence: float = 0.85
    inactivity_seconds: int = 30
    alert_cooldown: int = 60

    # ---------- Paths ----------
    model_dir: Path = BASE_DIR / "models"
    data_dir: Path = BASE_DIR / "data"
    snapshots_dir: Path = BASE_DIR / "data" / "snapshots"
    recordings_dir: Path = BASE_DIR / "data" / "recordings"
    logs_dir: Path = BASE_DIR / "data" / "logs"
    db_path: Path = BASE_DIR / "data" / "alerts.db"
    frontend_dir: Path = BASE_DIR / "frontend"

    # ---------- CORS ----------
    cors_origins: list[str] = ["*"]

    # ---------- Email notifications ----------
    email_user: str = ""
    email_pass: str = ""
    email_to: str = ""

    # ---------- Email triggers (bật/tắt loại alert nào gửi mail) ----------
    email_on_fall: bool = True
    email_on_stroke: bool = True
    email_on_zone_dwell: bool = True
    email_on_zone_critical: bool = True

    # ---------- Kinh doanh / License ----------
    # Email tài khoản quản trị (duyệt đơn, tạo license). Nếu để trống,
    # tài khoản ĐĂNG KÝ ĐẦU TIÊN sẽ tự động trở thành admin.
    admin_email: str = ""
    # Tài khoản nhận tiền VietQR (có thể sửa trong trang Quản trị)
    bank_id: str = "970422"                      # Mã BIN ngân hàng: 970422 (MB Bank)
    bank_account: str = "687269944224"           # Số tài khoản MB Bank
    bank_account_name: str = "VO THI NGOC TRAM"  # Chủ tài khoản: Võ Thị Ngọc Trâm

    # ---------- Gọi điện khẩn cấp tự động (tùy chọn, Twilio) ----------
    twilio_sid: str = ""
    twilio_token: str = ""
    twilio_from: str = ""        # Số điện thoại Twilio, dạng +1xxxxxxxxxx
    emergency_call_cooldown: int = 120

    # ---------- Debug modes ----------
    mock_mode: bool = False
    mock_ai: bool = False


settings = Settings()

settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.snapshots_dir.mkdir(parents=True, exist_ok=True)
settings.recordings_dir.mkdir(parents=True, exist_ok=True)
settings.logs_dir.mkdir(parents=True, exist_ok=True)
settings.model_dir.mkdir(parents=True, exist_ok=True)
