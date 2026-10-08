# Room movement and content editing — 2026-10-08

CHECKPOINT: CP10 (editor corrections within the assigned final scope)

STATUS: COMPONENT PASSED

IMPLEMENTED:
- Pointer capture lives on the stable SVG root. Room bodies and locked contents
  move the entire assigned area; grabbing anywhere preserves the pointer offset.
- Collision handling keeps the dragged area fixed and automatically rearranges
  other areas. All affected sensors, gateways and reception follow their areas.
- Contents are locked by default. Individual dragging/numeric coordinates require
  explicit unlocking and remain clamped to the assigned area's interior.
- Selecting an area opens its Contents list with add, inspect, remove and explicit
  reassignment controls. Gateway online state is editable there. Reception is a
  required singleton and can be transferred, including safe relocation when its
  area is deleted. The final area is protected from deletion.
- Resizing carries occupants and rearranges neighbours. Impossible arrangements
  preserve the last valid state. Escape, lost capture, pointer cancellation and
  window blur cancel the complete move transaction.
- Coordinate conversion handles SVG scaling and letterboxing. Clicking fractional
  positions to inspect does not round or move them. Edits invalidate stale metrics.
- The old packaged server on port 8000 was replaced with the current source build.

FILES MODIFIED:
- `frontend/src/App.tsx`, `editor.ts`, `room_layout.ts`, `styles.css`.
- `frontend/package.json`, `package-lock.json` (test-only React testing/jsdom tools).
- `frontend/tests/interaction.test.ts`, `room_layout.test.ts`,
  `simulator.integration.test.ts`.
- Root README, this report and `demo/evidence/acceptance-summary.json`.
- No backend, C++ simulator, API or shared-schema source changes.

TESTS EXECUTED:
```powershell
.\demo\build.ps1
cd frontend
npm test
npm run build
cd ..
backend\.venv\Scripts\python.exe -m backend.verify_http --base-url http://127.0.0.1:8000
backend\.venv\Scripts\python.exe demo\verify_final.py --url http://127.0.0.1:8000 --require-ai
.\demo\package.ps1
```

TEST RESULTS:
- Windows/MSVC/NMake Debug and static-runtime Release builds: passed.
- CTest: 3/3 suites passed in each configuration. Backend: 33/33 passed.
- Clean dependency installation/audit: passed, zero reported vulnerabilities.
- Final strict TypeScript/Vite build: passed. Vite's existing dependency
  `use client` warnings are nonfatal in this client-only application.
- Frontend/editor: **37/37 passed, none skipped**: 17 placement/packing tests,
  17 React event tests, 3 real C++ stdin/stdout integration tests.
- Packing tests include 100 deterministic random move/resize attempts, neighbour
  chains, floor edges, impossible placement rollback, imports, tiny rooms, crowded
  contents, area deletion and reception ownership after type changes.
- React tests exercise the actual selection/drag/keyboard/add/remove handlers,
  root capture, explicit unlocking/reassignment, numeric boundaries, resizing,
  pointer cancellation, stale-result invalidation and outgoing request positions.
- C++ integration verifies moved sensors change calculated distance, all reported
  link distances match actual edited coordinates, rearranged lobby/reception
  requests remain valid, and fixed-seed results repeat exactly.
- Live HTTP checks: 8/8 passed. Two complete live workflows passed with actual
  Ollama `qwen2.5:1.5b`, real C++ design/optimization/failure/backup evaluations,
  original requirement recovery and exact response reruns. No fallback was used.
- Port 8000 HTML matches the current production `frontend/dist/index.html`.
- Rebuilt runtime ZIP: 11 frontend/runtime/source entries byte-verified against
  the current build, including all frontend assets and the Release executable.

SHARED CONTRACT CHANGES: None. Sensor `room_id` is unchanged; gateway/reception
area bindings remain editor-only. Wall segments remain independent floor objects.

INTEGRATION EVIDENCE: Actual HTTP results are saved in
`demo/build/live-acceptance.json`; the tracked summary is
`demo/evidence/acceptance-summary.json`. React event tests use jsdom with explicit
API test doubles and emulated pointer capture. They are **not** browser visual
acceptance and are separate from actual C++/HTTP/Ollama evidence.

LIMITATIONS:
- Live browser visual verification remains pending because of the previously
  reported saved browser permission denial. Run the updated README manual UI
  checklist on port 8000 with Ctrl+F5 before submission sign-off.
- The bounded packing heuristic can reject a dense arrangement even when some
  other mathematical packing exists; it leaves a safe layout and explains why.
- Crowded/tiny areas can have overlapping device markers; the Contents list lets
  users select and remove every item. Independent walls do not follow rooms.
- This correction does not change the approximate radio/network model.

READY FOR SHARED ACCEPTANCE: NO — automated component checks passed; current UI
visual acceptance and team sign-off are still required.
