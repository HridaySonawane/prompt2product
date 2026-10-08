# CP00-02 backend/shared/simulator verification

Verified on 2026-10-08, Windows x64, Python 3.11.3, MSVC 19.44, NMake.
Baseline checkout: `d3c0a9c`; the backend and schemas are uncommitted changes.

**STATUS: COMPONENT PASSED (backend and simulator); shared integration pending.**
This record does not declare INTEGRATION PASSED or COMPLETE.

## Implementation

- Shared input/output schemas preserve existing schema `"1.0"` field names.
- Shared fixtures cover a six-sensor hotel and one concrete wall obstruction.
- FastAPI health, strict JSON/schema validation, configured CORS and real C++
  stdin/stdout adapter. Child diagnostics remain separate from JSON results.
- Documented missing-process, timeout and invalid-process-response errors.
- No frontend implementation change or new simulation algorithm.

## Commands and actual results

From the repository root, in an initialized MSVC environment:

```bat
cmake --build simulator/build
ctest --test-dir simulator/build --output-on-failure
simulator\build\simulator_tests.exe simulator/tests
backend\.venv\Scripts\python.exe -m pip check
backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

- MSVC build succeeded.
- CTest: 2/2 suites passed.
- C++ checks: 123 passed.
- pip check: no broken requirements.
- Backend: 20 test methods passed, including real subprocess integration,
  both shared fixtures and all five existing simulator JSON fixtures.
- Timeout/protocol-error unit tests use explicitly injected failures; successful
  integration tests always use the real C++ executable.

With a running server:

```bat
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bat
backend\.venv\Scripts\python.exe -m backend.verify_http
```

All 8 live HTTP checks passed:

1. Health and executable readiness.
2. Six hotel geometry links through real C++.
3. An identical second request without restarting services.
4. Concrete wall: distance 220, one crossing, 12 dB attenuation.
5. Moving the sensor changes distance to 200.
6. Non-intersecting wall contributes zero crossings/attenuation.
7. Malformed JSON returns structured HTTP 400.
8. Unsupported schema returns structured HTTP 422.

Observed wall response:

```json
{
  "schema_version": "1.0",
  "status": "ok",
  "geometry": {
    "links": [{
      "source": "temp_101",
      "destination": "gateway_1",
      "distance": 220.0,
      "walls_crossed": 1,
      "wall_attenuation_db": 12.0
    }]
  }
}
```

## Environment observations

Package installation and API tests needed execution outside the sandbox;
the sandbox could not access the package index and blocked TestClient's local
event-loop sockets. The same API tests passed outside it. Live HTTP verification
also ran outside the sandbox. MSVC verification used Visual Studio's bundled
CMake discovered through vswhere, without project-specific installation paths.

## Remaining shared acceptance evidence

- Frontend export must match the shared schema and a documented logical
  coordinate mapping.
- Browser Simulate must call this backend and render returned geometry.
- Sensor movement and both wall cases must be demonstrated in the browser.
- Frontend placeholder metrics must remain identified as placeholders and
  cannot be used to declare simulation/requirements success.
- The Next.js versus final-scope Vite choice and production frontend build
  failure remain with the frontend owner.

Requirements and reception are validated but not evaluated; inactive gateways
still have geometry links. No RF, packet, latency, AI or resilience claim is
made. CP03 needs an explicit assignment and documented physical-scale/radio
contract extension. CP06-10 remain blocked by the mandatory CP05 gate.
