# IoTForge

**AI-assisted IoT network planning, simulation, and resilience testing.**
Design it. Simulate it. Break it. Improve it.

A single-floor hotel/office editor backed by a real C++20 simulator. Edit rooms,
walls, sensors and gateways; generate a local AI deployment; inspect calculated
signal, delivery and latency; compare an optimized placement; fail a gateway;
and test backup recovery. Every displayed simulation metric and requirement
result comes from C++, including results for AI proposals.

## Quick start — Windows 10/11 x64

Prerequisites: Visual Studio 2022 **Desktop development with C++**, CMake/NMake,
Python 3.11+, and Node.js 22.12+ for building. No database or cloud account.

From the repository root in PowerShell:

```powershell
.\demo\build.ps1
.\demo\start.ps1
```

Open **http://127.0.0.1:8000**. API docs: **http://127.0.0.1:8000/api/docs**.
Ctrl+C stops the server. The build script discovers MSVC using vswhere, builds
Debug and a static-runtime Release executable, runs CTest/backend tests, installs
pinned dependencies, builds the frontend, and generates the runtime ZIP.
Use `demo\build.ps1 -SkipInstall` to rebuild with dependencies already installed.
If script execution is disabled, use an initialized developer command prompt
and the manual commands below; no machine-wide execution-policy change is needed.

The frontend is React + TypeScript + Vite. The former Next/Turbopack build was
explicitly replaced with the approved Vite stack after it failed to produce a
production build. FastAPI serves the built frontend and APIs on the same origin.

### Local AI

