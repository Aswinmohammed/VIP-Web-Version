from __future__ import annotations

import uuid
from collections import OrderedDict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import Employee, EmployeeAttendance, EmployeeSalaryPayment, EmployeeWorkLog
from backend.app.schemas import (
    EmployeeAttendanceCheckInInput,
    EmployeeAttendanceCheckOutInput,
    EmployeeAttendanceRead,
    EmployeeCreate,
    EmployeeRead,
    EmployeeSalaryPaymentInput,
    EmployeeSalaryPaymentRead,
    EmployeeWorkLogInput,
    EmployeeWorkLogRead,
    TodayCheckedInEmployeeRead,
)


router = APIRouter(prefix="/employees", tags=["employees"])


def _normalize_piece_rates(piece_rates: dict[str, object] | None) -> dict[str, float]:
    if not piece_rates:
        return {}
    return {dress_type: float(rate) for dress_type, rate in piece_rates.items()}


def _serialize_json_value(value: object) -> object:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _normalize_branch_piece_rate_history(branch_piece_rate_history: list[object] | None) -> list[dict[str, object]]:
    if not branch_piece_rate_history:
        return []

    normalized: list[dict[str, object]] = []
    for entry in branch_piece_rate_history:
        normalized.append(
            {
                "id": getattr(entry, "id", None),
                "rate": float(getattr(entry, "rate", 0) or 0),
                "effective_from": _serialize_json_value(getattr(entry, "effective_from", None)),
                "note": getattr(entry, "note", None),
                "created_at": _serialize_json_value(getattr(entry, "created_at", None)),
            }
        )
    return normalized


def _dedupe_items_by_legacy_id[T](items: list[T], id_getter) -> list[T]:
    deduped: "OrderedDict[str, T]" = OrderedDict()
    without_legacy_id: list[T] = []

    for item in items:
        legacy_id = id_getter(item)
        if legacy_id:
            deduped[str(legacy_id)] = item
        else:
            without_legacy_id.append(item)

    return [*deduped.values(), *without_legacy_id]


def _get_work_log_legacy_id(employee: Employee, work_log_payload) -> str | None:
    legacy_id = work_log_payload.id
    if not legacy_id:
        return None

    if not work_log_payload.auto_generated:
        return legacy_id

    source_reference = work_log_payload.source_order_item_id or work_log_payload.source_order_id
    if not source_reference:
        return legacy_id

    return f"AUTO-BRANCH-{employee.id}-{source_reference}"


