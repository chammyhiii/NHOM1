"""
VigiCare — core/auth.py
FastAPI dependencies: lấy user từ token, yêu cầu đăng nhập / admin / tính năng trả phí.
"""
from typing import Optional

from fastapi import Depends, Header, HTTPException

from .accounts import accounts
from .plans import get_plan


def _extract_token(authorization: Optional[str]) -> str:
    if not authorization:
        return ""
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip()


async def optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    return accounts.user_by_token(_extract_token(authorization))


async def current_user(user: Optional[dict] = Depends(optional_user)) -> dict:
    if not user:
        raise HTTPException(401, "Vui lòng đăng nhập")
    return user


async def admin_user(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Chỉ quản trị viên mới thực hiện được thao tác này")
    return user


def require_feature(feature: str, label: str):
    """Chặn API nếu gói của user không có tính năng `feature` (402 Payment Required)."""

    async def dep(user: dict = Depends(current_user)) -> dict:
        if not get_plan(user["plan"]).get(feature):
            raise HTTPException(402, f"Tính năng “{label}” chỉ có ở gói Pro / Business")
        return user

    return dep


def plan_of(user: Optional[dict]) -> dict:
    return get_plan(user["plan"] if user else "free")
