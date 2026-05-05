from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.models.stage import ConstructionStage
from app.schemas.stage import (
    ConstructionStageCreate, ConstructionStageUpdate, ConstructionStageOut,
)

router = APIRouter(prefix="/stages", tags=["stages"])


@router.get("", response_model=list[ConstructionStageOut])
def list_stages(db: Annotated[Session, Depends(get_db)]):
    return db.scalars(select(ConstructionStage).order_by(ConstructionStage.stage_order)).all()


@router.post("", response_model=ConstructionStageOut, status_code=status.HTTP_201_CREATED)
def create_stage(
    payload: ConstructionStageCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
):
    if db.scalar(select(ConstructionStage).where(ConstructionStage.stage_order == payload.stage_order)):
        raise HTTPException(409, "stage_order already exists")
    s = ConstructionStage(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/{stage_id}", response_model=ConstructionStageOut)
def update_stage(
    stage_id: int,
    payload: ConstructionStageUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
):
    s = db.get(ConstructionStage, stage_id)
    if not s:
        raise HTTPException(404, "Stage not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(
    stage_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_admin)],
):
    s = db.get(ConstructionStage, stage_id)
    if not s:
        raise HTTPException(404, "Stage not found")
    db.delete(s)
    db.commit()
