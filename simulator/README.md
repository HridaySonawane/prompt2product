# IoT Security Digital Twin: C++ geometry engine

Checkpoints 01 and 02 provide a standalone C++20 JSON contract and 2D geometry
engine for future integration with a FastAPI backend. This is a **geometry-only
checkpoint**, not a complete IoT radio/network simulator.

## Dependencies and Windows setup

- Windows 10/11 x64 and Visual Studio 2022 with Desktop development with C++
  (MSVC, Windows SDK, and NMake).
- CMake 3.20 or newer, available on PATH.
- nlohmann/json v3.12.0, downloaded by CMake FetchContent from its release archive
  and verified with a pinned SHA-256. Internet access is needed on first configure.
- For VS Code: Microsoft C/C++ (`ms-vscode.cpptools`) and CMake Tools
  (`ms-vscode.cmake-tools`) extensions.

No Boost, external geometry library, Python, or test framework is required.
Simulation code uses standard C++ and is portable; the supplied editor setup
targets the requested Windows/MSVC environment.

Open **x64 Native Tools Command Prompt for VS 2022**, then:

```bat
cd prompt2product\simulator
code .
cmake -S . -B build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure
build\iot_simulator.exe tests\basic.json
```

Run every command from `simulator/`. No Visual Studio solution is needed. The
Debug configuration includes MSVC symbols (`/Zi`, linker `/DEBUG`) through
CMake's standard Debug flags. If `build/` has a cache for another generator,
preserve it under a different name before configuring NMake; generators cannot
share a build tree. The initial checkpoint's Ninja artifacts, if present, have
been preserved in the ignored `build-initialization/` directory.

## VS Code

