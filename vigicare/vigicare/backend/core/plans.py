"""
VigiCare — core/plans.py
Định nghĩa các gói bản quyền (license trọn đời) và quyền lợi đi kèm.

Mô hình kinh doanh:
  * Free      — miễn phí, dùng thử giới hạn.
  * Pro       — mua 1 lần dùng trọn đời, cho hộ gia đình.
  * Business  — mua 1 lần dùng trọn đời, cho viện dưỡng lão / phòng khám.
  * Phí cài đặt tận nơi (tùy chọn) — kỹ thuật viên lắp camera & cấu hình.

Giá trị None nghĩa là KHÔNG GIỚI HẠN.
"""
from typing import Optional


PLANS: dict[str, dict] = {
    "free": {
        "id": "free",
        "rank": 0,
        "name": "Miễn phí · Điểm Trực Đơn",
        "tagline": "Trải nghiệm AI giám sát cho 1 trạm camera bờ hồ",
        "price": 0,
        "install_fee": 0,
        "max_cameras": 1,
        "history_days": 7,
        "export_csv": False,
        "emergency_call": False,
        "max_contacts": 0,
        "highlights": [
            "1 trạm camera AI (vùng cấm bờ hồ & phát hiện trượt ngã)",
            "Cảnh báo âm thanh & còi hú tại chỗ",
            "Lưu nhật ký xâm nhập 7 ngày",
            "Gọi khẩn cấp Đội Bảo vệ / 115 thủ công",
        ],
    },
    "pro": {
        "id": "pro",
        "rank": 1,
        "name": "Pro · Trường mầm non",
        "tagline": "Mua 1 lần — dùng trọn đời cho lớp học & nhóm trẻ",
        "price": 10_000,
        "install_fee": 150_000,
        "max_cameras": 4,
        "history_days": None,
        "export_csv": True,
        "emergency_call": True,
        "max_contacts": 5,
        "highlights": [
            "Tối đa 4 camera (lớp học, sân chơi, hành lang…)",
            "Lưu lịch sử không giới hạn",
            "Xuất báo cáo CSV cho nhà trường & phụ huynh",
            "Gọi điện khẩn cấp tới giáo viên / phụ huynh",
            "Tự động báo động khi phát hiện trẻ té ngã / vào vùng nguy hiểm",
        ],
    },
    "business": {
        "id": "business",
        "rank": 2,
        "name": "Business · Viện dưỡng lão",
        "tagline": "Cho cơ sở chăm sóc nhiều phòng",
        "price": 599_000,
        "install_fee": 300_000,
        "max_cameras": None,
        "history_days": None,
        "export_csv": True,
        "emergency_call": True,
        "max_contacts": 20,
        "highlights": [
            "Không giới hạn camera",
            "Lưu lịch sử không giới hạn",
            "Xuất báo cáo CSV",
            "Gọi khẩn cấp tới 20 liên hệ (y tá, bác sĩ…)",
            "Hỗ trợ kỹ thuật ưu tiên",
        ],
    },
}

PAID_PLANS = ("pro", "business")


def get_plan(plan_id: Optional[str]) -> dict:
    return PLANS.get(plan_id or "free", PLANS["free"])


def plan_rank(plan_id: Optional[str]) -> int:
    return get_plan(plan_id)["rank"]


def upgrade_price(current_plan: str, target_plan: str) -> int:
    """Giá phải trả khi nâng cấp: chỉ trả phần chênh lệch so với gói hiện tại."""
    cur = get_plan(current_plan)
    tgt = get_plan(target_plan)
    return max(0, tgt["price"] - cur["price"])


def public_plans() -> list[dict]:
    return [dict(p) for p in sorted(PLANS.values(), key=lambda p: p["rank"])]
