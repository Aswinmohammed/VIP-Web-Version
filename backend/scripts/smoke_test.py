from __future__ import annotations

import argparse
import json
import sys
from urllib import error, parse, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a hosted smoke test against the FastAPI API.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--tenant-code", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    return parser.parse_args()


def http_json(url: str, *, method: str = "GET", body: dict | None = None, token: str | None = None) -> tuple[int, object]:
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = request.Request(url, data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=20) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload) if payload else None
    except error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        detail = payload or exc.reason
        raise RuntimeError(f"{method} {url} failed with {exc.code}: {detail}") from exc


def main() -> None:
    args = parse_args()
    base_url = args.base_url.rstrip("/")

    checks: list[tuple[str, int]] = []

    status_code, health = http_json(f"{base_url}/health")
    checks.append(("GET /health", status_code))
    if not isinstance(health, dict) or health.get("status") != "ok":
        raise RuntimeError("Health endpoint did not return the expected payload.")

    status_code, login_payload = http_json(
        f"{base_url}/api/v1/auth/login",
        method="POST",
        body={
            "tenant_code": args.tenant_code,
            "username": args.username,
            "password": args.password,
        },
    )
    checks.append(("POST /api/v1/auth/login", status_code))
    if not isinstance(login_payload, dict) or "access_token" not in login_payload:
        raise RuntimeError("Login did not return an access token.")
    token = str(login_payload["access_token"])

    for path in (
        "/api/v1/branches",
        "/api/v1/orders",
        "/api/v1/employees",
        "/api/v1/reports/sales-summary",
        "/api/v1/reports/global-sales",
    ):
        status_code, _payload = http_json(f"{base_url}{path}", token=token)
        checks.append((f"GET {path}", status_code))

    print("Smoke test passed.")
    for label, status_code in checks:
        print(f"{status_code} {label}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
