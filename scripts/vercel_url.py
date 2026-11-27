#!/usr/bin/env python3
"""Print the deployment URL from `vercel deploy` stdout.

In non-interactive runs (CI) the Vercel CLI prints a JSON document ({"deployment": {"url": ...}})
instead of the bare URL; in a terminal it prints the URL. Accept both. Exit 1 if none is found.
"""

from __future__ import annotations

import json
import sys

raw = sys.stdin.read()
try:
    url = json.loads(raw)["deployment"]["url"]
except (ValueError, KeyError, TypeError):
    url = next((line.strip() for line in reversed(raw.splitlines()) if line.strip().startswith("https://")), "")
if not url:
    sys.exit("Could not find a deployment URL in the Vercel CLI output.")
print(url if url.startswith("https://") else f"https://{url}")
