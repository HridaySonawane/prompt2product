# Workspace polish and placement verification — 2026-10-08

Historical report for the first UI polish. Current room movement/content editing
and test evidence are recorded in [EDITOR-ACCEPTANCE.md](EDITOR-ACCEPTANCE.md).

CHECKPOINT: CP10 (final project polish)

STATUS: COMPONENT PASSED for automated checks; BLOCKED for final visual acceptance.

IMPLEMENTED:
- Compact neutral workspace, local system fonts, restrained copy, Lucide icons,
  shadcn/ui buttons/dialogs/tabs/switches, and Radix focus/keyboard behavior.
- Planning moved to a dialog; provenance is compact and expandable. Fallback
  remains explicitly labeled. Metrics and requirement results still come from C++.
- Sensors and gateways stay inside their assigned areas during dragging,
  keyboard movement and numeric edits. Room changes are explicit. Room movement
  and resizing carry devices; floor-boundary movement preserves area dimensions.
- Small imported areas scale their markers; repeated additions use available
  interior space. Removing an area removes its assigned devices.
- Imported placements are fitted and simulated again before displaying results.
  Generated/optimized/backup gateways are fitted before their real C++ evaluation.

FILES MODIFIED:
- `frontend/src/App.tsx`, `editor.ts`, styles, UI components, utilities, entry HTML,
  Vite/TypeScript/component configuration, dependency lock and placement tests.
- `backend/planning.py`, `backend/tests/test_final.py`.
- `demo/build.ps1`, `demo/verify_final.py`, acceptance evidence, root README,
  `shared/API.md`. No simulator source or schema fields changed in this revision.

TESTS EXECUTED:
```powershell
.\demo\build.ps1
cd frontend
npm test
npm run build
npm audit --audit-level=high
cd ..
backend\.venv\Scripts\python.exe -m backend.verify_http --base-url http://127.0.0.1:8002
backend\.venv\Scripts\python.exe demo\verify_final.py --url http://127.0.0.1:8003 --require-ai
```

TEST RESULTS:
- Actual MSVC/NMake Debug and static-runtime Release builds: passed; 3/3 CTest
  suites in each build (geometry/contract, signal/packets, CLI contract).
- Backend: 33/33 passed; frontend placement regressions: 9/9 passed.
- Clean `npm ci`, strict TypeScript and Vite production build: passed.
- Dependency audit: zero reported vulnerabilities.
- Live HTTP contract checks: 8/8 passed.
- Extracted runtime API: two workflows passed with actual Ollama
  `qwen2.5:1.5b` for both design and optimization, real C++ evaluations,
  exact-response reruns, valid room placement, and production asset delivery.
- Weak deployment: 0/6 reachable, reliability 0, latency null, requirements FAIL.
  Optimization: 6/6 reachable, 1200/1200 delivered, worst latency 310 ms, PASS.
  Failure: coverage/reliability 0, latency null, FAIL. Backup: 6/6 reachable,
  1200/1200 delivered, worst latency 310 ms, original requirements PASS.
- The final additional floor-boundary placement regression passed after the
  clean build; frontend build and runtime archive were refreshed afterwards.

SHARED CONTRACT CHANGES: None to field names, types, schemas, or simulator model.
Gateway room ownership is editor-only. Planner projection policy is documented
in `shared/API.md`; direct simulate requests retain their existing contract.

INTEGRATION EVIDENCE: `demo/build/live-acceptance.json` contains actual requests'
returned layouts and simulation results. The summarized results are in
`demo/evidence/acceptance-summary.json`. Live tests use the extracted Release
simulator via FastAPI and actual Ollama, with no simulation stub.

LIMITATIONS: Browser navigation was rejected by a saved permission setting even
after user approval/retry. The redesigned UI has **not** been visually verified
or exercised through browser controls. The README's manual UI checklist must
pass before submission sign-off. Vite emits dependency `use client` directive
warnings for this client-only application; its production build succeeds.
Radio/network models remain approximate planning assumptions, not site surveys.

READY FOR SHARED ACCEPTANCE: NO — manual visual/editor acceptance remains pending.
