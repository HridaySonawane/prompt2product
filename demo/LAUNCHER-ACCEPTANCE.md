# Root launcher and final repository check

CHECKPOINT: CP10

STATUS: COMPONENT PASSED

IMPLEMENTED: One root `start.ps1` starts configured Ollama and FastAPI, serves
the built React UI, and uses C++ per request. Missing Ollama/model exits 1 with
one Configure Ollama message. No automatic installation/download/fallback at
startup. Ctrl+C cleans up owned process trees; pre-existing Ollama is reused.
`-Check` validates setup and cleans up; occupied ports are rejected. Logs are
ignored under `.runtime/`. The old demo entry point and runtime shortcut delegate
to the same master script. Root README documents source/runtime setup and tests.

FILES MODIFIED: `start.ps1`, `.gitignore`, root/backend README, `demo/start.ps1`,
`demo/build.ps1`, `demo/package.ps1`, `demo/verify_launcher.ps1`, this report and
the acceptance summary. No frontend, backend API, simulator or schema behavior
was changed.

TESTS EXECUTED:
```powershell
.\demo\build.ps1 -SkipInstall
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\demo\verify_launcher.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
# Second terminal while the master launcher is running:
backend\.venv\Scripts\python.exe -m backend.verify_http
Invoke-RestMethod http://127.0.0.1:8000/api/ai/health
# Ctrl+C in launcher terminal, then check there are no app/model listeners.
git diff --check
```

TEST RESULTS: Frontend 37/37; backend 33/33; CTest 3/3 in both MSVC Debug and
Release; strict TypeScript/production build passed. Four launcher preflight checks
cover missing executable, missing model, successful setup and occupied port.
Foreground startup serves the real application and passes eight live HTTP checks.
Actual Ctrl+C cancellation stops the backend and owned Ollama processes. The
runtime ZIP was refreshed with the same master launcher and updated instructions.

SHARED CONTRACT CHANGES: None.

INTEGRATION EVIDENCE: Real master-launcher startup and C++ HTTP requests; actual
model availability; listener checks after cancellation. Preflight checks are
automated; foreground startup/Ctrl+C are terminal lifecycle checks. A Windows
PowerShell background-job test harness did not become ready and was discarded;
the supported foreground launcher was tested directly instead.

LIMITATIONS: Run in a normal foreground Windows terminal and keep it open. Setup
must be completed before startup. Existing approximate-model limitations and
pending manual browser visual/team acceptance from EDITOR-ACCEPTANCE.md remain.

READY FOR SHARED ACCEPTANCE: NO — automated/runtime checks passed; visual and team
sign-off are separate. All project services are left stopped after verification.