All editor files are in `simulator/.vscode/`; open **only simulator/**. Launch
VS Code from the initialized x64 developer prompt so `cl.exe`, `nmake.exe`, and
SDK environment variables are inherited. If VS Code was already running with
another environment, fully close it first and reopen from that prompt.

Use Terminal > Run Task > Configure CMake, or press Ctrl+Shift+B to configure and
build. Run Task > Run basic geometry builds and runs the fixture. Press F5 for
`Debug geometry (MSVC)`; it builds first, runs `tests/basic.json`, and supports
breakpoints in `src/geometry.cpp`. For CMake Tools commands select the MSVC x64
kit matching the initialized environment and the Debug variant.

IntelliSense uses `cl.exe`, C++20, and the CMake Tools configuration provider,
which supplies project and fetched dependency include paths. NMake does not
generate `compile_commands.json`; the export setting is enabled for generators
that support it, while the provider handles NMake.

## CLI and process contract

File request:

```bat
build\iot_simulator.exe tests\basic.json
```

Complete stdin request, terminated by EOF:

```bat
build\iot_simulator.exe < tests\basic.json
type tests\basic.json | build\iot_simulator.exe
```

Each process consumes one complete JSON request and emits one JSON response
plus a newline to stdout. Success exits 0; failures exit 1. Diagnostics go only
to stderr. Empty input, malformed JSON, trailing data, missing files, and invalid
arguments produce structured errors. A future backend can pipe JSON to stdin,
close stdin, collect stdout, and parse the single response. There is no HTTP server.

## Input schema 1.0

All shown fields are required. `gateways` must always be an array. Positions and
dimensions are finite JSON numbers in a common logical floor-plan coordinate
system, **not metres**. Floor and room dimensions must be positive. IDs are
nonempty strings, unique within each collection; `device.room_id` must reference
a configured room. Coordinates may be negative or outside floor/room bounds;
room membership is metadata and containment is not imposed by the loader.

Device types: `temperature_sensor`, `leak_sensor`. Room types: `room`, `lobby`,
`bathroom`, `reception`. Wall materials: `drywall`, `wood`, `concrete`, `metal`.
The contract has no device state field; the specified state field is gateway
`active`, which requires a JSON boolean (not 0/1 or a string). Gateways and
reception remain separate from devices.

`coverage_required` and `min_reliability` must be in [0, 1]; `max_latency_ms`
must be non-negative. Requirements are validated and preserved but not evaluated.
Unknown extra fields are ignored. Unsupported schema versions are rejected.
Arrays can be empty; zero pairs serialize as `"links": []`.

Example (`tests/basic.json`):

```json
{
  "schema_version": "1.0",
  "floor": {"width": 1000, "height": 600},
  "rooms": [{"id": "room_101", "name": "Room 101", "type": "room", "x": 0, "y": 0, "width": 1000, "height": 600}],
  "walls": [],
  "devices": [{"id": "temp_101", "type": "temperature_sensor", "x": 0, "y": 0, "room_id": "room_101"}],
  "gateways": [{"id": "gateway_1", "x": 3, "y": 4, "active": true}],
  "reception": {"id": "reception", "x": 725, "y": 340},
  "requirements": {"coverage_required": 0.95, "max_latency_ms": 2000, "min_reliability": 0.95}
}
```

Calculated output:

```json
{
  "schema_version": "1.0",
  "status": "ok",
  "geometry": {
    "links": [{"source": "temp_101", "destination": "gateway_1", "distance": 5.0, "walls_crossed": 0, "wall_attenuation_db": 0.0}]
  }
}
```

Failure example:

```json
{"schema_version":"1.0","status":"error","error":{"code":"INVALID_INPUT","message":"$.floor.width: must be positive"}}
```

Expected input failures use `INVALID_INPUT`; unexpected runtime failures use
`INTERNAL_ERROR`. Validation messages include the affected field path where
available. `json_io.hpp/.cpp` owns request parsing, input serialization, and
success/error response serialization.

## Geometry policy and assumptions

- Distance uses Euclidean `std::hypot` in floor-plan units.
- Room containment includes boundaries.
- General segment intersection includes crossings, endpoint contact, collinear
  overlap, parallel cases, and zero-length segments.
- **Penetration requires a transverse crossing of both open segment interiors.**
  Touching a wall endpoint, ending/starting on a wall, travelling along it, and
  zero-length paths/walls contribute zero crossings and zero attenuation.
- Tolerance is `1e-9` logical units for perpendicular distance and bounding-box
  comparisons. Orientation uses translated, scaled differences to reduce
  cancellation and overflow, with an additional roundoff allowance of eight
  machine epsilons times the sum of the normalized cross-product terms.
  Contacts within tolerance are treated as collinear. As with ordinary
  double precision arithmetic, extreme scales and nearly collinear geometry may
  lose precision. This is not an exact computational geometry kernel.
- Each wall entry is visited once for each calculation. Duplicate wall IDs are
  rejected. Separate IDs describe independent segments, including coincident
  segments, and can each contribute once; no wall merging is performed.
- Default attenuation assumptions: drywall 3 dB, wood 5 dB, concrete 12 dB,
  metal 20 dB. They are configurable through `AttenuationAssumptions` in C++.
  They are simulation assumptions, not precise universal measurements. No
  attenuation settings have been added to the fixed JSON input schema.
- Links are emitted in device order, then gateway order. All configured gateways
  are evaluated, including inactive ones; `active` does not suppress geometry.
  No gateway is selected. Reception is preserved but not evaluated as a link.
- Non-finite inputs and overflowing distance results are rejected rather than
  emitted as JSON null.

## Repeatable verification

`ctest --test-dir build --output-on-failure` runs two lightweight suites:

- `geometry_and_contract`: C++ checks for distances, room boundaries, intersection
  edge cases and tolerance, material assumptions, all five fixtures, round-trip
  JSON, multiple devices/gateways, empty arrays, and validation failures.
- `cli_contract`: CMake drives the actual executable in file/stdin modes,
  parses JSON stdout, checks known numeric results, exit codes and stderr,
  and verifies malformed/missing/unsupported/state/trailing-data errors.

Fixture expectations:

| Fixture | Distance | Walls crossed | Wall attenuation (dB) |
|---|---:|---:|---:|
| basic.json | 5 | 0 | 0 |
| single_wall.json | 5 | 1 | 12 |
| multiple_walls.json | 5 | 2 | 17 |
| no_intersection.json | 5 | 0 | 0 |
| same_position.json | 0 | 0 | 0 |

## Current limits

No signal propagation, RF path loss, RSSI, coverage, reliability calculation,
network connectivity, packet loss, latency simulation, optimization, AI,
backend API, or frontend is implemented. Wall thickness is not modeled. This
checkpoint stops at validated JSON and geometry for every device/gateway pair.

## Shared contract and backend integration

The existing schema 1.0 field names are now recorded in
`../shared/input.schema.json` and `../shared/output.schema.json`. See
`../shared/README.md` for shared acceptance rules and `../backend/README.md` for
the real FastAPI subprocess adapter. Run the backend integration tests from
the repository root after building this executable; no simulator algorithm
change is required for the HTTP adapter.