Install [Ollama for Windows](https://ollama.com/download/windows), then:

```bat
ollama pull qwen2.5:1.5b
```

Keep Ollama running; use `ollama serve` if its desktop app is not running.
The model is approximately 1 GB and is **not included in the runtime ZIP**.
`GET /api/ai/health` reports model readiness. AI uses the local Ollama API;
no paid API key is required. Set `IOTFORGE_OLLAMA_MODEL`, `IOTFORGE_OLLAMA_URL`,
or `IOTFORGE_AI_TIMEOUT` before starting FastAPI to change the defaults.

Manual simulation needs no AI. AI failure produces a visible **Rule-based
fallback · not AI** label. Fallback proposals and backup placements are also
verified by C++; neither fallback nor AI invents metrics. `--require-ai` in the
live acceptance script rejects fallback, allowing genuine AI verification.

### Prebuilt runtime

`demo\build\IoTForge-windows-x64.zip` contains the production frontend, MSVC
Release simulator, backend, shared schemas, and `start.cmd`. Extract it and run
`start.cmd` on Windows x64 with Python 3.11+ on PATH. Its first run installs the
pinned Python runtime requirements. No Node, Visual Studio, or CMake is needed
for the prebuilt runtime. Ollama/model installation is optional and separate.
See the archive's `START-HERE.txt`; the source build commands apply to this repo.

## Demonstration

1. Rename/move/resize an area in the inspector. Add/delete areas or wall segments;
   drag sensors/gateways or edit their coordinates. Associated sensors move
   proportionally with room edits. Choose wall materials in the Walls tab.
2. Enter monitoring requirements and click **Generate design**. Verify that the
   provenance says **Ollama**, and that sensors and the gateway appear on the floor.
3. Click **Simulate network**. Inspect metrics, requirements, per-sensor results,
   signal heatmap and device-to-gateway geometry. Toggle the heatmap to inspect
   room boundaries. Layout edits clear results until the next real run.
4. Click **Load weak deployment**, then **Simulate network**. This intentional
   poor placement behind a concrete wall fails. Click **Optimize placement**;
   compare two real simulation runs. Improvement and PASS are never assumed.
5. Select the primary gateway in the resilience controls and click **Fail gateway**.
   Inspect disconnected sensors, zero delivery, and undefined latency.
6. Click **Test backup recovery**. The failed gateway stays offline, an active
   backup is added, and C++ checks whether the original requirements are restored.
   Alternatively add/position a second gateway in the device inspector and simulate.
7. Reset and repeat. No code/JSON edits or service restarts are necessary.

## Manual build and development

From the **VS 2022 x64 Native Tools Command Prompt**, repository root:

```bat
cmake -S simulator -B simulator/build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Debug
cmake --build simulator/build
ctest --test-dir simulator/build --output-on-failure
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
cd frontend
npm ci
npm run build
cd ..
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

For frontend hot reload, use a second terminal: `cd frontend` then `npm run dev`.
Open http://127.0.0.1:3000; `/api` is proxied to FastAPI on 8000.
`npm run lint` runs strict TypeScript checks. VS Code C++ configurations remain
inside `simulator/.vscode/`: from the initialized developer terminal,
`cd simulator` then `code .`. Debug tasks target the Debug executable and symbols.

## Contract and API

Schema version **1.0**. Coordinates remain shared logical floor-plan units.
`simulation.metres_per_unit` explicitly converts them to metres; the example
uses 0.05, making the 1000×600 floor 50×30 m. `gateways` remains an array.
Two sensor types only: `temperature_sensor`, `leak_sensor`. One or two gateways.

- `shared/input.schema.json`, `shared/output.schema.json`: additive versioned contract.
- `shared/fixtures/`: geometry, normal network, obstruction, weak signal, gateway failure.
- [shared/API.md](shared/API.md): API envelopes, examples, errors and integration guidance.
- [shared/NETWORK_MODEL.md](shared/NETWORK_MODEL.md): equations, assumptions and semantics.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Server liveness and executable file readiness |
| GET | `/api/ai/health` | Local Ollama/model readiness |
| POST | `/api/simulate` | Complete shared input → actual C++ output |
| POST | `/api/design` | `{layout, prompt}` → validated layout and C++ simulation |
| POST | `/api/optimize` | `{layout, prompt?}` → layout, real before/after, improvement flag |
| POST | `/api/failure` | `{layout, gateway_id, add_backup?: boolean}` → failure/recovery comparison |

`health.checkpoint` identifies implemented capability, not official team acceptance.
The CLI accepts a file or one complete JSON stdin request. stdout contains exactly
one JSON response; diagnostics use stderr; failures return nonzero exit codes.

```bat
simulator\build\iot_simulator.exe shared\fixtures\network-hotel.json
type shared\fixtures\network-hotel.json | simulator\build\iot_simulator.exe
curl.exe -H "Content-Type: application/json" --data-binary @shared/fixtures/network-hotel.json http://127.0.0.1:8000/api/simulate
```

Omitting `simulation` retains the original CP01–02 geometry-only response.
Network requests add calculated RSSI/reachability, summary, per-device delivery,
requirements evaluation, model provenance and heatmap. Existing fields stay stable.

## Verification

```bat
ctest --test-dir simulator/build --output-on-failure
backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
backend\.venv\Scripts\python.exe -m backend.verify_http
backend\.venv\Scripts\python.exe demo\verify_final.py --require-ai
```

Run live verification with FastAPI and Ollama already running. The final script
runs the full workflow **twice**, requires genuine AI with `--require-ai`, compares
returned results with repeated C++ runs, and records full inputs/outputs in
`demo/build/live-acceptance.json`. Unit tests explicitly inject AI failures to
verify labeled fallback; those are separate from live-AI acceptance.
See [demo/ACCEPTANCE.md](demo/ACCEPTANCE.md) for executed evidence and limitations.

## Model boundaries

Approximate log-distance/wall loss, strongest active gateway selection, seeded
independent packet trials and bounded retries. Gateway-to-reception backhaul is
assumed wired with a fixed configurable delay; reception location is not a
second radio hop. Undefined delivery latency is JSON null, never zero or fabricated.
The heatmap samples cell centres using the same radio model as device links.

Guest rooms require a temperature sensor and bathrooms a leak sensor inside the
assigned rectangle. C++ evaluates monitoring, coverage, reliability and latency.
AI design targets these whole-room categories on the existing floor plan; it is
not a general CAD or engineering specification interpreter. Optimization searches
placements with the configured gateway count, preferring no added equipment;
backup recovery adds the second gateway only when requested.

No real ESP32, MQTT, firmware, calibrated Wi-Fi protocol, interference, contention,
multi-floor, 3D, or cybersecurity scanning. Gateway failure is a resilience
scenario, not proof of cybersecurity protection. Validate actual installations
with device specifications, engineering judgment and real site surveys.
