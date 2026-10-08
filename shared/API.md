# API integration contract — schema 1.0

FastAPI owns HTTP; C++ uses a standalone executable and JSON stdin/stdout.
Production frontend and API share http://127.0.0.1:8000. Vite development on 3000
proxies `/api` to 8000. Swagger/OpenAPI are `/api/docs` and `/api/openapi.json`.

## Endpoints

`GET /api/health`: `{status, schema_version, checkpoint, simulator_available}`.
Availability means the executable file exists, not that a simulation succeeded.
Checkpoint identifies supported capability; it is not an official acceptance flag.

`GET /api/ai/health`: `{status, schema_version, available, model, message}`.
Checks local Ollama tags; missing AI does not block manual simulation.

`POST /api/simulate`: body is the **complete** input.schema.json object.
Response is the validated output.schema.json object emitted by C++.
The backend does not alter field names or compute substitute metrics.

`POST /api/design` body:

```json
{"layout": "REPLACE WITH COMPLETE SHARED INPUT OBJECT", "prompt": "Monitor all guest-room temperatures and bathroom leaks within two seconds at 95% reliability."}
```

`layout` is an object, not a string: the text above is illustrative shorthand.
Response: `{schema_version, status, layout, simulation, planner, placement_validated, design_request}`.
`layout` matches input schema; `simulation` matches output schema and comes from
an actual C++ invocation. AI interprets monitoring intent/thresholds and proposes
gateway positions; sensors are placed at centres of the requested room categories.
Generated points must be inside their assigned rooms/floor and pass C++ validation.

Explicit area counts create a **new building** on the existing floor and physical
scale: for example `2 rooms, 1 bathroom, 1 lobby, 1 gateway`. The backend builds
non-overlapping rectangles and replaces the previous areas/walls/devices/gateways.
Unspecified area categories have count zero; it does not retain default rooms.
The required reception point lives in a requested reception area, lobby or another
surviving area; it does not create an unrequested reception room. Generated areas
have a 16 logical-unit gap and minimum 64x64 size. New generated layouts have
`walls: []`: visible area outlines do not cause attenuation. Existing walls remain
in monitoring-only requests and continue to affect simulation. New guest rooms
receive temperature sensors; bathrooms receive leak sensors.
Ollama interprets monitoring thresholds and proposes gateway positions; the area
packing and sensor centres are deterministic, rather than model-drawn floor plans.

Counts accept digits or simple English count words (for example two or twenty),
with room/guest room/bedroom,
bathroom/washroom, lobby, reception and gateway names. One to 32 total areas must
fit the floor; gateway counts must be one or two. Conflicting, negative, fractional,
out-of-range or unfit requests return structured HTTP 422. Use digits for compound
counts such as 21. Monitoring-only requests
without area counts preserve existing areas/walls/reception. `all five rooms` is
an existing-building reference. A gateway-only count changes gateways, not areas.
General architectural prose, dimensions and arbitrary adjacency constraints are
not interpreted as a CAD design; use explicit counts and the editor for changes.

`design_request` is an additive **backend envelope** field, not a C++ schema
change: `{mode, requested_counts, actual_counts, matched}`. Mode is `new_layout`
or `existing_layout`; count keys are `room`, `bathroom`, `lobby`, `reception` and
`gateways`. Only explicitly constrained counts (plus zeroed area categories when
rebuilding) appear in requested_counts. Counts must match before success is
returned, including during a visibly labeled AI fallback. This verifies counts;
it does not mean C++ network requirements passed. Inspect
`simulation.requirements_evaluation.pass` independently. Successful design logs
record mode, requested/actual counts and planner source in backend stderr.

`POST /api/optimize`: `{layout: <complete input>, prompt?: <string>}`.
Response: `{schema_version, status, layout, before, after, improved,
evaluated_candidates, planner}`. Both before/after match shared output schema.
Requirements and sensor positions remain unchanged. AI sees actual C++ diagnostics.
The configured active gateways are repositioned, never silently reactivated.
A bounded room-centre/grid search is an explicitly labeled fallback. A worse
candidate is not substituted for the original. No improvement and FAIL are valid outcomes.

