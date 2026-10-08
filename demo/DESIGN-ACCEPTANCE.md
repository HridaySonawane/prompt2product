# Explicit design counts — regression evidence, 2026-10-08

CHECKPOINT: CP10 regression fix

STATUS: COMPONENT PASSED; browser/shared acceptance pending.

IMPLEMENTED:
- `2 rooms, 1 bathroom, 1 lobby, 1 gateway` replaces the default building with
  four areas, three sensors and one gateway. Required reception is a point in
  the lobby, rather than an extra unrequested area.
- Existing-building monitoring and optimization preserve the building.
- Count conflicts, unsupported gateways, invalid numbers and layouts too large
  for the floor return structured errors. Fallback also preserves requested counts.
- Actual C++ output is retained for the exact returned positions. Count agreement
  does not imply network requirements pass. UI messaging now makes this distinction.
- Completed-design logs include requested/actual counts, mode and planner source.

FILES MODIFIED:
- Backend: `design_layout.py`, `planning.py`, `tests/test_design_layout.py`, README.
- Frontend: `src/App.tsx`, `src/models.ts`, `tests/interaction.test.ts`.
- Contract/documentation: root README and `shared/API.md`.
- Verification: this report, `verify_design.py`, `evidence/design-counts-summary.json`.

TESTS EXECUTED (repository root, Windows x64):

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
Push-Location frontend
npm.cmd test
npm.cmd run build
Pop-Location
.\backend\.venv\Scripts\python.exe demo/verify_design.py
.\demo\build.ps1 -SkipInstall
```

TEST RESULTS:
- Backend: 47/47 passed, including 14 new count/packing/real-C++ tests.
- Frontend: 39/39 passed, including two new React request/render/error tests.
  Those React network responses are explicit test doubles, not live AI evidence.
- TypeScript/Vite production build passed.
- Master build passed: MSVC NMake Debug/Release builds, CTest 3/3 in each,
  backend/frontend suites and refreshed Windows runtime ZIP.
- Actual local `qwen2.5:1.5b` and real C++: three design cases passed (2-room,
  3-room/two-gateway, then 2-room again); each response equaled a separate C++ run
  for its returned layout. Unsupported three-gateway request returned HTTP 422.
- The two-room example calculated coverage 2/3 and reliability 0.64, with network
  requirements FAIL. The three-room/two-gateway example calculated coverage 1.0,
  reliability 0.98375 and requirements PASS. These are seeded simulated results,
  not real-world measurements or a promise that an initial design will pass.
- Live model test durations: 3.234s, 1.750s and 1.375s on this Windows machine.

SHARED CONTRACT CHANGES:
- Simulator input/output schemas and version 1.0 unchanged.
- Additive backend `design_request` envelope documents count validation.
- New generation semantics and limits are documented in `shared/API.md`.

INTEGRATION EVIDENCE:
- `verify_design.py` used FastAPI TestClient against fresh source, actual Ollama
  API and actual C++ processes. No alternate app server was launched.
- Full response evidence is written to ignored `demo/build/design-acceptance.json`;
  compact actual results are committed in `evidence/design-counts-summary.json`.
- The user's existing port-8000 backend was left running. It loaded the old Python
  code before this fix and needs a launcher restart. Production frontend was rebuilt.
- No browser visual verification is claimed; saved browser permission had blocked
  prior access. Actual React event tests cover loading/replacing areas and error retention.

LIMITATIONS:
- Bounded rectangular grid, 1–32 areas, one/two gateways, digit or simple English
  word counts (use digits for compound counts such as 21). Arbitrary architectural
  prose/dimensions/adjacency are not CAD instructions.
- Area counts replace existing areas and walls; monitoring-only requests preserve
  them. This is explained in the UI before generation.
- C++ simulation assumptions remain approximate. AI source provenance identifies
  gateway/monitoring proposals; packing and sensor centres are deterministic.

READY FOR SHARED ACCEPTANCE: NO — restart and user/browser visual verification
of the updated application remain required before closing team acceptance.

After stopping the existing root launcher with Ctrl+C, run `./start.ps1` again,
refresh the browser and generate the exact two-room example. The screen must show
four areas and three sensors. A FAIL network result is valid; use Optimize placement
to evaluate improvements. Optional repeated live HTTP verification:

```powershell
.\backend\.venv\Scripts\python.exe demo/verify_design.py --url http://127.0.0.1:8000
```