def _get_employee_or_404(db: Session, actor: AuthenticatedActor, employee_id: uuid.UUID) -> Employee:
    stmt = apply_branch_scope(
        select(Employee)
        .options(selectinload(Employee.work_logs), selectinload(Employee.salary_payments))
        .where(Employee.id == employee_id),
        Employee,
        actor,
    )
    employee = db.scalar(stmt)
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _attendance_worked_day_counts(
    db: Session,
    actor: AuthenticatedActor,
    employee_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    if not employee_ids:
        return {}

    rows = db.execute(
        select(EmployeeAttendance.employee_id, func.count(func.distinct(EmployeeAttendance.attendance_date)))
        .where(
            EmployeeAttendance.tenant_id == actor.tenant_id,
            EmployeeAttendance.employee_id.in_(employee_ids),
            EmployeeAttendance.check_in_at.is_not(None),
        )
        .group_by(EmployeeAttendance.employee_id)
    ).all()
    return {employee_id: int(count or 0) for employee_id, count in rows}


def _serialize_attendance(
    employee: Employee,
    attendance: EmployeeAttendance | None,
    worked_days: int,
) -> EmployeeAttendanceRead:
    return EmployeeAttendanceRead(
        id=attendance.id if attendance else None,
        employee_id=employee.id,
        employee_name=employee.name,
        branch_id=employee.branch_id,
        attendance_date=attendance.attendance_date if attendance else _today(),
        check_in_at=attendance.check_in_at if attendance else None,
        check_out_at=attendance.check_out_at if attendance else None,
        worked_days=worked_days,
    )


def _get_date_attendance(
    db: Session,
    actor: AuthenticatedActor,
    employee_id: uuid.UUID,
    target_date: date,
) -> EmployeeAttendance | None:
    return db.scalar(
        select(EmployeeAttendance).where(
            EmployeeAttendance.tenant_id == actor.tenant_id,
            EmployeeAttendance.employee_id == employee_id,
            EmployeeAttendance.attendance_date == target_date,
        )
    )


def _get_today_attendance(
    db: Session,
    actor: AuthenticatedActor,
    employee_id: uuid.UUID,
) -> EmployeeAttendance | None:
    return _get_date_attendance(db, actor, employee_id, _today())


def _parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _get_employee_work_log_or_404(
    db: Session,
    actor: AuthenticatedActor,
    employee: Employee,
    work_log_id: str,
) -> EmployeeWorkLog:
    parsed_work_log_id = _parse_uuid(work_log_id)
    stmt = select(EmployeeWorkLog).where(
        EmployeeWorkLog.employee_id == employee.id,
        EmployeeWorkLog.tenant_id == actor.tenant_id,
    )
    if parsed_work_log_id:
        stmt = stmt.where(or_(EmployeeWorkLog.id == parsed_work_log_id, EmployeeWorkLog.legacy_id == work_log_id))
    else:
        stmt = stmt.where(EmployeeWorkLog.legacy_id == work_log_id)

    work_log = db.scalar(stmt)
    if not work_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee work log not found")
    return work_log


def _get_employee_salary_payment_or_404(
    db: Session,
    actor: AuthenticatedActor,
    employee: Employee,
    payment_id: str,
) -> EmployeeSalaryPayment:
    parsed_payment_id = _parse_uuid(payment_id)
    stmt = select(EmployeeSalaryPayment).where(
        EmployeeSalaryPayment.employee_id == employee.id,
        EmployeeSalaryPayment.tenant_id == actor.tenant_id,
    )
    if parsed_payment_id:
        stmt = stmt.where(or_(EmployeeSalaryPayment.id == parsed_payment_id, EmployeeSalaryPayment.legacy_id == payment_id))
    else:
        stmt = stmt.where(EmployeeSalaryPayment.legacy_id == payment_id)

    payment = db.scalar(stmt)
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee salary payment not found")
    return payment


def _apply_work_log_payload(
    work_log: EmployeeWorkLog,
    employee: Employee,
    actor: AuthenticatedActor,
    payload: EmployeeWorkLogInput,
) -> None:
    work_log.tenant_id = actor.tenant_id
    work_log.branch_id = employee.branch_id
    work_log.employee_id = employee.id
    work_log.legacy_id = _get_work_log_legacy_id(employee, payload)
    work_log.dress_type = payload.dress_type
    work_log.quantity = payload.quantity
    work_log.unit_price = payload.unit_price
    work_log.total_amount = payload.total_amount
    work_log.work_date = payload.work_date
    work_log.recorded_at = payload.recorded_at
    work_log.start_hour = payload.start_hour
    work_log.end_hour = payload.end_hour
    work_log.salary_per_hour = payload.salary_per_hour
    work_log.auto_generated = payload.auto_generated
    work_log.source_branch_id = payload.source_branch_id
    work_log.source_order_id = payload.source_order_id
    work_log.source_order_item_id = payload.source_order_item_id


def _apply_salary_payment_payload(
    payment: EmployeeSalaryPayment,
    employee: Employee,
    actor: AuthenticatedActor,
    payload: EmployeeSalaryPaymentInput,
) -> None:
    payment.tenant_id = actor.tenant_id
    payment.branch_id = employee.branch_id
    payment.employee_id = employee.id
    payment.legacy_id = payload.id
    payment.amount = payload.amount
    payment.payment_date = payload.payment_date
    payment.recorded_at = payload.recorded_at
    payment.note = payload.note


def _replace_employee_children(db: Session, actor: AuthenticatedActor, employee: Employee, payload: EmployeeCreate) -> None:
    db.execute(
        delete(EmployeeWorkLog).where(
            EmployeeWorkLog.employee_id == employee.id,
            EmployeeWorkLog.tenant_id == actor.tenant_id,
        )
    )
    db.execute(
        delete(EmployeeSalaryPayment).where(
            EmployeeSalaryPayment.employee_id == employee.id,
            EmployeeSalaryPayment.tenant_id == actor.tenant_id,
        )
    )
    db.flush()

    work_logs_to_insert = _dedupe_items_by_legacy_id(payload.work_logs, lambda work_log: work_log.id)
    salary_payments_to_insert = _dedupe_items_by_legacy_id(payload.salary_payments, lambda payment: payment.id)

    for work_log_payload in work_logs_to_insert:
        db.add(
            EmployeeWorkLog(
                tenant_id=actor.tenant_id,
                branch_id=employee.branch_id,
                employee_id=employee.id,
                legacy_id=_get_work_log_legacy_id(employee, work_log_payload),
                dress_type=work_log_payload.dress_type,
                quantity=work_log_payload.quantity,
                unit_price=work_log_payload.unit_price,
                total_amount=work_log_payload.total_amount,
                work_date=work_log_payload.work_date,
                recorded_at=work_log_payload.recorded_at,
                start_hour=work_log_payload.start_hour,
                end_hour=work_log_payload.end_hour,
                salary_per_hour=work_log_payload.salary_per_hour,
                auto_generated=work_log_payload.auto_generated,
                source_branch_id=work_log_payload.source_branch_id,
                source_order_id=work_log_payload.source_order_id,
                source_order_item_id=work_log_payload.source_order_item_id,
            )
        )

    for payment_payload in salary_payments_to_insert:
        db.add(
            EmployeeSalaryPayment(
                tenant_id=actor.tenant_id,
                branch_id=employee.branch_id,
                employee_id=employee.id,
                legacy_id=payment_payload.id,
                amount=payment_payload.amount,
                payment_date=payment_payload.payment_date,
                recorded_at=payment_payload.recorded_at,
                note=payment_payload.note,
            )
        )


@router.get("", response_model=list[EmployeeRead])
def list_employees(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[Employee]:
    stmt = apply_branch_scope(
        select(Employee)
        .options(selectinload(Employee.work_logs), selectinload(Employee.salary_payments))
        .order_by(Employee.name.asc()),
        Employee,
        actor,
        branch_id,
    )
    return list(db.scalars(stmt))


@router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Employee:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    employee = Employee(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        name=payload.name,
        phone=payload.phone,
        type=payload.type,
        salary_source_branch_id=payload.salary_source_branch_id,
        piece_rates=_normalize_piece_rates(payload.piece_rates),
        branch_piece_rate_history=_normalize_branch_piece_rate_history(payload.branch_piece_rate_history),
        joined_date=payload.joined_date,
    )
    db.add(employee)
    db.flush()
    _replace_employee_children(db, actor, employee, payload)
    db.commit()
    return _get_employee_or_404(db, actor, employee.id)


@router.put("/{employee_id}", response_model=EmployeeRead)
def update_employee(
    employee_id: uuid.UUID,
    payload: EmployeeCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Employee:
    employee = _get_employee_or_404(db, actor, employee_id)
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or employee.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    employee.branch_id = scoped_branch_id
    employee.name = payload.name
    employee.phone = payload.phone
    employee.type = payload.type
    employee.salary_source_branch_id = payload.salary_source_branch_id
    employee.piece_rates = _normalize_piece_rates(payload.piece_rates)
    employee.branch_piece_rate_history = _normalize_branch_piece_rate_history(payload.branch_piece_rate_history)
    employee.joined_date = payload.joined_date
    _replace_employee_children(db, actor, employee, payload)
    db.commit()
    return _get_employee_or_404(db, actor, employee.id)


@router.get("/attendance/today", response_model=list[EmployeeAttendanceRead])
def list_today_attendance(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[EmployeeAttendanceRead]:
    employees = list(
        db.scalars(
            apply_branch_scope(
                select(Employee).order_by(Employee.name.asc()),
                Employee,
                actor,
                branch_id,
            )
        )
    )
    employee_ids = [employee.id for employee in employees]
    today = _today()
    attendance_rows = list(
        db.scalars(
            select(EmployeeAttendance).where(
                EmployeeAttendance.tenant_id == actor.tenant_id,
                EmployeeAttendance.employee_id.in_(employee_ids),
                EmployeeAttendance.attendance_date == today,
            )
        )
    ) if employee_ids else []
    attendance_by_employee = {row.employee_id: row for row in attendance_rows}
    worked_day_counts = _attendance_worked_day_counts(db, actor, employee_ids)

    return [
        _serialize_attendance(employee, attendance_by_employee.get(employee.id), worked_day_counts.get(employee.id, 0))
        for employee in employees
    ]


@router.get("/attendance/today-checked-in", response_model=list[TodayCheckedInEmployeeRead])
def list_today_checked_in_employees(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[TodayCheckedInEmployeeRead]:
    employee_stmt = apply_branch_scope(select(Employee.id), Employee, actor, branch_id)
    scoped_employee_ids = list(db.scalars(employee_stmt))
    if not scoped_employee_ids:
        return []

    rows = db.execute(
        select(EmployeeAttendance, Employee)
        .join(Employee, Employee.id == EmployeeAttendance.employee_id)
        .where(
            EmployeeAttendance.tenant_id == actor.tenant_id,
            EmployeeAttendance.employee_id.in_(scoped_employee_ids),
            EmployeeAttendance.attendance_date == _today(),
            EmployeeAttendance.check_in_at.is_not(None),
        )
        .order_by(EmployeeAttendance.check_in_at.asc())
    ).all()

    return [
        TodayCheckedInEmployeeRead(
            employee_id=employee.id,
            employee_name=employee.name,
            branch_id=employee.branch_id,
            check_in_at=attendance.check_in_at,
        )
        for attendance, employee in rows
        if attendance.check_in_at is not None
    ]


@router.post("/{employee_id}/attendance/check-in", response_model=EmployeeAttendanceRead)
def check_in_employee(
    employee_id: uuid.UUID,
    payload: EmployeeAttendanceCheckInInput | None = None,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> EmployeeAttendanceRead:
    employee = _get_employee_or_404(db, actor, employee_id)
    target_date = payload.attendance_date if (payload and payload.attendance_date) else _today()
    target_time = payload.check_in_at if (payload and payload.check_in_at) else _now()

    attendance = _get_date_attendance(db, actor, employee.id, target_date)
    if attendance and attendance.check_in_at:
        attendance.check_in_at = target_time
        db.commit()
        db.refresh(attendance)
        worked_days = _attendance_worked_day_counts(db, actor, [employee.id]).get(employee.id, 0)
        return _serialize_attendance(employee, attendance, worked_days)

    if not attendance:
        attendance = EmployeeAttendance(
            tenant_id=actor.tenant_id,
            branch_id=employee.branch_id,
            employee_id=employee.id,
            attendance_date=target_date,
            created_by=actor.id,
        )
        db.add(attendance)

    attendance.check_in_at = target_time

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        attendance = _get_date_attendance(db, actor, employee.id, target_date)
        if not attendance:
            raise
        attendance.check_in_at = target_time
        db.commit()

    db.refresh(attendance)
    worked_days = _attendance_worked_day_counts(db, actor, [employee.id]).get(employee.id, 0)
    return _serialize_attendance(employee, attendance, worked_days)


@router.post("/{employee_id}/attendance/check-out", response_model=EmployeeAttendanceRead)
def check_out_employee(
    employee_id: uuid.UUID,
    payload: EmployeeAttendanceCheckOutInput | None = None,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> EmployeeAttendanceRead:
    employee = _get_employee_or_404(db, actor, employee_id)
    target_date = payload.attendance_date if (payload and payload.attendance_date) else _today()
    target_time = payload.check_out_at if (payload and payload.check_out_at) else _now()

    attendance = _get_date_attendance(db, actor, employee.id, target_date)
    if not attendance or not attendance.check_in_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee must check in before check out")

    attendance.check_out_at = target_time
    attendance.checked_out_by = actor.id
    db.commit()
    db.refresh(attendance)

    worked_days = _attendance_worked_day_counts(db, actor, [employee.id]).get(employee.id, 0)
    return _serialize_attendance(employee, attendance, worked_days)


@router.get("/{employee_id}/attendance/history", response_model=list[EmployeeAttendanceRead])
def list_employee_attendance_history(
    employee_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[EmployeeAttendanceRead]:
    employee = _get_employee_or_404(db, actor, employee_id)
    rows = list(
        db.scalars(
            select(EmployeeAttendance)
            .where(
                EmployeeAttendance.tenant_id == actor.tenant_id,
                EmployeeAttendance.employee_id == employee.id,
            )
            .order_by(EmployeeAttendance.attendance_date.desc(), EmployeeAttendance.check_in_at.desc())
        )
    )
    worked_days = _attendance_worked_day_counts(db, actor, [employee.id]).get(employee.id, 0)
    return [_serialize_attendance(employee, row, worked_days) for row in rows]


@router.post("/{employee_id}/work-logs", response_model=EmployeeWorkLogRead, status_code=status.HTTP_201_CREATED)
def create_employee_work_log(
    employee_id: uuid.UUID,
    payload: EmployeeWorkLogInput,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> EmployeeWorkLog:
    employee = _get_employee_or_404(db, actor, employee_id)
    work_log = None
    legacy_id = _get_work_log_legacy_id(employee, payload)
    if legacy_id:
        work_log = db.scalar(
            select(EmployeeWorkLog).where(
                EmployeeWorkLog.employee_id == employee.id,
                EmployeeWorkLog.tenant_id == actor.tenant_id,
                EmployeeWorkLog.legacy_id == legacy_id,
            )
        )

    if not work_log:
        work_log = EmployeeWorkLog()
        db.add(work_log)

    _apply_work_log_payload(work_log, employee, actor, payload)
    db.commit()
    db.refresh(work_log)
    return work_log


@router.put("/{employee_id}/work-logs/{work_log_id}", response_model=EmployeeWorkLogRead)
def update_employee_work_log(
    employee_id: uuid.UUID,
    work_log_id: str,
    payload: EmployeeWorkLogInput,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> EmployeeWorkLog:
    employee = _get_employee_or_404(db, actor, employee_id)
    work_log = _get_employee_work_log_or_404(db, actor, employee, work_log_id)
    _apply_work_log_payload(work_log, employee, actor, payload)
    db.commit()
    db.refresh(work_log)
    return work_log


@router.delete("/{employee_id}/work-logs/{work_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee_work_log(
    employee_id: uuid.UUID,
    work_log_id: str,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    employee = _get_employee_or_404(db, actor, employee_id)
    work_log = _get_employee_work_log_or_404(db, actor, employee, work_log_id)
    db.delete(work_log)
    db.commit()


@router.post("/{employee_id}/salary-payments", response_model=EmployeeSalaryPaymentRead, status_code=status.HTTP_201_CREATED)
def create_employee_salary_payment(
    employee_id: uuid.UUID,
    payload: EmployeeSalaryPaymentInput,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> EmployeeSalaryPayment:
    employee = _get_employee_or_404(db, actor, employee_id)
    payment = None
    if payload.id:
        payment = db.scalar(
            select(EmployeeSalaryPayment).where(
                EmployeeSalaryPayment.employee_id == employee.id,
                EmployeeSalaryPayment.tenant_id == actor.tenant_id,
                EmployeeSalaryPayment.legacy_id == payload.id,
            )
        )

    if not payment:
        payment = EmployeeSalaryPayment()
        db.add(payment)

    _apply_salary_payment_payload(payment, employee, actor, payload)
    db.commit()
    db.refresh(payment)
    return payment


@router.put("/{employee_id}/salary-payments/{payment_id}", response_model=EmployeeSalaryPaymentRead)
def update_employee_salary_payment(
    employee_id: uuid.UUID,
    payment_id: str,
    payload: EmployeeSalaryPaymentInput,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> EmployeeSalaryPayment:
    employee = _get_employee_or_404(db, actor, employee_id)
    payment = _get_employee_salary_payment_or_404(db, actor, employee, payment_id)
    _apply_salary_payment_payload(payment, employee, actor, payload)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{employee_id}/salary-payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee_salary_payment(
    employee_id: uuid.UUID,
    payment_id: str,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    employee = _get_employee_or_404(db, actor, employee_id)
    payment = _get_employee_salary_payment_or_404(db, actor, employee, payment_id)
    db.delete(payment)
    db.commit()


@router.delete("/{employee_id}/clear-details", status_code=status.HTTP_204_NO_CONTENT)
def clear_employee_details(
    employee_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    employee = _get_employee_or_404(db, actor, employee_id)

    db.execute(
        delete(EmployeeWorkLog).where(
            EmployeeWorkLog.employee_id == employee.id,
            EmployeeWorkLog.tenant_id == actor.tenant_id,
        )
    )
    db.execute(
        delete(EmployeeSalaryPayment).where(
            EmployeeSalaryPayment.employee_id == employee.id,
            EmployeeSalaryPayment.tenant_id == actor.tenant_id,
        )
    )
    db.commit()


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    employee = _get_employee_or_404(db, actor, employee_id)
    db.delete(employee)
    db.commit()
