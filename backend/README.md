# IoTForge FastAPI backend: CP00-02

This backend exposes health and forwards validated JSON to the **real** standalone
C++ geometry simulator. It does not calculate or invent simulation metrics.
No AI, optimization, heatmap, packet, failure-simulation or database service is
needed for this checkpoint.

## Windows startup

Use Python 3.11+ and build the simulator first using the VS 2022 x64 Native Tools
Command Prompt. From the repository root:

```bat
cmake -S simulator -B simulator/build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Debug
cmake --build simulator/build
ctest --test-dir simulator/build --output-on-failure

python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Production/runtime-only dependency installation can use `requirements.txt`.
No environment activation is needed when invoking the virtual environment's
Python directly. Run Uvicorn from the repository root. Server logs go to its
terminal; the child process stdout remains an isolated JSON channel.

In a second terminal, from the repository root:

```bat
backend\.venv\Scripts\python.exe -m backend.verify_http
curl.exe http://127.0.0.1:8000/api/health
curl.exe -H "Content-Type: application/json" --data-binary @shared/fixtures/basic-hotel.json http://127.0.0.1:8000/api/simulate
curl.exe -H "Content-Type: application/json" --data-binary @shared/fixtures/wall-obstruction.json http://127.0.0.1:8000/api/simulate
```

Swagger UI: `http://127.0.0.1:8000/docs`. The full authoritative schemas are the
checked-in `shared/*.schema.json`; the Swagger request body is described as an
object to avoid maintaining a separate set of Pydantic contract models.

## Configuration

Optional variables, set before starting Uvicorn (Command Prompt examples):

```bat
set IOTFORGE_SIMULATOR_PATH=simulator\build\iot_simulator.exe
set IOTFORGE_SIMULATOR_TIMEOUT=10
set IOTFORGE_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
```

The default executable is `simulator/build/iot_simulator.exe` on Windows and
`simulator/build/iot_simulator` elsewhere. Relative executable paths resolve
against the repository root, not the shell directory. Paths containing spaces
are passed as a single argument, without a shell. The simulator is local to the
backend and is not an HTTP service.

The finite positive timeout defaults to 10 seconds. `subprocess.run` kills and
waits for the child on timeout. It runs in FastAPI's thread pool, keeping process
waiting off the main event loop and avoiding Windows async-subprocess/reload
event-loop differences. Every request gets a new process; there is no shared
simulation state between requests.

## HTTP behavior

`GET /api/health` returns liveness, schema version, current geometry checkpoint
and `simulator_available`. Availability means the executable file exists, not
that simulation has been tested; `/api/simulate` verifies actual execution.

`POST /api/simulate` consumes one shared-schema request. On success it returns
the validated C++ JSON unchanged, including all link IDs and numeric results.
Requirements are accepted but not evaluated at this checkpoint.

| HTTP | Error code | Condition |
|---:|---|---|
| 200 | — | Real C++ geometry result |
| 400 | INVALID_INPUT | Malformed/trailing JSON or non-finite JSON numbers |
| 415 | INVALID_INPUT | Content-Type is not application/json |
| 422 | INVALID_INPUT | Schema validation or C++ semantic validation fails |
| 503 | SIMULATOR_UNAVAILABLE | Executable cannot start |
| 504 | SIMULATOR_TIMEOUT | Child exceeds the configured timeout |
| 502 | SIMULATOR_PROTOCOL_ERROR | Invalid stdout, output schema, encoding or conflicting exit status |
| 502 | C++ error code | Valid C++ error other than INVALID_INPUT |

C++ errors preserve their existing envelope and message. Backend transport
errors use the same envelope, with documented new codes; no field is renamed.
Diagnostics from child stderr are logged separately and never prepended to the
JSON response. Frontend callers should inspect HTTP status **and** `status`.

## Tests

`python -m unittest discover -s backend/tests -v` runs schema/input validation,
CORS, process-error handling and real API-to-C++ integration. The real simulator
must be built; those tests fail instead of silently skipping if it is absent.
Tests cover both shared fixtures, all five existing simulator fixtures, repeated
hotel requests, expected distances, movement, wall effects, multiple gateways,
duplicates and bad references. Only failure-path unit tests inject subprocess
results; no successful integration result uses a simulation stub.

`python -m backend.verify_http` tests a **running Uvicorn server** over real HTTP:
health, six hotel links, a repeated request, concrete wall attenuation, sensor
movement, a non-intersecting wall, malformed JSON and unsupported schema.
Use `--base-url http://127.0.0.1:8001` to test another port.

Frontend browser acceptance remains a separate team gate. Do not display
coverage/reliability/latency PASS values from this geometry-only response.
