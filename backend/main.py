"""HTTP adapter. C++ is the only source of simulation metrics."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .config import PROJECT_ROOT, Settings
from .contract import INPUT_VALIDATOR, error_response, load_json, validation_message
from .simulator import SimulatorError, SimulatorRunner
from . import planning

def request_docs(properties, required):
    return {"requestBody": {"required": True, "content": {"application/json": {
        "schema": {"type": "object", "required": required, "properties": properties}
    }}}}

LAYOUT_FIELD = {"type": "object", "description": "Complete shared/input.schema.json object, including simulation.metres_per_unit"}
PROMPT_FIELD = {"type": "string", "minLength": 1, "maxLength": 4000}


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
        return {"status": "ok", "schema_version": "1.0", "checkpoint": "10",
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

    @app.get("/api/ai/health")
    def local_ai_health():
        return {"schema_version": "1.0", "status": "ok", **planning.ai_health(settings)}

    async def scenario_request(request, operation):
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            return JSONResponse(error_response("INVALID_INPUT", "Content-Type must be application/json"), status_code=415)
        try:
            body = load_json(await request.body())
            if not isinstance(body, dict) or not isinstance(body.get("layout"), dict):
                raise ValueError("Expected an object with layout containing a complete shared input")
            planning.validate_layout(body["layout"])
            if operation in ("design", "optimize"):
                prompt = body.get("prompt", "Improve placement without changing the requirements")
                if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
                    raise ValueError("prompt must be a nonempty string of at most 4000 characters")
                function = planning.design if operation == "design" else planning.optimize
                result = await run_in_threadpool(function, runner, settings, body["layout"], prompt)
            else:
                gateway_id = body.get("gateway_id")
                if not isinstance(gateway_id, str) or not gateway_id:
                    raise ValueError("gateway_id must be a nonempty string")
                add_backup = body.get("add_backup", False)
                if not isinstance(add_backup, bool): raise ValueError("add_backup must be a JSON boolean")
                result = await run_in_threadpool(planning.failure, runner, body["layout"], gateway_id, add_backup)
            return JSONResponse(result)
        except SimulatorError as exc:
            return JSONResponse(exc.response, status_code=exc.http_status)
        except (ValueError, TypeError, KeyError, UnicodeError, RecursionError) as exc:
            return JSONResponse(error_response("INVALID_INPUT", str(exc)), status_code=422)

    @app.post("/api/design", openapi_extra=request_docs({"layout": LAYOUT_FIELD, "prompt": PROMPT_FIELD}, ["layout", "prompt"]))
    async def design(request: Request):
        """Body: {layout: shared input, prompt: natural-language requirements}."""
        return await scenario_request(request, "design")

    @app.post("/api/optimize", openapi_extra=request_docs({"layout": LAYOUT_FIELD, "prompt": PROMPT_FIELD}, ["layout"]))
    async def optimize(request: Request):
        """Body: {layout, prompt?}. Returns actual before/after C++ runs and planner provenance."""
        return await scenario_request(request, "optimize")

    @app.post("/api/failure", openapi_extra=request_docs({"layout": LAYOUT_FIELD,
        "gateway_id": {"type": "string", "minLength": 1}, "add_backup": {"type": "boolean", "default": False}}, ["layout", "gateway_id"]))
    async def failure(request: Request):
        """Body: {layout, gateway_id, add_backup?: boolean}. C++ evaluates failure/recovery."""
        return await scenario_request(request, "failure")

    frontend_dist = PROJECT_ROOT / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    return app


app = create_app()
