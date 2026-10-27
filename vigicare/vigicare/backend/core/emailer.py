import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from pathlib import Path
from typing import Optional

from .config import settings
from .logger import log


async def send_email(
    subject: str,
    body: str,
    to: Optional[str] = None,
    image_path: Optional[str] = None,
) -> bool:
    if not settings.email_user or not settings.email_pass:
        log.warning("[email] Chưa cấu hình Gmail — bỏ qua gửi mail")
        return False

    recipient = to or settings.email_to
    if not recipient:
        log.warning("[email] Chưa có người nhận — bỏ qua")
        return False

    try:
        msg = MIMEMultipart()
        msg["From"] = settings.email_user
        msg["To"] = recipient
        msg["Subject"] = subject

        html = f"""
        <html>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b">
          <div style="max-width:600px;margin:0 auto;padding:20px;background:#f0f9ff;border-radius:12px">
            <h2 style="color:#0284c7;margin:0 0 16px 0">🌊 Hệ Thống Cảnh Báo An Toàn Hồ Đá — ĐHQG TP.HCM</h2>
            <div style="background:#fff;padding:20px;border-radius:8px">
              {body}
            </div>
            <p style="font-size:12px;color:#64748b;margin-top:16px">
              Tin nhắn tự động từ Trung tâm Giám sát AI An toàn Hồ Đá (Khu đô thị ĐHQG TP.HCM).
            </p>
          </div>
        </body>
        </html>
        """
        msg.attach(MIMEText(html, "html", "utf-8"))

        if image_path:
            p = Path(image_path)
            if p.exists():
                with open(p, "rb") as f:
                    img_data = f.read()
                img = MIMEImage(img_data)
                img.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=p.name,
                )
                msg.attach(img)

        await aiosmtplib.send(
            msg,
            hostname="smtp.gmail.com",
            port=587,
            start_tls=True,
            username=settings.email_user,
            password=settings.email_pass,
            timeout=15,
        )

        log.info(f"[email] Đã gửi tới {recipient}: {subject}")
        return True

    except Exception as e:
        log.error(f"[email] Lỗi gửi mail: {e}")
        return False