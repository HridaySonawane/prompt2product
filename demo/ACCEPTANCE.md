# Final acceptance evidence

CHECKPOINT: CP10 (final scope across CP00-10)

STATUS: COMPONENT PASSED

IMPLEMENTED: Editable React/Vite floor plan; real FastAPI/C++ integration; shared
schema 1.0; physical scale, wall loss and signal links; seeded delivery/retry
latency; C++ requirements; shared-model heatmap; local Ollama design and
feedback-based optimization; gateway failure, reassociation and backup recovery;
production Windows runtime packaging and reproducible startup scripts.

FILES MODIFIED: simulator/ models, JSON validation, network engine, CMake, tests,
and README; backend/ API, configuration, planning, regression tests and README;
shared/ schemas, fixtures, model/API documentation; frontend/ production build,
editor, metrics/heatmap/AI/resilience UI; root README and demo/ build/start/package
and live-verification scripts. See Git milestone commits for exact file lists.

TESTS EXECUTED:
- `demo/build.ps1` including actual MSVC 19.44 NMake Debug and Release builds.
- CTest in simulator/build and simulator/build-release.
- `backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -v`.
- `npm ci`, `npm run build`; strict TypeScript checks and Vite 7.3.7 build.
- npm dependency audit.
- `backend/.venv/Scripts/python.exe demo/verify_final.py --require-ai`.
- `backend/.venv/Scripts/python.exe -m backend.verify_http`.
- Real browser editor, AI generation, optimization, failure and backup controls.
- Extracted runtime ZIP; created a fresh Python environment; started start.cmd.

TEST RESULTS:
- Debug: 3/3 CTest suites passed. Release: 3/3 passed.
- 123 geometry/contract checks + 25 network/grid checks passed.
- 30/30 backend tests passed, including process timeout, invalid child output,
  invalid input, no-AI manual use, explicit fallback and no fabricated improvement.
- Production frontend build and TypeScript checks passed; npm audit: 0 vulnerabilities.
- Extracted Release runtime: two complete live workflows passed with source=ollama
  for both design and optimization. Weak fixture had 0/6 reachable and no deliveries.
  Optimized result had 6/6 reachable, 1200/1200 delivered, worst latency310ms, PASS.
  Gateway failure produced coverage0/reliability0/latency null/FAIL. Backup restored
  6/6 reachable, 1200/1200 delivered, worst latency310ms, original requirements PASS.
- Eight live HTTP checks passed, including malformed JSON and unsupported schema.

SHARED CONTRACT CHANGES: Additive schema1.0 simulation parameters and calculated
signal/network/grid fields; no renamed existing fields. Explicit metre scale,
seed, null latency, bounds and planner envelopes documented in shared/API.md and
NETWORK_MODEL.md. Legacy geometry-only requests remain supported.

INTEGRATION EVIDENCE: CP05 browser gate recorded in shared/checkpoint-05-evidence.md
before CP06-10 implementation. Full live inputs/outputs saved locally in
`demo/build/live-acceptance.json`; repeat with verify_final.py. Browser verified
room rename/resize, genuine Ollama design, real metrics, weak deployment comparison,
visible labeled fallback, gateway failure and backup restoration. Local screenshots
are delivered separately. No simulator stub used for acceptance.

LIMITATIONS: Approximate planning assumptions, not calibrated radio or protocol
simulation. Single floor, two gateways, fixed wired reception backhaul, independent
packet trials. Local model proposals can fail; fallback is visibly identified and
independently verified. No claims of cybersecurity protection. Python is required
for the prebuilt runtime; Ollama/model is optional and distributed separately.

READY FOR SHARED ACCEPTANCE: YES

Official checkpoint closure remains the team's decision; this report records
component and real integration evidence without declaring team closure.

Release verification follow-up: PASSED. The extracted ZIP cold-started twice. After
the second start, two additional live workflows required actual Ollama design and
optimization and passed. The complete browser workflow also passed twice without
manual JSON/code edits or service restarts, including real Ollama design and
optimization, room rename/resize, C++ metrics, failure and backup recovery.
The recovered UI showed the original gateway offline, backup active, 6/6 reachable,
1200/1200 delivered, 310ms worst latency and requirement PASS.
Final production screenshot: iotforge-final.jpg (local deliverable).
No known demo-blocking issues remain.
