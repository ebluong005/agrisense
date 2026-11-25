#!/usr/bin/env python3
"""Deploy an exact Git commit to a Render web service, wait for the result, or roll back.

Standard library only. Uses the Render public API (https://api-docs.render.com):
  POST /v1/services/{id}/deploys   {"commitId": sha, "clearCache": "do_not_clear"}
  GET  /v1/services/{id}/deploys/{deployId}
  POST /v1/services/{id}/rollback  {"deployId": id}

  RENDER_API_KEY=... scripts/render_deploy.py deploy   --service srv-xxx --commit <sha>
  RENDER_API_KEY=... scripts/render_deploy.py rollback --service srv-xxx [--deploy dep-xxx]

`deploy` writes previous_deploy_id / deploy_id to $GITHUB_OUTPUT (when set), so a failed
release knows exactly which deploy to roll back to.
"""

from __future__ import annotations  # runs on Python 3.9+ (macOS system python)

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("RENDER_API_BASE", "https://api.render.com/v1")  # override only for tests
DONE_OK = {"live"}
DONE_BAD = {"build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"}
POLL_SECONDS = float(os.environ.get("RENDER_POLL_SECONDS", "15"))
TIMEOUT_SECONDS = 25 * 60


def call(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    key = os.environ.get("RENDER_API_KEY")
    if not key:
        sys.exit("RENDER_API_KEY is not set")
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        sys.exit(f"Render API {method} {path} -> HTTP {e.code}: {detail}")


def deploys(service: str, limit: int = 20) -> list[dict]:
    _, items = call("GET", f"/services/{service}/deploys?limit={limit}")
    return [item.get("deploy", item) for item in (items or [])]  # list items may wrap the deploy object


def output(**values: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    for k, v in values.items():
        print(f"{k}={v}")
        if path:
            with open(path, "a") as f:
                f.write(f"{k}={v}\n")


def wait(service: str, deploy_id: str) -> None:
    deadline = time.time() + TIMEOUT_SECONDS
    last = None
    while time.time() < deadline:
        _, d = call("GET", f"/services/{service}/deploys/{deploy_id}")
        status = d.get("status")
        if status != last:
            print(f"deploy {deploy_id}: {status}", flush=True)
            last = status
        if status in DONE_OK:
            return
        if status in DONE_BAD:
            sys.exit(f"Deploy {deploy_id} ended with status '{status}'. Check the Render dashboard logs.")
        time.sleep(POLL_SECONDS)
    sys.exit(f"Timed out after {TIMEOUT_SECONDS // 60} min waiting for deploy {deploy_id} (last status: {last}).")


def cmd_deploy(service: str, commit: str) -> None:
    previous = next((d for d in deploys(service) if d.get("status") == "live"), None)
    output(previous_deploy_id=previous["id"] if previous else "")
    status, created = call("POST", f"/services/{service}/deploys", {"commitId": commit, "clearCache": "do_not_clear"})
    deploy_id = (created or {}).get("id") if isinstance(created, dict) else None
    if not deploy_id:  # 202 "Queued" may have no body: find our deploy by commit
        for _ in range(20):
            match = next((d for d in deploys(service) if (d.get("commit") or {}).get("id") == commit), None)
            if match:
                deploy_id = match["id"]
                break
            time.sleep(5)
    if not deploy_id:
        sys.exit(f"Deploy was accepted (HTTP {status}) but could not be located for commit {commit}.")
    output(deploy_id=deploy_id)
    print(f"Deploying commit {commit} as {deploy_id}")
    wait(service, deploy_id)
    print("Deploy is live.")


def cmd_rollback(service: str, deploy_id: str | None) -> None:
    if not deploy_id:  # default: the newest successful deploy before the current one
        history = [d for d in deploys(service, 50) if d.get("status") in ("live", "deactivated") and d.get("finishedAt")]
        if len(history) < 2:
            sys.exit("No earlier successful deploy found to roll back to; pass --deploy explicitly.")
        deploy_id = history[1]["id"]
    print(f"Rolling back to {deploy_id}")
    _, d = call("POST", f"/services/{service}/rollback", {"deployId": deploy_id})
    new_id = (d or {}).get("id") if isinstance(d, dict) else None
    if new_id:
        wait(service, new_id)
    print("Rollback requested" + (" and live." if new_id else "; confirm in the Render dashboard."))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("deploy")
    d.add_argument("--service", required=True)
    d.add_argument("--commit", required=True)
    r = sub.add_parser("rollback")
    r.add_argument("--service", required=True)
    r.add_argument("--deploy", help="deploy id to restore (default: the previous successful deploy)")
    args = ap.parse_args()
    if args.cmd == "deploy":
        cmd_deploy(args.service, args.commit)
    else:
        cmd_rollback(args.service, args.deploy)


if __name__ == "__main__":
    main()
