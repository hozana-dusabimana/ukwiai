from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.core.deps import require_admin, CurrentUser
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = None,
    role: str | None = None,
):
    stmt = select(User)
    if search:
        like = f"%{search}%"
        stmt = stmt.where((User.full_name.ilike(like)) | (User.email.ilike(like)))
    if role:
        stmt = stmt.where(User.role == role)
    stmt = stmt.order_by(User.id).offset(skip).limit(limit)
    return db.scalars(stmt).all()


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return u


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
):
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(409, "Email already exists")
    u = User(
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone,
        avatar_url=payload.avatar_url,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(u, k, v)
    db.commit()
    db.refresh(u)
    return u


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    me: CurrentUser,
):
    if me.role.value != "admin":
        raise HTTPException(403, "Admin only")
    if user_id == me.id:
        raise HTTPException(400, "Cannot delete yourself")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    db.delete(u)
    db.commit()


@router.patch("/{user_id}/activate", response_model=UserOut)
def activate(user_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    u.is_active = True
    db.commit()
    db.refresh(u)
    return u


@router.patch("/{user_id}/deactivate", response_model=UserOut)
def deactivate(user_id: int, db: Annotated[Session, Depends(get_db)], _: Annotated[User, Depends(require_admin)]):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    u.is_active = False
    db.commit()
    db.refresh(u)
    return u
