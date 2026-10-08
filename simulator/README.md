# IoTForge C++20 simulator

Standalone C++20 engine for geometry, approximate radio links, seeded packet
trials, requirements, signal grids and gateway failure/reassociation. It uses
STL and nlohmann/json v3.12.0 (FetchContent release archive with SHA-256 pin).
No HTTP server, AI, Python runtime, or external geometry/test framework in C++.

From VS 2022 x64 Native Tools Command Prompt:

```bat
cd prompt2product\simulator
code .
cmake -S . -B build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure
build\iot_simulator.exe ..\shared\fixtures\network-hotel.json
type ..\shared\fixtures\network-hotel.json | build\iot_simulator.exe
```

CMake 3.20+, MSVC x64, Windows SDK and NMake are required for this workflow.
VS Code configurations are local to this simulator folder, use cl.exe from the
initialized environment, NMake Debug, C++20, and cppvsdbg with symbols. No
absolute Visual Studio installation paths or solution file are required.

`iot_simulator` accepts one filename or one complete stdin JSON object.
Exactly one schema 1.0 JSON object is emitted to stdout. Logs go to stderr.
Invalid input/file/JSON produces structured error JSON and a nonzero exit.

Input fields and enums remain unchanged. Optional `simulation` requires explicit
positive `metres_per_unit`. Without it, output is CP01–02 geometry-only; with it,
output includes signal, network metrics, requirements and a bounded heatmap.
See shared schemas, fixtures, API.md, and NETWORK_MODEL.md for complete contract,
formulas, parameter bounds, sampling, null latency and repeatability semantics.

Geometry functions include hypot distance, inclusive rectangular containment,
inclusive segment intersection, and strict wall penetration. Tolerance is 1e-9
logical units of perpendicular distance/bounds. Both segment interiors must
cross transversely to penetrate: endpoint contact, collinear travel and zero
length segments do not count. Distinct wall segments are independent; each is
counted at most once. Loss assumptions: drywall 3, wood 5, concrete 12, metal 20 dB.

CTest suites verify geometry and JSON validation/roundtrips, actual CLI file/stdin
success/errors, physical scale and exact RSSI equations, packet conservation,
fixed-seed repeatability, active gateway selection, undefined latency, monitoring
and latency requirements, grid values and wall attenuation. Backend integration
regressions additionally exercise real optimization and failure/recovery.

This is an approximate planning simulator, not calibrated physical Wi-Fi or a
complete real-world network emulator. It assumes independent packet trials,
fixed airtime/retry delays and wired reception backhaul. No interference,
contention, queues, actual hardware, multi-floor or cybersecurity analysis.

The root demo/build.ps1 also creates a Release `/MT` runtime for distribution;
Debug remains the VS Code development configuration.
