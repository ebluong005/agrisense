import logging
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from shapely.geometry import shape
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from . import nasa_power, weather
from .auth import check_password, current_user, hash_password, token_for
from .config import Settings, get_settings
from .database import get_db
from .geometry import validate_boundary
from .models import Farm, Field, User
from .satellite import field_ndvi
from .schemas import (
    FarmIn,
    FarmOut,
    FieldIn,
    FieldOut,
    Login,
    Register,
    TokenResponse,
    WeatherResponse,
    WeatherSummary,
)

logger = logging.getLogger(__name__)

# The schema is owned by Alembic: run `python -m alembic upgrade head` before
# starting the API. The app never creates tables itself.
app = FastAPI(title="AgriSense API", version="1.0.0")


def add_cors(target: FastAPI, settings: Settings) -> None:
    """Explicit origins, plus an optional anchored regex for per-deploy preview URLs."""
    target.add_middleware(
        CORSMiddleware,
        allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )


add_cors(app, get_settings())


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/ready")
def ready(db: Session = Depends(get_db)):
    """Readiness: the API can reach its database. Liveness stays on /health."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Database readiness check failed")
        raise HTTPException(503, "Database unavailable") from None
    return {"status": "ready"}


@app.post("/api/v1/auth/register", response_model=TokenResponse, status_code=201)
def register(body: Register, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if "@" not in email or email.startswith("@") or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Provide a valid email address")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=token_for(user))


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(body: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not check_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return TokenResponse(access_token=token_for(user))


@app.get("/api/v1/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email}


def owned_farm(farm_id: int, db: Session, user: User):
    farm = db.get(Farm, farm_id)
    if not farm or farm.owner_id != user.id:
        raise HTTPException(404, "Farm not found")
    return farm


def owned_field(field_id: int, db: Session, user: User):
    field = db.get(Field, field_id)
    if not field:
        raise HTTPException(404, "Field not found")
    owned_farm(field.farm_id, db, user)
    return field


@app.get("/api/v1/farms", response_model=list[FarmOut])
def farms(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(Farm).where(Farm.owner_id == user.id).order_by(Farm.id.desc())).all()


@app.post("/api/v1/farms", response_model=FarmOut, status_code=201)
def create_farm(body: FarmIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    farm = Farm(owner_id=user.id, **body.model_dump())
    db.add(farm)
    db.commit()
    db.refresh(farm)
    return farm


@app.get("/api/v1/farms/{farm_id}", response_model=FarmOut)
def farm_detail(farm_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return owned_farm(farm_id, db, user)


@app.put("/api/v1/farms/{farm_id}", response_model=FarmOut)
def edit_farm(farm_id: int, body: FarmIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    farm = owned_farm(farm_id, db, user)
    for k, v in body.model_dump().items():
        setattr(farm, k, v)
    db.commit()
    db.refresh(farm)
    return farm


@app.delete("/api/v1/farms/{farm_id}", status_code=204)
def delete_farm(farm_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_farm(farm_id, db, user))
    db.commit()


@app.get("/api/v1/farms/{farm_id}/fields", response_model=list[FieldOut])
def fields(farm_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_farm(farm_id, db, user)
    return db.scalars(select(Field).where(Field.farm_id == farm_id).order_by(Field.id.desc())).all()


@app.post("/api/v1/farms/{farm_id}/fields", response_model=FieldOut, status_code=201)
def create_field(
    farm_id: int, body: FieldIn, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    owned_farm(farm_id, db, user)
    area = validate_boundary(body.boundary)
    field = Field(
        farm_id=farm_id,
        name=body.name,
        crop_type=body.crop_type,
        planting_date=body.planting_date.isoformat() if body.planting_date else None,
        boundary=body.boundary,
        area_hectares=area,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@app.put("/api/v1/fields/{field_id}", response_model=FieldOut)
def edit_field(
    field_id: int, body: FieldIn, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    field = owned_field(field_id, db, user)
    field.name = body.name
    field.crop_type = body.crop_type
    field.planting_date = body.planting_date.isoformat() if body.planting_date else None
    field.area_hectares = validate_boundary(body.boundary)
    field.boundary = body.boundary
    db.commit()
    db.refresh(field)
    return field


@app.delete("/api/v1/fields/{field_id}", status_code=204)
def delete_field(field_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_field(field_id, db, user))
    db.commit()


# ---------------------------------------------------------------- weather
# Plain `def` routes: FastAPI runs them in a worker thread, so the sync DB session and the
# blocking HTTP call to NASA POWER never stall the event loop.


def weather_error(exc: nasa_power.ProviderError) -> HTTPException:
    if isinstance(exc, nasa_power.ProviderTimeout):
        status = 504
    elif isinstance(exc, nasa_power.ProviderInvalidResponse):
        status = 502
    else:
        status = 503
    return HTTPException(status, f"{exc.message} Please try again later.")


def validate_range(start: date, end: date) -> None:
    today = weather.utcnow().date()
    if start > end:
        raise HTTPException(400, "The start date must be on or before the end date.")
    if end > today:
        raise HTTPException(400, "Future dates are not supported: weather history only.")
    if (end - start).days > 365:
        raise HTTPException(400, "The date range can be at most 366 days.")
    if start < nasa_power.FIRST_AVAILABLE_DATE:
        raise HTTPException(
            400, f"NASA POWER daily data starts on {nasa_power.FIRST_AVAILABLE_DATE.isoformat()}."
        )


def history_response(latitude: float, longitude: float, start: date, end: date, db: Session) -> dict:
    validate_range(start, end)
    try:
        series = weather.get_daily(db, latitude, longitude, start, end)
    except nasa_power.ProviderError as exc:
        raise weather_error(exc) from exc
    return {
        "latitude": series.latitude,
        "longitude": series.longitude,
        "source": nasa_power.SOURCE_NAME,
        "daily": [
            {"date": d.day, "temperature_c": d.temperature_c, "precipitation_mm": d.precipitation_mm}
            for d in series.days
        ],
    }


@app.get("/api/v1/weather/history", response_model=WeatherResponse)
def weather_coordinates(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    start: date = Query(),
    end: date = Query(),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    return history_response(latitude, longitude, start, end, db)


@app.get("/api/v1/farms/{farm_id}/weather", response_model=WeatherResponse)
def farm_weather(
    farm_id: int,
    start: date = Query(),
    end: date = Query(),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    farm = owned_farm(farm_id, db, user)
    return history_response(farm.latitude, farm.longitude, start, end, db)


def summary_response(db: Session, latitude: float, longitude: float, target: dict) -> dict:
    try:
        return {**weather.summary_for_point(db, latitude, longitude), "target": target}
    except nasa_power.ProviderError as exc:
        raise weather_error(exc) from exc


@app.get("/api/v1/farms/{farm_id}/weather/summary", response_model=WeatherSummary)
def farm_weather_summary(farm_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Last 30 days of rainfall and temperature for the farm's location, with alerts and freshness."""
    farm = owned_farm(farm_id, db, user)
    target = {"kind": "farm", "id": farm.id, "name": farm.name, "basis": "the farm's location"}
    return summary_response(db, farm.latitude, farm.longitude, target)


