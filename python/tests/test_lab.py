"""Public API checks: real acquisition, bounded work, and display/data parity."""

import base64
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import numpy as np
import pytest
from fastapi.testclient import TestClient

from storm_slides.lab import ExperimentSettings, create_app, run_experiment
from storm_slides.specimens import make_specimen


@pytest.fixture
def client():
    with TestClient(create_app(), base_url="http://127.0.0.1") as connection:
        yield connection


@pytest.mark.parametrize("kind", ["filaments", "rings", "clusters"])
def test_specimens_are_reproducible_and_inside_sensor(kind):
    points = make_specimen(kind, 220, 42)
    assert points.shape == (220, 2)
    np.testing.assert_array_equal(points, make_specimen(kind, 220, 42))
    assert np.all((points >= 6) & (points <= 57))


def test_real_api_acquisition_has_consistent_camera_and_fit_data(client):
    settings = {"frame_count": 20, "n_emitters": 40, "seed": 123}
    response = client.post("/api/experiment", json=settings)
    assert response.status_code == 200
    result = response.json()
    assert len(base64.b64decode(result["frames"])) == 20 * 64 * 64
    assert len(base64.b64decode(result["widefield"])) == 64 * 64
    fits = result["localizations"]
    count = len(fits["frame"])
    assert count > 0
    assert all(len(values) == count for values in fits.values())
    assert sum(result["counts_per_frame"]) == count
    assert len(result["active_per_frame"]) == 20
    assert max(fits["frame"]) < 20
    assert fits["frame"] == sorted(fits["frame"])
    assert result["median_precision_nm"] == np.median(fits["precision_nm"])
    shift = np.asarray(fits["frame"])[:, None] * result["model"]["drift_per_frame_px"]
    np.testing.assert_allclose(np.asarray(fits["xy"]) - fits["corrected_xy"], shift, atol=1e-12)
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_run_is_reproducible():
    settings = ExperimentSettings(frame_count=20, n_emitters=40)
    assert run_experiment(settings) == run_experiment(settings)


@pytest.mark.parametrize(
    "settings",
    [
        {"frame_count": 241},
        {"n_emitters": 100000},
        {"seed": -1},
        {"specimen": "unknown"},
        {"on_probability": 1},
        {"photon_mean": -1},
        {"background_lambda": 21},
        {"drift_nm": 5},
        {"camera_gain": 2},
        {"seed": 1.5},
        {"photon_mean": True},
    ],
)
def test_invalid_settings_are_rejected_before_work(client, settings):
    assert client.post("/api/experiment", json=settings).status_code == 422


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1e309", "-1e309"])
def test_nonfinite_json_is_rejected_cleanly(client, value):
    response = client.post(
        "/api/experiment",
        content='{"photon_mean":' + value + "}",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400


def test_request_size_type_origin_and_host_are_bounded(client):
    assert (
        client.post("/api/experiment", content="{}", headers={"Content-Type": "text/plain"}).status_code
        == 415
    )
    assert (
        client.post("/api/experiment", json={}, headers={"Origin": "https://unrelated.test"}).status_code
        == 403
    )
    assert (
        client.post(
            "/api/experiment", content=" " * 4097, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    assert client.get("/", headers={"Host": "unrelated.test"}).status_code == 400


def test_busy_acquisition_is_rejected_and_releases_slot(client, monkeypatch):
    entered, release = Event(), Event()

    def slow_acquisition(settings):
        entered.set()
        assert release.wait(timeout=5)
        return {"complete": True}

    monkeypatch.setattr("storm_slides.lab.run_experiment", slow_acquisition)
    with ThreadPoolExecutor(max_workers=1) as executor:
        running = executor.submit(client.post, "/api/experiment", json={})
        try:
            assert entered.wait(timeout=5)
            assert client.post("/api/experiment", json={}).status_code == 429
        finally:
            release.set()
        assert running.result(timeout=5).status_code == 200
    assert client.post("/api/experiment", json={}).status_code == 200


def test_static_app_is_packaged_and_paths_are_restricted(client):
    for path, content_type in [
        ("/", "text/html"),
        ("/app.js", "javascript"),
        ("/styles.css", "text/css"),
        ("/mark.svg", "image/svg+xml"),
    ]:
        response = client.get(path)
        assert response.status_code == 200
        assert content_type in response.headers["content-type"]
    assert client.get("/%2e%2e/models.py").status_code == 404
