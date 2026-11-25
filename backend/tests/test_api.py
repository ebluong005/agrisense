from helpers import register


def test_auth_and_farm_crud(client):
    headers = register(client)
    assert client.get("/api/v1/farms").status_code == 401
    resp = client.post(
        "/api/v1/farms",
        headers=headers,
        json={"name": "Tucson Farm", "latitude": 32.22, "longitude": -110.97},
    )
    assert resp.status_code == 201, resp.text
    farm_id = resp.json()["id"]
    assert len(client.get("/api/v1/farms", headers=headers).json()) == 1
    edit = client.put(
        f"/api/v1/farms/{farm_id}",
        headers=headers,
        json={"name": "New name", "latitude": 32.22, "longitude": -110.97},
    )
    assert edit.json()["name"] == "New name"
    second = register(client, "other@example.com")
    assert client.get(f"/api/v1/farms/{farm_id}", headers=second).status_code == 404
    assert client.delete(f"/api/v1/farms/{farm_id}", headers=headers).status_code == 204
    assert client.get("/api/v1/farms", headers=headers).json() == []


def test_field_polygon_and_owner_isolation(client):
    headers = register(client)
    farm = client.post(
        "/api/v1/farms", headers=headers, json={"name": "Test", "latitude": 32.2, "longitude": -110.9}
    ).json()
    polygon = {
        "type": "Polygon",
        "coordinates": [
            [[-110.98, 32.20], [-110.97, 32.20], [-110.97, 32.21], [-110.98, 32.21], [-110.98, 32.20]]
        ],
    }
    r = client.post(
        f"/api/v1/farms/{farm['id']}/fields",
        headers=headers,
        json={"name": "South", "crop_type": "Wheat", "boundary": polygon},
    )
    assert r.status_code == 201, r.text
    assert r.json()["area_hectares"] > 0
    assert len(client.get(f"/api/v1/farms/{farm['id']}/fields", headers=headers).json()) == 1
    wrong = client.post(
        f"/api/v1/farms/{farm['id']}/fields",
        headers=headers,
        json={"name": "Broken", "boundary": {"type": "Point", "coordinates": [0, 0]}},
    )
    assert wrong.status_code == 422
    outsider = register(client, "someoneelse@example.com")
    assert client.delete(f"/api/v1/fields/{r.json()['id']}", headers=outsider).status_code == 404


def test_weather_date_validation(client):
    headers = register(client)
    result = client.get(
        "/api/v1/weather/history?latitude=32&longitude=-111&start=2026-10-08&end=2026-10-01", headers=headers
    )
    assert result.status_code == 400
    result = client.get(
        "/api/v1/weather/history?latitude=132&longitude=-111&start=2026-10-01&end=2026-10-08", headers=headers
    )
    assert result.status_code == 422


def test_ndvi_missing_credentials(client):
    headers = register(client)
    f = client.post(
        "/api/v1/farms", headers=headers, json={"name": "Test", "latitude": 32.2, "longitude": -110.9}
    ).json()
    polygon = {
        "type": "Polygon",
        "coordinates": [
            [[-110.98, 32.20], [-110.97, 32.20], [-110.97, 32.21], [-110.98, 32.21], [-110.98, 32.20]]
        ],
    }
    field = client.post(
        f"/api/v1/farms/{f['id']}/fields", headers=headers, json={"name": "Field", "boundary": polygon}
    ).json()
    r = client.get(f"/api/v1/fields/{field['id']}/ndvi?start=2026-09-01&end=2026-09-30", headers=headers)
    assert r.status_code == 503
