"""
VigiCare — routes/billing.py
Bán license trọn đời + phí cài đặt, thanh toán bằng VietQR (chuyển khoản ngân hàng).

Luồng mua hàng:
  1. User chọn gói  -> POST /api/billing/orders        (tạo đơn, mã VGCxxxxxx)
  2. User quét QR, chuyển khoản với nội dung = mã đơn
  3. User bấm "Tôi đã chuyển khoản" -> POST /api/billing/orders/{code}/claim
  4. Admin kiểm tra tài khoản ngân hàng -> POST /api/admin/orders/{code}/confirm
     => hệ thống tạo license key, tự kích hoạt cho user, gửi email.
Ngoài ra admin có thể tạo license key để bán trực tiếp / qua đại lý,
user nhập key tại POST /api/billing/activate.
"""
import time
import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.accounts import accounts
from core.auth import admin_user, current_user
from core.emailer import send_email
from core.logger import log
from core.plans import PAID_PLANS, PLANS, plan_rank, public_plans, upgrade_price


router = APIRouter(tags=["billing"])


def _vnd(n: int) -> str:
    return f"{n:,.0f}".replace(",", ".") + "đ"


def _qr_url(order: dict) -> Optional[str]:
    bank = accounts.bank_info()
    if not bank["bankId"] or not bank["accountNo"]:
        return None
    qs = urllib.parse.urlencode({
        "amount": order["amount"],
        "addInfo": order["code"],
        "accountName": bank["accountName"],
    })
    return f"https://img.vietqr.io/image/{bank['bankId']}-{bank['accountNo']}-compact2.png?{qs}"


def _with_payment(order: dict) -> dict:
    return {**order, "qrUrl": _qr_url(order), "bank": accounts.bank_info()}


# ============================================================
# PUBLIC / USER
# ============================================================

class OrderBody(BaseModel):
    plan: str
    install: bool = False
    contactPhone: str = ""
    address: str = ""
    note: str = ""


class ActivateBody(BaseModel):
    key: str


@router.get("/api/billing/plans")
async def list_plans():
    bank = accounts.bank_info()
    return {"plans": public_plans(), "paymentReady": bool(bank["bankId"] and bank["accountNo"])}


@router.post("/api/billing/orders")
async def create_order(body: OrderBody, user: dict = Depends(current_user)):
    if body.plan not in PAID_PLANS:
        raise HTTPException(400, "Gói không hợp lệ")
    if plan_rank(body.plan) <= plan_rank(user["plan"]):
        raise HTTPException(400, "Bạn đã sở hữu gói này hoặc gói cao hơn")
    if body.install and (not body.contactPhone.strip() or not body.address.strip()):
        raise HTTPException(400, "Vui lòng nhập số điện thoại và địa chỉ lắp đặt")

    plan = PLANS[body.plan]
    order = accounts.create_order(
        user_id=user["id"],
        plan=body.plan,
        from_plan=user["plan"],
        license_amount=upgrade_price(user["plan"], body.plan),
        install=body.install,
        install_amount=plan["install_fee"] if body.install else 0,
        contact_phone=body.contactPhone,
        address=body.address,
        note=body.note,
    )
    log.info(f"[billing] Đơn mới {order['code']} · {user['email']} · {plan['name']} · {_vnd(order['amount'])}")
    return _with_payment(order)


@router.get("/api/billing/orders")
async def my_orders(user: dict = Depends(current_user)):
    return {"items": [_with_payment(o) for o in accounts.list_orders(user_id=user["id"])]}


@router.post("/api/billing/orders/{code}/claim")
async def claim_paid(code: str, user: dict = Depends(current_user)):
    order = accounts.get_order(code)
    if not order or order["userId"] != user["id"]:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    if order["status"] != "pending":
        raise HTTPException(400, "Đơn không ở trạng thái chờ thanh toán")
    order = accounts.update_order(order["code"], status="claimed", claimed_at=int(time.time() * 1000))
    log.info(f"[billing] {user['email']} báo đã chuyển khoản đơn {order['code']}")

    # Báo cho admin qua email (nếu đã cấu hình Gmail)
    await send_email(
        f"💰 Đơn {order['code']} báo đã chuyển khoản — {_vnd(order['amount'])}",
        f"<p><b>Khách:</b> {user['email']}</p>"
        f"<p><b>Gói:</b> {order['planName']}{' + lắp đặt' if order['install'] else ''}</p>"
        f"<p><b>Số tiền:</b> {_vnd(order['amount'])}</p>"
        f"<p>Vui lòng kiểm tra tài khoản ngân hàng và xác nhận trong trang Quản trị.</p>",
    )
    return _with_payment(order)


