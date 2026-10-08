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
Python 3.11+, Node.js 22.12+ for building, and
[Ollama for Windows](https://ollama.com/download/windows). No database or cloud
account. Open a new terminal after installing these tools.

One-time setup from the repository root (`prompt2product/`):

```powershell
ollama pull qwen2.5:1.5b
.\demo\build.ps1
```

Every subsequent run uses **one master script at the repository root**:

```powershell
.\start.ps1
```

Open **http://127.0.0.1:8000**. API docs: **http://127.0.0.1:8000/api/docs**.
The launcher starts Ollama if necessary, verifies the installed model, and starts
FastAPI, which serves the built React application. C++ runs on demand per request;
there is no separate simulator service or frontend development server to launch.
**Ctrl+C** stops the app and any Ollama process started by this launcher. An
already-running Ollama service is reused and remains running when the app stops.
Logs are saved in ignored `.runtime/`. A second app on the same port is rejected.

If Ollama/the model is missing or unavailable, startup prints one short
**Configure Ollama** message and exits with a nonzero code. It does not install
software, download models, launch a partial application or silently use fallback.
Runtime AI failures still use the explicitly labelled fallback described below.

Useful options:

```powershell
.\start.ps1 -Check      # Validate setup, then exit; leave no newly started services
.\start.ps1 -Port 8001  # Optional alternate app port
```

If PowerShell blocks local scripts, use a process-only invocation:

```bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
```

The build script discovers MSVC using vswhere, builds
Debug and a static-runtime Release executable, runs CTest/backend tests, installs
pinned dependencies, builds the frontend, and generates the runtime ZIP.
Use `demo\build.ps1 -SkipInstall` to rebuild with dependencies already installed.
For first-time builds under a restrictive execution policy, use
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo\build.ps1`,
or the manual build commands below. No machine-wide policy change is needed.

The frontend is React + TypeScript + Vite. The former Next/Turbopack build was
explicitly replaced with the approved Vite stack after it failed to produce a
production build. FastAPI serves the built frontend and APIs on the same origin.

### Local AI

Install [Ollama for Windows](https://ollama.com/download/windows), then:

```bat
ollama pull qwen2.5:1.5b
```

The root launcher starts the Ollama service when it is not already running.
The model is approximately 1 GB and is **not included in the runtime ZIP**.
`GET /api/ai/health` reports model readiness. AI uses the local Ollama API;
no paid API key is required. Set `IOTFORGE_OLLAMA_MODEL`, `IOTFORGE_OLLAMA_URL`,
or `IOTFORGE_AI_TIMEOUT` before starting FastAPI to change the defaults.

The simulation engine itself needs no AI; the master launcher requires a
configured model for the complete demonstration. A later AI failure produces a visible **Rule-based
fallback · not AI** label. Fallback proposals and backup placements are also
verified by C++; neither fallback nor AI invents metrics. `--require-ai` in the
live acceptance script rejects fallback, allowing genuine AI verification.

### Prebuilt runtime

`demo\build\IoTForge-windows-x64.zip` contains the production frontend, MSVC
Release simulator, backend, shared schemas, the same master `start.ps1`, and a
`start.cmd` shortcut. On Windows x64, install Python 3.11+ and Ollama, extract the
archive, and perform this one-time setup in the extracted root:

```bat
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
ollama pull qwen2.5:1.5b
```

Then run `start.cmd` or `.\start.ps1`. No Node, Visual Studio, or CMake is needed
for the prebuilt runtime. Ollama/model installation remains a separate setup step.
See the archive's `START-HERE.txt`; the source build commands apply to this repo.

## Demonstration

1. Click a room to open its **Contents** list. Drag the room body or any locked
   content to move the whole room. Neighbouring areas automatically rearrange
   when needed, carrying their own sensors, gateways and reception too. Add a
   temperature/leak sensor or gateway directly in Contents; inspect or remove
   individual items there. Rename the room or expand **Position & size** to resize.
   **Unlock individual placement** permits device dragging and coordinate edits
   only inside its assigned room. Choosing another room locks contents again.
   Use **Assigned room** to explicitly transfer a device. Arrow keys move a focused
   room/marker one unit, or ten with Shift; Escape cancels an active drag.
   Choose independent wall segments and their materials in the Walls tab.
2. Click **Plan deployment**, enter monitoring requirements, and click **Generate design**. Verify that the
   provenance says **Ollama**, and that sensors and the gateway appear on the floor.
   To replace the default building, use explicit counts such as **2 rooms, 1
   bathroom, 1 lobby, 1 gateway**. This creates four areas and three sensors;
   reception remains a point in the lobby, without an extra room. Unspecified
   area types are omitted. Generated rectangles are wall-free (`walls: []`);
   their visible outlines do not attenuate signals. Monitoring-only requests
   preserve existing walls, which still affect simulation normally.
   Ollama proposes monitoring thresholds and gateway placement. A monitoring-only
   prompt such as **Monitor all rooms and bathroom leaks** keeps the existing
   building. **Optimize placement** also keeps its areas and sensors. Count
   matching and network PASS/FAIL are separate checks; a generated design can fail
   the network requirements and need optimization. See [design-fix evidence](demo/DESIGN-ACCEPTANCE.md).
3. Click **Simulate network**. Inspect metrics, requirements, per-sensor results,
   signal heatmap and device-to-gateway geometry. Toggle the heatmap to inspect
   room boundaries. Layout edits clear results until the next real run.
4. Click **Weak deployment**, then **Simulate network**. This intentional
   poor placement behind a concrete wall fails. Open **Plan deployment** and click **Optimize placement**;
   compare two real simulation runs. Improvement and PASS are never assumed.
5. Select the primary gateway in the resilience controls and click **Disable gateway**.
   Inspect disconnected sensors, zero delivery, and undefined latency.
6. Click **Test backup recovery**. The failed gateway stays offline, an active
   backup is added, and C++ checks whether the original requirements are restored.
   Alternatively add/position a second gateway in the device inspector and simulate.
7. Use **Reset hotel** (the circular-arrow button) and repeat. No code/JSON edits or service restarts are necessary.

### Editor placement policy

Sensors keep the shared `room_id` field. Gateway and reception area bindings are
editor state; no fields were added to schema 1.0. Imported gateways are bound to the
nearest area, preferring an area that already fits their marker. Imported devices
are fitted inside their areas and the adjusted layout is simulated again before
results appear. Backend design, optimization and backup proposals fit new gateway
positions to the nearest area's interior **before** C++ evaluates them. This is an
editor/planner placement constraint, not a new radio-model assumption. External
API clients may still place gateways anywhere inside the floor under the existing
contract. Room removal also removes its assigned sensors and gateways. Reception
is a required singleton: move it with **Assigned room** or **Move reception here**;
deleting its area relocates it to a surviving area. The final area cannot be deleted.

Room movement and resizing use deterministic bounded packing with an eight-unit
gap. The dragged area stays at the requested position within floor boundaries;
other areas are moved to nearby available positions without resizing them. If no
safe arrangement is found within the search budget, the last valid layout stays
visible and a message explains the rejection. This is a practical packing heuristic,
not a guarantee of finding every mathematically possible arrangement. A cancelled
drag (Escape, pointer cancellation, lost capture or window blur) restores all rooms
and contents together. Wall segments remain independent floor objects; they are
not silently attached to, created for, or moved with rooms. Crowded rooms may have
overlapping device markers, but their contents list keeps every item accessible.

The UI uses shadcn/ui components with Radix primitives and Lucide icons. Its quiet
toolbar/property-panel layout takes inspiration from established productivity
workspaces; it does not use third-party branding. Fonts are local system fonts;
the running application does not need Google Fonts or a CDN.

### Manual UI regression checklist

1. Open http://127.0.0.1:8000 and press Ctrl+F5. Click Room 101; its Contents
   list must show only its own devices. Add/remove a temperature and a leak sensor
   there without switching tabs. Click a listed item to inspect its details.
2. Drag Room 101 over Room 102, the lobby, then reception. Other rooms must
   rearrange without overlap; every area's sensors/gateways/reception must follow
   its own area. Drag from a locked sensor/gateway/reception: the whole area moves.
   Press Escape during a move and confirm the entire original layout returns.
3. Unlock individual placement, select a sensor and enter `9999` in Content x
   and `-9999` in Content y. It must stay inside its assigned room. Drag towards
   another room and try arrow keys: it cannot change rooms. Explicitly change
   Assigned room, then confirm the marker transferred and placement locked again.
4. Resize Room 102 through Position & size, including a 1-unit dimension. Its
   contents must fit and neighbours adjust. Select Lobby and add a gateway; repeat
   boundary/reassignment tests for it and reception. Delete reception's area:
   assigned sensors/gateways disappear and required reception moves safely.
   Reset hotel before the normal demonstration; test desktop and narrow widths.
5. Generate a design with Ollama. Check its provenance, positions, heatmap and
   simulator metrics. Test the weak deployment, optimize, disable the gateway,
   and test backup recovery. Confirm the failed original remains offline.
6. Import/export JSON through the dialog. Invalid JSON must show an error and
   preserve the current layout. Imported out-of-area devices must be fitted and
   their results recalculated. Check the layout at both desktop and narrow widths.

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
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
```

For frontend hot reload, use a second terminal: `cd frontend` then `npm run dev`.
Open http://127.0.0.1:3000; `/api` is proxied to FastAPI on 8000.
`npm test` runs placement, collision and React event regressions, plus real C++
editor integration when a compiled simulator is available (otherwise those three
tests explicitly skip; set `IOTFORGE_SIMULATOR` to its path if needed). React event
tests use jsdom and explicit API doubles; they are not browser visual acceptance
or evidence of real AI metrics. `npm run lint` runs strict TypeScript checks. VS Code C++ configurations remain
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

With all app/Ollama instances stopped, test the master launcher's missing-AI,
missing-model, successful preflight and duplicate-port paths:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo\verify_launcher.ps1
```

This test starts its own Ollama service and stops it before returning. For the
full lifecycle check, run `.\start.ps1` in a **foreground terminal**. In a second
terminal, run `backend\.venv\Scripts\python.exe -m backend.verify_http` and
`Invoke-RestMethod http://127.0.0.1:8000/api/ai/health`. Confirm all eight HTTP
checks pass and AI is available. Press Ctrl+C in the launcher terminal. If Ollama
was originally stopped, this command should then return no listeners:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in @(8000,11434) }
```

The interactive launcher is intended for a normal terminal, not a PowerShell
background job. Keep that terminal open while using the app.

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
