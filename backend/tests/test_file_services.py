from __future__ import annotations

import base64
import json

import pytest

from backend.app.services.files import save_json_backup, save_pdf_export


def test_save_pdf_export_decodes_data_uri_and_appends_extension(tmp_path):
    pdf_bytes = b"%PDF-1.4\nfake\n"
    data_uri = f"data:application/pdf;base64,{base64.b64encode(pdf_bytes).decode('ascii')}"

    saved_path = save_pdf_export(data_uri, "invoice", downloads_dir=tmp_path)

    assert saved_path.name == "invoice.pdf"
    assert saved_path.read_bytes() == pdf_bytes


def test_save_json_backup_accepts_json_string_payload(tmp_path):
    payload = json.dumps({"orders": [{"id": 1}]})

    saved_path = save_json_backup(payload, filename="backup file", backup_dir=tmp_path)

    assert saved_path.name == "backup file.json"
    assert json.loads(saved_path.read_text(encoding="utf-8")) == {"orders": [{"id": 1}]}


def test_save_pdf_export_rejects_missing_payload(tmp_path):
    with pytest.raises(ValueError, match="No PDF data provided"):
        save_pdf_export("", "invoice.pdf", downloads_dir=tmp_path)
