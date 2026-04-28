from __future__ import annotations

import base64
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


_UNSAFE_FILENAME_CHARS = re.compile(r'[^A-Za-z0-9._ -]+')


def _sanitize_filename(filename: str, fallback_name: str) -> str:
    cleaned = _UNSAFE_FILENAME_CHARS.sub("_", filename).strip(" .")
    return cleaned or fallback_name


def save_pdf_export(pdf_base64: str, filename: str, downloads_dir: Path | None = None) -> Path:
    if not pdf_base64:
        raise ValueError("No PDF data provided")

    if "," in pdf_base64:
        pdf_base64 = pdf_base64.split(",", 1)[1]

    target_dir = downloads_dir or (Path.home() / "Downloads" / "VIP Bills")
    target_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _sanitize_filename(filename or "document.pdf", "document.pdf")
    if not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"

    file_path = target_dir / safe_name
    file_path.write_bytes(base64.b64decode(pdf_base64))
    return file_path


def save_json_backup(payload: Any, filename: str | None = None, backup_dir: Path | None = None) -> Path:
    if payload is None:
        raise ValueError("No backup data provided")

    actual_data = json.loads(payload) if isinstance(payload, str) else payload

    target_dir = backup_dir or (Path.home() / "Downloads" / "VIP Backups")
    target_dir.mkdir(parents=True, exist_ok=True)

    default_name = f"Tailor_Backup_{datetime.now().strftime('%Y-%m-%d')}.json"
    safe_name = _sanitize_filename(filename or default_name, default_name)
    if not safe_name.lower().endswith(".json"):
        safe_name = f"{safe_name}.json"

    file_path = target_dir / safe_name
    file_path.write_text(json.dumps(actual_data, indent=4), encoding="utf-8")
    return file_path
