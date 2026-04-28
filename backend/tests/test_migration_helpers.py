from migrate_legacy_json import collect_branch_codes, normalize_branch_code, normalize_completion_status, normalize_order_status
from backend.app.models import CompletionStatus, OrderStatus


def test_normalize_branch_code_uses_default_for_blank_values() -> None:
    assert normalize_branch_code(None, "MAIN") == "MAIN"
    assert normalize_branch_code("", "MAIN") == "MAIN"
    assert normalize_branch_code("br001", "MAIN") == "BR001"


def test_status_normalizers_preserve_supported_values() -> None:
    assert normalize_order_status("Delivered") == OrderStatus.DELIVERED
    assert normalize_completion_status("partial") == CompletionStatus.PARTIAL


def test_collect_branch_codes_uses_only_default_branch() -> None:
    payload = {
        "customers": [{"id": "C1"}],
        "orders": [{"id": "O1", "payments": [{"id": "P1", "branchId": "br002"}]}],
        "inventory": [],
        "expenses": [],
        "materialSales": [],
        "employees": [],
        "suppliers": [],
    }

    assert collect_branch_codes(payload, "MAIN") == {"MAIN"}
