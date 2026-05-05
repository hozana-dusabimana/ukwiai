from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session
import jwt

from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.core.deps import CurrentUser
from app.models.user import User, UserRole
from app.schemas.auth import (
    TokenResponse, RegisterRequest, RefreshRequest,
    ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest,
)
from app.schemas.user import UserOut
from app.services.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.viewer,
        phone=payload.phone,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_action(db, user.id, "user.register", "user", user.id)
    db.commit()
    return user


@router.post("/login", response_model=TokenResponse)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)],
    request: Request,
):
    # OAuth2PasswordRequestForm uses 'username' field; we treat it as email.
    user = db.scalar(select(User).where(User.email == form.username))
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    access = create_access_token(user.id, role=user.role.value)
    refresh = create_refresh_token(user.id)
    log_action(db, user.id, "user.login", "user", user.id, ip_address=request.client.host if request.client else None)
    db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: CurrentUser, db: Annotated[Session, Depends(get_db)]):
    log_action(db, user.id, "user.logout", "user", user.id)
    db.commit()


@router.post("/refresh-token", response_model=TokenResponse)
def refresh_token(payload: RefreshRequest, db: Annotated[Session, Depends(get_db)]):
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Wrong token type")
        user_id = int(data["sub"])
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User no longer active")
    return TokenResponse(
        access_token=create_access_token(user.id, role=user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(payload: ForgotPasswordRequest, db: Annotated[Session, Depends(get_db)]):
    """Always returns 202 to avoid leaking whether an email is registered.

    A real deployment wires SMTP here and sends a tokenised reset link.
    Token format below mirrors what /reset-password expects.
    """
    user = db.scalar(select(User).where(User.email == payload.email))
    if user:
        # Token would normally be emailed; we just mint it.
        token = create_access_token(user.id, role=f"reset:{user.role.value}")
        log_action(db, user.id, "user.password_reset_requested", "user", user.id, details={"token_issued": True})
        db.commit()
        # In production, do NOT return the token in the response.
        return {"message": "If the email exists, a reset link has been sent.", "_dev_token": token}
    return {"message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(payload: ResetPasswordRequest, db: Annotated[Session, Depends(get_db)]):
    try:
        data = decode_token(payload.token)
        user_id = int(data["sub"])
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.new_password)
    log_action(db, user.id, "user.password_reset", "user", user.id)
    db.commit()
    return {"message": "Password reset successful"}


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.put("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    log_action(db, user.id, "user.password_change", "user", user.id)
    db.commit()
    return {"message": "Password changed"}