@router.post("/api/billing/orders/{code}/cancel")
async def cancel_order(code: str, user: dict = Depends(current_user)):
    order = accounts.get_order(code)
    if not order or order["userId"] != user["id"]:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    if order["status"] not in ("pending", "claimed"):
        raise HTTPException(400, "Không thể hủy đơn này")
    return accounts.update_order(order["code"], status="cancelled")


@router.post("/api/billing/activate")
async def activate(body: ActivateBody, user: dict = Depends(current_user)):
    try:
        lic = accounts.activate_license(user["id"], body.key)
    except ValueError as e:
        raise HTTPException(400, str(e))
    log.info(f"[billing] {user['email']} kích hoạt key {lic['key']} ({lic['plan']})")
    return {"license": lic, "user": accounts.public_user(accounts.get_user(user["id"]))}


# ============================================================
# ADMIN
# ============================================================

class LicenseBody(BaseModel):
    plan: str
    quantity: int = Field(1, ge=1, le=50)
    note: str = ""


class BankBody(BaseModel):
    bankId: str
    accountNo: str
    accountName: str


@router.get("/api/admin/stats")
async def admin_stats(_: dict = Depends(admin_user)):
    return accounts.revenue_stats()


@router.get("/api/admin/orders")
async def admin_orders(status: Optional[str] = None, _: dict = Depends(admin_user)):
    return {"items": accounts.list_orders(status=status)}


@router.post("/api/admin/orders/{code}/confirm")
async def admin_confirm(code: str, admin: dict = Depends(admin_user)):
    try:
        order = accounts.confirm_order(code)
    except ValueError as e:
        raise HTTPException(400, str(e))
    log.info(f"[billing] Admin {admin['email']} xác nhận đơn {order['code']} -> key {order['licenseKey']}")

    await send_email(
        f"✅ VigiCare — Kích hoạt {order['planName']} thành công",
        f"<p>Cảm ơn bạn đã mua <b>{order['planName']}</b>!</p>"
        f"<p><b>Mã đơn:</b> {order['code']}<br><b>Số tiền:</b> {_vnd(order['amount'])}</p>"
        f"<p><b>License key:</b> <code style='font-size:16px'>{order['licenseKey']}</code></p>"
        f"<p>Gói đã được tự động kích hoạt cho tài khoản {order['userEmail']}. "
        f"Hãy lưu lại key để cài đặt lại khi cần.</p>"
        + ("<p>Kỹ thuật viên sẽ liên hệ để hẹn lịch lắp đặt.</p>" if order["install"] else ""),
        to=order["userEmail"],
    )
    return order


@router.post("/api/admin/orders/{code}/reject")
async def admin_reject(code: str, _: dict = Depends(admin_user)):
    order = accounts.get_order(code)
    if not order:
        raise HTTPException(404, "Không tìm thấy đơn hàng")
    if order["status"] == "paid":
        raise HTTPException(400, "Đơn đã thanh toán, không thể từ chối")
    return accounts.update_order(order["code"], status="rejected")


@router.get("/api/admin/licenses")
async def admin_licenses(_: dict = Depends(admin_user)):
    return {"items": accounts.list_licenses()}


@router.post("/api/admin/licenses")
async def admin_create_licenses(body: LicenseBody, admin: dict = Depends(admin_user)):
    if body.plan not in PAID_PLANS:
        raise HTTPException(400, "Gói không hợp lệ")
    keys = [accounts.create_license(body.plan, note=body.note) for _ in range(body.quantity)]
    log.info(f"[billing] Admin {admin['email']} tạo {len(keys)} key {body.plan}")
    return {"items": keys}


@router.get("/api/admin/users")
async def admin_users(_: dict = Depends(admin_user)):
    return {"items": accounts.list_users()}


@router.get("/api/admin/bank")
async def admin_get_bank(_: dict = Depends(admin_user)):
    return accounts.bank_info()


@router.put("/api/admin/bank")
async def admin_set_bank(body: BankBody, _: dict = Depends(admin_user)):
    accounts.set_setting("bank_id", body.bankId.strip())
    accounts.set_setting("bank_account", body.accountNo.strip())
    accounts.set_setting("bank_account_name", body.accountName.strip().upper())
    return accounts.bank_info()
