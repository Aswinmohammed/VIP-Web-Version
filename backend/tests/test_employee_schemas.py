from __future__ import annotations

from backend.app.schemas import BranchPieceRateInput, EmployeeSalaryPaymentInput, EmployeeWorkLogInput


def test_employee_salary_payment_accepts_localized_recorded_at():
    payment = EmployeeSalaryPaymentInput(
        amount="100",
        payment_date="2026-04-20",
        recorded_at="20/04/2026, 12:01:18",
        note="cash",
    )

    assert payment.recorded_at is not None
    assert payment.recorded_at.isoformat() == "2026-04-20T12:01:18"


def test_employee_work_log_accepts_date_only_recorded_at():
    work_log = EmployeeWorkLogInput(
        dress_type="Shirt",
        quantity=1,
        unit_price="100",
        total_amount="100",
        work_date="2026-04-20",
        recorded_at="20/04/2026",
    )

    assert work_log.recorded_at is not None
    assert work_log.recorded_at.isoformat() == "2026-04-20T00:00:00"


def test_branch_piece_rate_accepts_iso_created_at():
    rate = BranchPieceRateInput(
        rate="125",
        effective_from="2026-04-20",
        created_at="2026-04-20T12:00:00Z",
    )

    assert rate.created_at is not None
    assert rate.created_at.isoformat() == "2026-04-20T12:00:00+00:00"
