"""Check the application boundary shared by development and production."""

import pytest
from fastapi.testclient import TestClient

from palinsesto.app import create_app
from palinsesto.web import serve


@pytest.fixture
def client(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<h1>Palinsesto</h1>")
    monkeypatch.setattr(serve, "FRONTEND_DIST", tmp_path)
    with TestClient(create_app()) as client:
        yield client


def test_liveness_is_available_with_frontend_mounted(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/", "/plan/review"])
def test_frontend_navigation_serves_the_app(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.text == "<h1>Palinsesto</h1>"


@pytest.mark.parametrize("path", ["/api/missing", "/assets/missing.js"])
def test_missing_api_and_assets_do_not_return_the_app(client, path):
    assert client.get(path).status_code == 404
