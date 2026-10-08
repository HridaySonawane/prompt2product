# IoTForge

**Design it. Simulate it. Break it. Improve it.**

AI-assisted indoor IoT planning and resilience testing. The roadmap baseline is
1.0.0 (CP00–10); the wire schema is `"1.0"`. The current implementation is
**CP01–02 geometry only**. The simulator returns device-to-gateway distance and
wall attenuation; coverage, reliability, latency, AI, and gateway-failure
behavior are later checkpoints.

## Local service layout

| Service/process | Responsibility | Address / lifetime |
|---|---|---|
| Frontend | Browser layout editor, schema 1.0 JSON export, calls the API, displays returned links/errors | `http://localhost:3000` |
| FastAPI backend | Health endpoint, input validation, CORS, starts the simulator and returns its validated response | `http://127.0.0.1:8000` |
| C++ simulator | Computes geometry from one JSON request on stdin and writes one JSON response to stdout | Local child process started by FastAPI for each request; no port |

Request flow: **browser → `POST /api/simulate` → schema validation → C++ stdin/stdout → JSON response → browser link list**. The browser and API exchange the complete object defined by `shared/input.schema.json`; they do not wrap it in another property. Health is checked with `GET /api/health`.

### Required for CP00–02

- Node.js/npm to run the current frontend checkout.
- Python 3.11+ and the dependencies in `backend/requirements-dev.txt`.
- Visual Studio 2022 C++ Build Tools with the x64 Native Tools command prompt, CMake, and NMake to build the simulator on Windows.
- The built `simulator/build/iot_simulator.exe` available to the backend.

Ollama, a database, Docker, another HTTP service for C++, hardware, and network access points are **not** needed for this geometry checkpoint. Ollama becomes a local service only when the later AI requirement/placement/optimization checkpoint is implemented. The simulator executable is not an always-running service. Keep the backend and frontend terminals open while using the app.

## Start on Windows

### 1. Build the simulator

Open **VS 2022 x64 Native Tools Command Prompt**, change to this repository root, then run:

```bat
cmake -S simulator -B simulator/build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Debug
cmake --build simulator/build
ctest --test-dir simulator/build --output-on-failure
```

### 2. Start FastAPI

In a regular terminal at the repository root:

```bat
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Leave this terminal running. Check `http://127.0.0.1:8000/api/health`; `simulator_available` should be `true`. API reference: `http://127.0.0.1:8000/docs`.

### 3. Start the frontend

In another terminal:

```bat
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The frontend defaults to `http://127.0.0.1:8000` for the API. To use a different backend URL, set `NEXT_PUBLIC_IOTFORGE_API_URL` before starting Next.js, for example in PowerShell:

```powershell
$env:NEXT_PUBLIC_IOTFORGE_API_URL = "http://127.0.0.1:8000"
npm run dev
```

The backend allows the default localhost origins on ports 3000 and 5173. If you change the frontend origin, add it to `IOTFORGE_CORS_ORIGINS` before starting FastAPI. See [backend configuration](backend/README.md#configuration).

## Verify the integration

With the simulator built and FastAPI running, open the frontend and:

1. Confirm the backend status says the API is ready and the simulator executable is found.
2. Export or show the JSON and confirm it contains the complete schema 1.0 object.
3. Run a simulation twice without restarting either service; the returned links must come from the backend response.
4. Move a sensor and rerun; its returned distance should change.
5. Add the concrete wall across the selected link and rerun; attenuation should increase by 12 dB. Use the floor-edge wall to confirm a non-intersecting segment contributes zero.
6. Edit the request JSON into an invalid schema object and rerun; the backend message should appear in the error panel.

Do not report coverage, reliability, latency, RSSI, heatmap values, or requirement PASS/FAIL from CP01–02 geometry. The frontend intentionally labels these as unavailable because the current simulator response does not calculate them. See [shared contract and acceptance notes](shared/README.md).

## Repository responsibilities

| Directory | Responsibility |
|---|---|
| `simulator/` | C++20 standalone geometry engine and CMake build |
| `backend/` | FastAPI health, schema validation, and real simulator subprocess adapter |
| `shared/` | Versioned schemas, fixtures, and frontend handoff |
| `frontend/` | React/TypeScript layout editor and API client |

The approved final frontend stack names Vite, while this checkout currently has Next.js-specific project files and instructions. This integration does not migrate or silently change that stack; the framework mismatch remains a team decision before any stack-level changes. No frontend framework migration is included here.

There is no HTTP server inside C++. CP06–10 remain gated on the CP05 end-to-end acceptance checkpoint.
