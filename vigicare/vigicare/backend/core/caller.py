"""
VigiCare — core/caller.py
Gọi điện khẩn cấp tự động qua Twilio (tùy chọn).

Nếu chưa cấu hình VIGICARE_TWILIO_SID / TOKEN / FROM, hệ thống chỉ ghi log —
người dùng vẫn có thể gọi 1 chạm từ giao diện (link tel:).
"""
import asyncio
import base64
import re
import time
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

from .config import settings
from .logger import log


_last_call_by_type: dict[str, float] = {}


def is_configured() -> bool:
    return bool(settings.twilio_sid and settings.twilio_token and settings.twilio_from)


def to_e164(phone: str) -> str:
    """0912345678 -> +84912345678 (mặc định Việt Nam)."""
    p = re.sub(r"[^\d+]", "", phone or "")
    if p.startswith("+"):
        return p
    if p.startswith("84"):
        return "+" + p
    if p.startswith("0"):
        return "+84" + p[1:]
    return "+84" + p


def _place_call_sync(to: str, message: str) -> bool:
    url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_sid}/Calls.json"
    twiml = (
        '<Response><Say language="vi-VN" voice="Google.vi-VN-Standard-A">'
        f"{escape(message)}</Say><Pause length=\"1\"/>"
        '<Say language="vi-VN" voice="Google.vi-VN-Standard-A">'
        f"{escape(message)}</Say></Response>"
    )
    data = urllib.parse.urlencode({"To": to, "From": settings.twilio_from, "Twiml": twiml}).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    cred = base64.b64encode(f"{settings.twilio_sid}:{settings.twilio_token}".encode()).decode()
    req.add_header("Authorization", f"Basic {cred}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            ok = 200 <= resp.status < 300
        log.info(f"[call] Đã gọi {to}: {'OK' if ok else 'FAIL'}")
        return ok
    except Exception as e:
        log.error(f"[call] Lỗi gọi {to}: {e}")
        return False


async def place_call(phone: str, message: str) -> bool:
    if not is_configured():
        log.warning(f"[call] Twilio chưa cấu hình — bỏ qua gọi tự động tới {phone}")
        return False
    return await asyncio.to_thread(_place_call_sync, to_e164(phone), message)


async def call_contacts(contacts: list[dict], message: str, alert_type: str = "test",
                        respect_cooldown: bool = True) -> int:
    """Gọi lần lượt các liên hệ. Trả về số cuộc gọi thành công."""
    if respect_cooldown:
        last = _last_call_by_type.get(alert_type, 0)
        if time.time() - last < settings.emergency_call_cooldown:
            log.info(f"[call] Bỏ qua ({alert_type}) — đang trong cooldown")
            return 0
        _last_call_by_type[alert_type] = time.time()
    ok = 0
    for c in contacts:
        if await place_call(c["phone"], message):
            ok += 1
    return ok
