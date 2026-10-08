# CP05 real integration evidence

Verified on Windows/MSVC, 2026-10-08. The user assigned final-scope work across all
components. No stub or mocked simulator was used for these acceptance runs.

- `cmake --build simulator/build`: MSVC 19.44 Debug succeeded.
- CTest: 3/3 suites passed (geometry/contract, signal/packets, CLI protocol).
- `backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -v`:
  20/20 tests passed, including shared fixture equality against real CLI output.
- `npm run build` and `npm run lint` in frontend: successful TypeScript checks
  and Vite production build. Next/Turbopack was explicitly replaced with the
  user-approved Vite stack after its production build failed.
- Started FastAPI on 8000 and production Vite preview on 3000 with `/api` proxy.
- Browser Run 1, default `network-hotel` layout: 6/6 reachable, 1200/1200 delivered,
  310 ms worst latency, all four requirements checks PASS.
- Browser changed gateway_1.x from 340 to 800 and clicked Simulate.
  Run 2: 4/6 reachable, 616/1200 delivered, worst latency null (shown Undefined),
  requirement FAIL. Per-device links showed changed calculated RSSI.
- Browser reset hotel and simulated again: original Run 1 values restored.
  No manual JSON editing or service restart between runs.

Frontend metrics, links, and requirement checks use returned C++ results.
Layout edits clear previous results. Shared schema remains 1.0, with the
documented additive simulation extension in NETWORK_MODEL.md.

This records reproducible component and end-to-end evidence. Official checkpoint
closure remains the team's decision. CP06–10 implementation follows this gate.
