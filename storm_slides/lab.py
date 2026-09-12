"""Loopback-only web application backed by the shared Python STORM engine."""

from __future__ import annotations

import argparse
import base64
import json
import math
from pathlib import Path
from threading import BoundedSemaphore

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from storm_slides.models import SimulationParams
from storm_slides.simulator import apply_drift_correction, localize_frame_stack, simulate_storm_frames
from storm_slides.specimens import Specimen, make_specimen

CANVAS_SIZE = 64
PIXEL_SIZE_NM = 100.0
PSF_SIGMA_PX = 1.2
WEB_ROOT = Path(__file__).with_name("web")


def reject_nonfinite_json(value: str) -> None:
    raise ValueError(f"Non-finite JSON value: {value}")


def finite_json_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed):
        raise ValueError("JSON number exceeds the supported finite range")
    return parsed


class ExperimentSettings(BaseModel):
    """Bounded acquisition settings; probabilities are per camera frame."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)

    specimen: Specimen = "filaments"
    n_emitters: int = Field(220, ge=40, le=360, strict=True)
    frame_count: int = Field(160, ge=20, le=240, strict=True)
    photon_mean: float = Field(1200, ge=100, le=4000)
    background_lambda: float = Field(2, ge=0, le=20)
    on_probability: float = Field(0.018, ge=0.005, le=0.12)
    drift_nm: float = Field(0.5, ge=0, le=4)
    seed: int = Field(42, ge=0, le=2**32 - 1, strict=True)


def encode_preview(values: np.ndarray, ceiling: float) -> str:
    """8-bit display pixels, scaled consistently across the whole acquisition."""
    pixels = np.rint(np.clip(values / max(ceiling, 1e-9), 0, 1) * 255).astype(np.uint8)
    return base64.b64encode(pixels.tobytes()).decode("ascii")


def run_experiment(settings: ExperimentSettings) -> dict:
    """Compute an acquisition and return display pixels plus full-precision fits."""
    drift_step = (settings.drift_nm / PIXEL_SIZE_NM, -0.35 * settings.drift_nm / PIXEL_SIZE_NM)
    params = SimulationParams(
        n_emitters=settings.n_emitters,
        frame_count=settings.frame_count,
        canvas_size_px=(CANVAS_SIZE, CANVAS_SIZE),
        photon_mean=settings.photon_mean,
        background_lambda=settings.background_lambda,
        psf_sigma_px=PSF_SIGMA_PX,
        pixel_size_nm=PIXEL_SIZE_NM,
        on_off_rates=(settings.on_probability, 0.4),
        drift_per_frame_px=drift_step,
        seed=settings.seed,
    )
    specimen = make_specimen(settings.specimen, settings.n_emitters, settings.seed)
    stack = simulate_storm_frames(params, emitter_xy=specimen)
    fits = localize_frame_stack(stack, PSF_SIGMA_PX, PIXEL_SIZE_NM)
    valid = ~fits.failure_flags
    positions = fits.estimated_xy[valid]
    frame_index = fits.frame_index[valid]
    corrected = apply_drift_correction(positions, frame_index, drift_step)
    precision = fits.uncertainty_nm[valid]
    mean_frame = stack.frames.mean(axis=0)
    counts = np.bincount(frame_index, minlength=settings.frame_count)

    return {
        "schema_version": 1,
        "settings": settings.model_dump(),
        "model": {
            "canvas_size_px": CANVAS_SIZE,
            "pixel_size_nm": PIXEL_SIZE_NM,
            "psf_sigma_px": PSF_SIGMA_PX,
            "off_probability": 0.4,
            "drift_per_frame_px": list(drift_step),
            "localization_method": "Fixed-width pixel-integrated Gaussian Poisson MLE",
            "precision_method": "Fisher information; RMS per-axis precision, not image resolution",
            "preview_encoding": "base64 uint8; frame-major, row-major; display values only",
        },
        "frames": encode_preview(stack.frames, float(np.quantile(stack.frames, 0.9995))),
        "widefield": encode_preview(mean_frame, float(np.max(mean_frame))),
        "ground_truth": specimen.tolist(),
        "localizations": {
            "frame": frame_index.tolist(),
            "xy": positions.tolist(),
            "corrected_xy": corrected.tolist(),
            "photons": fits.photon_estimates[valid].tolist(),
            "precision_nm": precision.tolist(),
        },
        "counts_per_frame": counts.tolist(),
        "active_per_frame": stack.active_masks.sum(axis=1).tolist(),
        "fit_failures": int(fits.failure_flags.sum()),
        "median_precision_nm": float(np.median(precision)) if precision.size else None,
    }


def create_app() -> FastAPI:
    app = FastAPI(title="STORM Lab", docs_url=None, redoc_url=None, openapi_url=None)
    # A long acquisition must not create a queue of concurrent CPU-heavy fits.
    acquisition_slot = BoundedSemaphore(1)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"])
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    @app.middleware("http")
    async def local_request_policy(request: Request, call_next):
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and origin != str(request.base_url).rstrip("/"):
                return JSONResponse({"detail": "Use the lab in its own browser tab."}, status_code=403)
            if request.headers.get("content-type", "").split(";")[0] != "application/json":
                return JSONResponse({"detail": "Send settings as JSON."}, status_code=415)
            # Check the streamed body before handing it to the JSON parser.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 4096:
                    return JSONResponse({"detail": "Settings are too large."}, status_code=413)
            request._body = bytes(body)
            try:
                json.loads(body, parse_constant=reject_nonfinite_json, parse_float=finite_json_float)
            except (ValueError, UnicodeDecodeError):
                return JSONResponse({"detail": "Send valid JSON with finite numbers."}, status_code=400)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; "
            "base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
        )
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/experiment")
    def experiment(settings: ExperimentSettings):
        if not acquisition_slot.acquire(blocking=False):
            raise HTTPException(429, "An acquisition is already running. Try again when it finishes.")
        try:
            return run_experiment(settings)
        finally:
            acquisition_slot.release()

    app.mount("/", StaticFiles(directory=WEB_ROOT, html=True), name="lab")
    return app


def main() -> None:
    import uvicorn

    parser = argparse.ArgumentParser(description="Open the local STORM microscopy lab.")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"STORM Lab: http://127.0.0.1:{args.port}")
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