@app.get("/api/v1/fields/{field_id}/weather/summary", response_model=WeatherSummary)
def field_weather_summary(field_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Same as the farm summary, estimated at the centre of the field's boundary."""
    field = owned_field(field_id, db, user)
    center = shape(field.boundary).centroid
    target = {
        "kind": "field",
        "id": field.id,
        "name": field.name,
        "basis": "the centre of the field boundary",
    }
    return summary_response(db, center.y, center.x, target)


@app.get("/api/v1/farms/{farm_id}/alerts")
def farm_alerts(farm_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Backwards-compatible alert list; the summary endpoint has the full evidence."""
    farm = owned_farm(farm_id, db, user)
    target = {"kind": "farm", "id": farm.id, "name": farm.name, "basis": "the farm's location"}
    summary = summary_response(db, farm.latitude, farm.longitude, target)
    return {
        "source": nasa_power.SOURCE_NAME,
        "alerts": [
            {
                "kind": a["code"].lower(),
                "title": a["title"],
                "details": f"{a['explanation']} {a['limitations']}",
                "observed_on": a["evidence"]["window_end"].isoformat(),
            }
            for a in summary["alerts"]
        ],
        "note": "Rules-based prompts to check a field; not diagnoses, drought classifications or irrigation advice.",
    }


@app.get("/api/v1/fields/{field_id}/ndvi")
async def ndvi(
    field_id: int,
    start: date = Query(),
    end: date = Query(),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    field = owned_field(field_id, db, user)
    return await field_ndvi(field.boundary, start, end)
