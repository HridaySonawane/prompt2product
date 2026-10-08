"""HTTP adapter. C++ is the only source of simulation metrics."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .config import PROJECT_ROOT, Settings
from .contract import INPUT_VALIDATOR, error_response, load_json, validation_message
from .simulator import SimulatorError, SimulatorRunner


def create_app(settings=None):
    settings = settings or Settings.from_env()
    runner = SimulatorRunner(settings)
    app = FastAPI(title="IoTForge simulation API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health():
        # Liveness plus file readiness; this does not claim a successful simulation.
        return {"status": "ok", "schema_version": "1.0", "checkpoint": "05",
                "simulator_available": settings.simulator_path.is_file()}

    @app.post("/api/simulate", openapi_extra={
        "requestBody": {"required": True, "content": {"application/json": {
            "schema": {"type": "object", "description": "shared/input.schema.json, schema version 1.0"}
        }}}
    })
    async def simulate(request: Request):
        """Forward a validated shared request to C++; return shared/output.schema.json."""
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            return JSONResponse(error_response("INVALID_INPUT", "Content-Type must be application/json"), status_code=415)
        try:
            payload = load_json(await request.body())
        except (ValueError, UnicodeError, RecursionError):
            return JSONResponse(error_response("INVALID_INPUT", "Body must be one complete JSON object with finite numbers"), status_code=400)
        error = next(INPUT_VALIDATOR.iter_errors(payload), None)
        if error is not None:
            return JSONResponse(error_response("INVALID_INPUT", validation_message(error)), status_code=422)
        try:
            # A thread keeps synchronous subprocess waiting off the event loop and
            # works with Windows/Uvicorn reload as well as the normal server.
            status, response = await run_in_threadpool(runner.run, payload)
            return JSONResponse(response, status_code=status)
        except SimulatorError as exc:
            return JSONResponse(exc.response, status_code=exc.http_status)

    frontend_dist = PROJECT_ROOT / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    return app


app = create_app()
