from fastapi import HTTPException
from pyproj import Geod
from shapely.geometry import shape

_geod = Geod(ellps="WGS84")


def validate_boundary(geojson):
    try:
        geom = shape(geojson)
        if geom.geom_type != "Polygon" or geom.is_empty or not geom.is_valid:
            raise ValueError("Expected a valid, non-self-intersecting Polygon")
        coords = list(geom.exterior.coords)
        if len(coords) > 501 or len(coords) < 4:
            raise ValueError("Polygon must have between 3 and 500 vertices")
        if any(not (-180 <= lon <= 180 and -90 <= lat <= 90) for lon, lat in coords):
            raise ValueError("Coordinates outside valid geographic bounds")
        area, _ = _geod.geometry_area_perimeter(geom)
        area = abs(area) / 10_000
        if area < 0.001 or area > 100_000:
            raise ValueError("Field area must be between 0.001 and 100,000 hectares")
        return round(area, 4)
    except (ValueError, TypeError, IndexError, KeyError) as exc:
        raise HTTPException(422, f"Invalid field boundary: {exc}") from exc
