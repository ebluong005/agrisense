"""Deterministic stand-in for the NASA POWER daily point API (browser tests only).

Values depend only on the date, so tests can compute expected totals:
  * PRECTOTCORR: 6.0 mm on days whose day-of-year is divisible by 5, else 0.0 mm;
    0.0 mm for the 10 days before the last 3 requested days (a dry spell -> alert);
  * T2M = 15.0, T2M_MIN = 8.0, T2M_MAX = 22.0;
  * the last 3 requested days are -999 (NASA publishes with a delay).
Test controls: GET /__count (requests served),
GET /__fail?n=3&lat=30.3 (next n requests for that latitude return 503; scoped so other tests are unaffected).
Usage: python fake_nasa.py <port>
"""

import json
import sys
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DELAY_DAYS = 3
DRY_DAYS = 10


def build(start: date, end: date) -> dict:
    days = [start + timedelta(n) for n in range((end - start).days + 1)]
    params = {"PRECTOTCORR": {}, "T2M": {}, "T2M_MIN": {}, "T2M_MAX": {}}
    for d in days:
        key = d.strftime("%Y%m%d")
        delayed = (end - d).days < DELAY_DAYS
        dry = DELAY_DAYS <= (end - d).days < DELAY_DAYS + DRY_DAYS
        rain = 6.0 if d.timetuple().tm_yday % 5 == 0 else 0.0
        params["PRECTOTCORR"][key] = -999.0 if delayed else (0.0 if dry else rain)
        params["T2M"][key] = -999.0 if delayed else 15.0
        params["T2M_MIN"][key] = -999.0 if delayed else 8.0
        params["T2M_MAX"][key] = -999.0 if delayed else 22.0
    return {"header": {"fill_value": -999.0, "title": "FAKE NASA POWER"}, "properties": {"parameter": params}}


STATE: dict = {"count": 0, "fail": {}}  # fail: latitude string -> remaining failures


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/__count":
            return self._json(200, {"count": STATE["count"]})
        if url.path == "/__fail":
            STATE["fail"][q["lat"][0]] = int(q["n"][0])
            return self._json(200, STATE)
        STATE["count"] += 1
        lat = q.get("latitude", [""])[0]
        if STATE["fail"].get(lat, 0) > 0:
            STATE["fail"][lat] -= 1
            return self._json(503, {"error": "fake outage"})
        start = datetime.strptime(q["start"][0], "%Y%m%d").date()
        end = datetime.strptime(q["end"][0], "%Y%m%d").date()
        self._json(200, build(start, end))

    def log_message(self, *args):  # keep test output quiet
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