`POST /api/failure`: `{layout: <complete input>, gateway_id: <string>, add_backup?: <boolean>}`.
Response: `{schema_version, status, layout, before, after, affected_devices,
scenario, recovered, planner}`. The selected gateway becomes inactive. Eligible
sensors reassociate to the strongest remaining active gateway in C++.
`add_backup: true` adds and tests a second active gateway, keeping the failed
one offline. This requires fewer than two configured gateways. With two already
configured, activate/move the backup in the editor and simulate instead.
`scenario` is gateway_failure or backup_recovery; `recovered` means the original
requirements actually pass after recovery. `affected_devices` lists unreachable IDs.

## Planner provenance

`planner` contains source, optional model, reasoning, and optional warning.
- `ollama`: gateway/monitoring proposal came from the actual local model; the
  final layout was C++ simulated. Area packing and sensor centres are rule-based.
- `deterministic_fallback`: rule-based design or bounded verified optimization;
  **not AI**. Display the label and warning visibly.
- `scenario` / `deterministic_verified_search`: failure/backup operation, not an AI claim.

AI prose is a proposal explanation; only `requirements_evaluation.pass` from C++
controls PASS/FAIL. Use `improved` for verified before/after improvement.
Do not claim recovered merely because a second gateway was added.

## C++ result fields

The stable geometry.links retains source, destination, distance (logical units),
walls_crossed and wall_attenuation_db, and adds distance_metres, rssi_dbm,
gateway_active, reachable when simulation is requested.
`summary`: coverage/reliability fractions, device counts, packet counts, average
and worst latency. `devices`: selected gateway (nullable), RSSI (nullable),
reachability, generated/delivered/lost messages, reliability and latency.
`requirements_evaluation`: pass, named boolean checks, diagnostic strings.
`heatmap`: dimensions, cell sizes and flat row-major cells with top-left logical
x/y, centre-sampled RSSI (nullable), strongest gateway_id (nullable), reachable.
`model`: provenance, explicit physical scale, seed, sensitivity and backhaul assumption.

Render latency null as **Undefined**, never 0. Empty/changed layouts should show
no current result until a simulation completes. Do not draw old metrics over a
new placement. All grid/marker coordinates use the same logical coordinate system.

## Errors and limits

Errors: `{schema_version:"1.0",status:"error",error:{code,message}}`.
400 malformed simulate JSON; 415 incorrect content type; 422 invalid fields,
references, bounds, placements, scenario envelopes; 503 executable unavailable;
504 simulator timeout; 502 invalid child output/process failure. Scenario parsing
uses 422 for malformed envelope JSON. Child stderr is logged separately; stdout
must parse as one object. Do not display success after an HTTP error.

Prompt length is 1–4000 characters. Model deadline defaults to 120 seconds;
C++ process deadline is 10 seconds. C++ validates one/two-gateway network layouts,
finite values and physical/model ranges. Heatmap axes are 1–50 cells; default20×12.
The API is a loopback hackathon application, without auth, persistence or public
hosting guarantees. Never replace simulation failures with fabricated metrics.

## PowerShell request example

From the repository root while the app is running:

```powershell
$layout = Get-Content shared/fixtures/network-hotel.json -Raw | ConvertFrom-Json
$body = @{ layout = $layout; prompt = 'Monitor all rooms and bathroom leaks within two seconds with 95% reliability.' } | ConvertTo-Json -Depth 20
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/design -Method Post -ContentType application/json -Body $body
```

For frontend integration use fetch with the same object and application/json.
See demo/verify_final.py for repeated real requests and response assertions.
## Editor and planner placement policy

The web editor pins sensors to their `room_id` and gateways to editor-only area
bindings. Moving or resizing an area carries its assigned devices; room changes
are explicit. No input/output field names were changed. Newly proposed gateways
from `/api/design`, `/api/optimize` and backup recovery are projected to the nearest
room interior with up to a 24 logical-unit marker inset before simulation. Tiny
rooms use their centre. Out-of-floor AI proposals remain invalid. Responses contain
the final positions and the real C++ result for those exact positions. External
`/api/simulate` clients retain the existing floor-bound gateway contract.
