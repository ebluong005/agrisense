"""Optional Copernicus Data Space Sentinel Hub Statistical API integration.
Requires user-provided OAuth client credentials; no fabricated NDVI observations.
"""

from datetime import date, timedelta

import httpx
from fastapi import HTTPException

from .config import get_settings

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
STATS_URL = "https://sh.dataspace.copernicus.eu/statistics/v1"
EVALSCRIPT = """//VERSION=3
function setup() {
 return { input: [{bands:["B04","B08","SCL","dataMask"]}], output:[{id:"ndvi",bands:1,sampleType:"FLOAT32"},{id:"dataMask",bands:1}] };
}
function evaluatePixel(s) {
 let valid = s.dataMask === 1 && ![0,1,3,8,9,10,11].includes(s.SCL) && (s.B08+s.B04)>0;
 return {ndvi:[valid?(s.B08-s.B04)/(s.B08+s.B04):0], dataMask:[valid?1:0]};
}
"""


async def field_ndvi(geojson: dict, start: date, end: date):
    cfg = get_settings()
    if not cfg.copernicus_client_id or not cfg.copernicus_client_secret:
        raise HTTPException(
            503, "Copernicus NDVI requires COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET in backend/.env"
        )
    if start > end or end > date.today() or (end - start).days > 120:
        raise HTTPException(400, "NDVI date range must be historical, ordered, and at most 120 days")
    # Request sampling in geographic CRS over parcel; geometry is GeoJSON polygon.
    payload = {
        "input": {
            "bounds": {
                "geometry": geojson,
                "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"},
            },
            "data": [{"type": "sentinel-2-l2a", "dataFilter": {"mosaickingOrder": "leastCC"}}],
        },
        "aggregation": {
            "timeRange": {
                "from": start.isoformat() + "T00:00:00Z",
                "to": (end + timedelta(days=1)).isoformat() + "T00:00:00Z",
            },
            "aggregationInterval": {"of": "P7D"},
            "evalscript": EVALSCRIPT,
            "resx": 0.0001,
            "resy": 0.0001,
        },
        "calculations": {"default": {"statistics": {"default": {"percentiles": {"k": [25, 50, 75]}}}}},
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            token = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": cfg.copernicus_client_id,
                    "client_secret": cfg.copernicus_client_secret,
                },
            )
            token.raise_for_status()
            stats = await client.post(
                STATS_URL, json=payload, headers={"Authorization": "Bearer " + token.json()["access_token"]}
            )
            stats.raise_for_status()
            data = stats.json()
        points = []
        for item in data.get("data", []):
            try:
                metrics = item["outputs"]["ndvi"]["bands"]["B0"]["stats"]
                if metrics.get("sampleCount", 0) - metrics.get("noDataCount", 0) <= 0:
                    continue
                mean = metrics.get("mean")
                if mean is not None and -1 <= float(mean) <= 1:
                    points.append(
                        {
                            "date": item["interval"]["from"][:10],
                            "mean_ndvi": round(float(mean), 4),
                            "source": "Copernicus Sentinel-2 L2A",
                        }
                    )
            except (TypeError, KeyError, ValueError):
                continue
        return {
            "source": "Copernicus Sentinel-2 L2A",
            "observations": points,
            "note": "NDVI measures relative vegetation greenness, not disease or drought. Cloud-masked readings only.",
        }
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise HTTPException(
            502, "Copernicus request failed; verify credentials, processing quota, or API configuration"
        ) from exc
