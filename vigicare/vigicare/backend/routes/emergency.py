"""
VigiCare — routes/emergency.py
Danh bạ & gọi điện khẩn cấp (tính năng gói Pro / Business).
"""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import caller
from core.accounts import accounts
from core.auth import optional_user, require_feature
from core.plans import get_plan


router = APIRouter(prefix="/api/emergency", tags=["emergency"])

PHONE_RE = re.compile(r"^\+?[\d\s.-]{8,15}$")
_pro = require_feature("emergency_call", "Gọi điện khẩn cấp")


class ContactBody(BaseModel):
    name: str
    phone: str
    relation: str = ""


@router.get("/status")
async def status(user: dict | None = Depends(optional_user)):
    enabled = bool(user and get_plan(user["plan"])["emergency_call"])
    return {
        "enabled": enabled,
        "autoCall": caller.is_configured(),
        "contacts": accounts.list_contacts(user["id"]) if enabled else [],
        "maxContacts": get_plan(user["plan"] if user else "free")["max_contacts"],
        "hotline": "115",
    }


@router.get("/contacts")
async def list_contacts(user: dict = Depends(_pro)):
    return {"items": accounts.list_contacts(user["id"])}


@router.post("/contacts")
async def add_contact(body: ContactBody, user: dict = Depends(_pro)):
    if not body.name.strip():
        raise HTTPException(400, "Vui lòng nhập tên")
    if not PHONE_RE.match(body.phone.strip()):
        raise HTTPException(400, "Số điện thoại không hợp lệ")
    limit = get_plan(user["plan"])["max_contacts"]
    if len(accounts.list_contacts(user["id"])) >= limit:
        raise HTTPException(402, f"Gói hiện tại chỉ lưu tối đa {limit} liên hệ — nâng cấp Business để thêm")
    return accounts.add_contact(user["id"], body.name, body.phone, body.relation)


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: int, user: dict = Depends(_pro)):
    if not accounts.delete_contact(user["id"], contact_id):
        raise HTTPException(404, "Không tìm thấy liên hệ")
    return {"ok": True}


@router.post("/test-call")
async def test_call(user: dict = Depends(_pro)):
    contacts = accounts.list_contacts(user["id"])
    if not contacts:
        raise HTTPException(400, "Chưa có liên hệ khẩn cấp nào")
    if not caller.is_configured():
        return {"autoCall": False, "called": 0}
    n = await caller.call_contacts(
        contacts[:1],
        "Đây là cuộc gọi thử nghiệm từ Hệ thống Cảnh báo An toàn Hồ Đá ĐHQG TP.HCM.",
        respect_cooldown=False,
    )
    return {"autoCall": True, "called": n}
