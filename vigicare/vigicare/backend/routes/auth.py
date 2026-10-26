"""
VigiCare — routes/auth.py
Đăng ký / đăng nhập / đăng xuất / thông tin tài khoản.
"""
import re

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from core.accounts import accounts
from core.auth import current_user, _extract_token
from core.logger import log


router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterBody(BaseModel):
    email: str
    password: str
    name: str = ""
    phone: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/register")
async def register(body: RegisterBody):
    if not EMAIL_RE.match(body.email.strip()):
        raise HTTPException(400, "Email không hợp lệ")
    if len(body.password) < 6:
        raise HTTPException(400, "Mật khẩu phải có ít nhất 6 ký tự")
    try:
        user = accounts.create_user(body.email, body.password, body.name, body.phone)
    except ValueError as e:
        raise HTTPException(400, str(e))
    token = accounts.create_session(user["id"])
    log.info(f"[auth] Đăng ký mới: {user['email']} (admin={bool(user['is_admin'])})")
    return {"token": token, "user": accounts.public_user(user)}


@router.post("/login")
async def login(body: LoginBody):
    user = accounts.verify_user(body.email, body.password)
    if not user:
        raise HTTPException(401, "Sai email hoặc mật khẩu")
    token = accounts.create_session(user["id"])
    return {"token": token, "user": accounts.public_user(user)}


@router.post("/logout")
async def logout(authorization: str | None = Header(default=None)):
    accounts.delete_session(_extract_token(authorization))
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return {"user": accounts.public_user(user)}
