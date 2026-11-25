#!/usr/bin/env python3
"""Post-deployment smoke test. Standard library only (no installs needed in CI).

Read-only checks (all environments):
  * API /health (liveness) and /ready (database reachable)
  * frontend serves the SPA (index.html with the root element), including a deep link
  * CORS: the API accepts the frontend's origin
Staging only (--write-checks, needs SMOKE_EMAIL / SMOKE_PASSWORD for a dedicated test account):
  * sign in (or register once), create a farm, fetch its weather summary, delete the farm.
    Weather may report a provider outage (502/503/504): logged as degraded, not a failure.

Usage:
  scripts/smoke_test.py --api https://api.example.com --web https://app.example.com [--write-checks]
Retries each check while a fresh deploy warms up (Render free instances can take ~1 min to wake).
"""

from __future__ import annotations  # runs on Python 3.9+ (macOS system python)

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

TIMEOUT = 30


def request(method: str, url: str, body: dict | None = None, headers: dict | None = None) -> tuple[int, dict, str]:
    data = json.dumps(body).encode() if body is not None else None
    base = {"User-Agent": "agrisense-smoke-test"}
    # Vercel Deployment Protection: "Protection Bypass for Automation" secret, if previews are protected.
    if os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET"):
        base["x-vercel-protection-bypass"] = os.environ["VERCEL_AUTOMATION_BYPASS_SECRET"]
    req = urllib.request.Request(url, data=data, method=method, headers={**base, **(headers or {})})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, dict(r.headers), r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode(errors="replace")


def check(name: str, fn, attempts: int = 1, delay: float = 10) -> None:
    for attempt in range(1, attempts + 1):
        try:
            fn()
            print(f"PASS  {name}")
            return
        except (AssertionError, urllib.error.URLError, TimeoutError, ConnectionError, ValueError, KeyError) as exc:
            if attempt == attempts:
                print(f"FAIL  {name}: {exc}")
                raise SystemExit(1) from exc
            print(f"wait  {name} (attempt {attempt}/{attempts}): {exc}")
            time.sleep(delay)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", required=True, help="API origin, e.g. https://agrisense-api.onrender.com")
    ap.add_argument("--web", help="Frontend URL; omit to skip frontend checks")
    ap.add_argument("--write-checks", action="store_true", help="staging only: authenticated create/read/delete flow")
    ap.add_argument("--attempts", type=int, default=12, help="retries for the first check while the service wakes")
    args = ap.parse_args()
    api, web = args.api.rstrip("/"), (args.web or "").rstrip("/")

    def health():
        status, _, body = request("GET", f"{api}/health")
        assert status == 200 and json.loads(body).get("status") == "healthy", f"/health -> {status} {body[:120]}"

    def ready():
        status, _, body = request("GET", f"{api}/ready")
        assert status == 200, f"/ready -> {status} {body[:120]} (database unreachable?)"

    check("API /health", health, attempts=args.attempts)
    check("API /ready (database)", ready, attempts=3)

    if web:

        def spa():
            for path in ("/", "/farms/123"):  # deep link must be rewritten to index.html
                status, _, body = request("GET", web + path)
                assert status == 200 and 'id="root"' in body, f"{path} -> {status}"

        def cors():
            origin = "/".join(web.split("/")[:3])
            status, headers, _ = request(
                "OPTIONS", f"{api}/api/v1/farms", headers={"Origin": origin, "Access-Control-Request-Method": "GET"}
            )
            allowed = {k.lower(): v for k, v in headers.items()}.get("access-control-allow-origin")
            assert allowed == origin, f"API does not allow origin {origin} (got {allowed!r}, HTTP {status}); check CORS_ORIGINS / CORS_ORIGIN_REGEX"

        check("frontend serves the app (incl. deep link)", spa, attempts=3)
        check("CORS allows the frontend origin", cors)

    if args.write_checks:
        email, password = os.environ.get("SMOKE_EMAIL"), os.environ.get("SMOKE_PASSWORD")
        if not email or not password:
            print("FAIL  write checks need SMOKE_EMAIL and SMOKE_PASSWORD")
            raise SystemExit(1)
        state: dict = {}

        def sign_in():
            status, _, body = request("POST", f"{api}/api/v1/auth/login", {"email": email, "password": password})
            if status == 401:  # first run against a fresh database
                status, _, body = request("POST", f"{api}/api/v1/auth/register", {"email": email, "password": password})
            assert status in (200, 201), f"sign-in -> {status} {body[:120]}"
            state["auth"] = {"Authorization": "Bearer " + json.loads(body)["access_token"]}

        def create_farm():
            name = f"smoke-{uuid.uuid4().hex[:8]}"
            status, _, body = request("POST", f"{api}/api/v1/farms", {"name": name, "latitude": 41.5868, "longitude": -93.625}, state["auth"])
            assert status == 201, f"create farm -> {status} {body[:120]}"
            state["farm"] = json.loads(body)["id"]

        def weather():
            status, _, body = request("GET", f"{api}/api/v1/farms/{state['farm']}/weather/summary", headers=state["auth"])
            if status in (502, 503, 504):
                print(f"WARN  weather provider degraded ({status}): {body[:160]}")
                return
            assert status == 200, f"weather summary -> {status} {body[:120]}"
            summary = json.loads(body)
            assert summary["source"]["name"] == "NASA POWER" and "freshness" in summary, "unexpected weather payload"

        def delete_farm():
            status, _, body = request("DELETE", f"{api}/api/v1/farms/{state['farm']}", headers=state["auth"])
            assert status == 204, f"delete farm -> {status} {body[:120]}"

        check("sign in (smoke account)", sign_in)
        check("create farm", create_farm)
        try:
            check("weather summary", weather, attempts=2, delay=15)
        finally:
            check("delete smoke farm", delete_farm)

    print("Smoke test passed.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
