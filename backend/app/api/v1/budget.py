from typing import Annotated
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentUser, require_engineer_plus, require_manager_or_admin
from app.models.budget import BudgetRecord, ExpenseCategory
from app.models.project import Project
from app.models.stage import ConstructionStage, ProjectStage
from app.models.user import User
from app.schemas.budget import ExpenseCreate, ExpenseUpdate, ExpenseOut, BudgetSummary
from app.services.audit import log_action
from app.services.access import user_can_access
from app.services.cost_estimation import (
    total_recorded_expenses, total_ai_inferred_cost, total_ai_predicted_cost,
)

router = APIRouter(tags=["budget"])


def _load_project_or_403(db: Session, project_id: int, user: User) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not user_can_access(db, project_id, user):
        raise HTTPException(403, "You are not assigned to this project.")
    return p


@router.get("/projects/{project_id}/budget")
def project_budget(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = _load_project_or_403(db, project_id, user)
    spent = total_recorded_expenses(db, project_id)
    return {
        "project_id": project_id,
        "total_budget": float(p.total_budget or 0),
        "total_spent": float(spent),
        "remaining": float((p.total_budget or 0) - spent),
        "spent_percent": float(spent) / float(p.total_budget) * 100 if p.total_budget else 0.0,
    }


@router.post(
    "/projects/{project_id}/budget/expense",
    response_model=ExpenseOut,
    status_code=status.HTTP_201_CREATED,
)
def add_expense(
    project_id: int,
    payload: ExpenseCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_engineer_plus)],
):
    _load_project_or_403(db, project_id, user)

    expense = BudgetRecord(
        project_id=project_id,
        stage_id=payload.stage_id,
        expense_category=payload.expense_category,
        amount=payload.amount,
        description=payload.description,
        expense_date=payload.expense_date,
        recorded_by=user.id,
        receipt_url=payload.receipt_url,
    )
    db.add(expense)
    db.flush()

    # Roll up actual_cost on the matching project_stage
    if payload.stage_id:
        ps = db.scalar(
            select(ProjectStage).where(
                ProjectStage.project_id == project_id, ProjectStage.stage_id == payload.stage_id
            )
        )
        if ps:
            ps.actual_cost = (ps.actual_cost or Decimal("0")) + payload.amount

    log_action(db, user.id, "expense.create", "budget_record", expense.id, details={"amount": float(payload.amount)})
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/projects/{project_id}/expenses", response_model=list[ExpenseOut])
def list_expenses(
    project_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    category: ExpenseCategory | None = None,
):
    _load_project_or_403(db, project_id, user)
    stmt = select(BudgetRecord).where(BudgetRecord.project_id == project_id)
    if category:
        stmt = stmt.where(BudgetRecord.expense_category == category)
    stmt = stmt.order_by(desc(BudgetRecord.expense_date), desc(BudgetRecord.id)).offset(skip).limit(limit)
    return db.scalars(stmt).all()


@router.put("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    e = db.get(BudgetRecord, expense_id)
    if not e:
        raise HTTPException(404, "Expense not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    log_action(db, user.id, "expense.update", "budget_record", expense_id)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_manager_or_admin)],
):
    e = db.get(BudgetRecord, expense_id)
    if not e:
        raise HTTPException(404, "Expense not found")
    db.delete(e)
    log_action(db, user.id, "expense.delete", "budget_record", expense_id)
    db.commit()


@router.get("/projects/{project_id}/budget/summary", response_model=BudgetSummary)
def budget_summary(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    p = _load_project_or_403(db, project_id, user)
    spent = total_recorded_expenses(db, project_id)
    ai_spent = total_ai_inferred_cost(db, project_id)
    ai_predicted = total_ai_predicted_cost(db, project_id)
    by_cat_rows = db.execute(
        select(BudgetRecord.expense_category, func.coalesce(func.sum(BudgetRecord.amount), 0))
        .where(BudgetRecord.project_id == project_id)
        .group_by(BudgetRecord.expense_category)
    ).all()
    by_cat = {c.value: Decimal(str(amt or 0)) for c, amt in by_cat_rows}

    by_stage_rows = db.execute(
        select(ConstructionStage.stage_name, func.coalesce(func.sum(BudgetRecord.amount), 0))
        .select_from(BudgetRecord)
        .join(ConstructionStage, BudgetRecord.stage_id == ConstructionStage.id, isouter=True)
        .where(BudgetRecord.project_id == project_id)
        .group_by(ConstructionStage.stage_name)
    ).all()
    by_stage = {(name or "unassigned"): Decimal(str(amt or 0)) for name, amt in by_stage_rows}

    total_budget = Decimal(str(p.total_budget or 0))
    # effective_total_spent = max of recorded vs AI market-prediction (recorded
    # always wins if present because it's ground truth; the market prediction —
    # which can exceed the budget — fills the gap when nothing is logged).
    effective = spent if spent > ai_predicted else ai_predicted
    return BudgetSummary(
        total_budget=total_budget,
        total_spent=spent,
        remaining=total_budget - spent,
        spent_percent=float(spent) / float(total_budget) * 100 if total_budget else 0.0,
        by_category=by_cat,
        by_stage=by_stage,
        total_ai_inferred_cost=ai_spent,
        total_ai_predicted_cost=ai_predicted,
        effective_total_spent=effective,
        effective_spent_percent=float(effective) / float(total_budget) * 100 if total_budget else 0.0,
        effective_remaining=total_budget - effective,
    )


@router.get("/projects/{project_id}/budget/breakdown")
def breakdown(project_id: int, db: Annotated[Session, Depends(get_db)], user: CurrentUser):
    """Allocated vs actual cost per stage.

    Each row carries TWO spend numbers:
      - actual_cost: sum of recorded BudgetRecord rows (ground truth, additive)
      - ai_inferred_cost: latest AI-driven estimate based on photos
                          (overwritten on every /api/ai/analyze-image call)
    The frontend picks which to show; we send both so the UI never has to fake values.
    """
    _load_project_or_403(db, project_id, user)
    rows = db.execute(
        select(
            ConstructionStage.stage_name,
            ProjectStage.allocated_budget,
            ProjectStage.actual_cost,
            ProjectStage.ai_inferred_cost,
            ProjectStage.ai_predicted_cost,
            ProjectStage.status,
        )
        .join(ConstructionStage, ProjectStage.stage_id == ConstructionStage.id)
        .where(ProjectStage.project_id == project_id)
        .order_by(ConstructionStage.stage_order)
    ).all()
    out = []
    for name, allocated, actual, ai_cost, ai_pred, st in rows:
        alloc_v = float(allocated or 0)
        actual_v = float(actual or 0)
        ai_v = float(ai_cost or 0)
        ai_pred_v = float(ai_pred or 0)
        # effective_spent = recorded expense if present, else the AI market
        # prediction (which can exceed the allocation on hard ground / hot market).
        effective = max(actual_v, ai_pred_v)
        out.append({
            "stage_name": name,
            "allocated_budget": alloc_v,
            "actual_cost": actual_v,
            "ai_inferred_cost": ai_v,
            "ai_predicted_cost": ai_pred_v,
            "effective_spent": effective,
            "remaining": alloc_v - effective,
            "over_budget": effective > alloc_v,
            "status": st.value if st else None,
        })
    return out
