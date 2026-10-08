# Wall-free generated designs

New count-based floor plans have `walls: []`. Room outlines remain visible but
do not create physical attenuation walls. Monitoring-only requests keep existing
walls. Explicit wall simulations, the radio model, retries and requirement checks
remain functional. No thresholds or calculated metrics were changed to force PASS.

Verification on Windows, 2026-10-08:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend/tests -q
.\backend\.venv\Scripts\python.exe demo/verify_design.py --output demo/build/wall-free-design-acceptance.json
.\demo\package.ps1
```

- Backend: 47/47 passed, including wall-free generation, real-C++ zero wall
  crossings/loss, fallback generation and preservation of existing walls.
- Real Ollama `qwen2.5:1.5b`: two-room, three-room/two-gateway and repeated
  two-room cases all returned no walls. Their actual C++ responses had zero wall
  loss and equaled separate simulations of the returned positions.
- Observed results: two-room/one-gateway example had 100% coverage but 77.17%
  reliability and FAIL; three-room/two-gateway example had 100% coverage,
  96.625% reliability and PASS. Removing walls does not guarantee delivery targets.
- Runtime ZIP refreshed. Shared schemas unchanged; generation policy documented
  in root README and shared/API.md. Frontend and simulator source unchanged.
- This verifies generation behavior; strict requirements or poor gateway positions
  may still fail. No browser visual verification is claimed.

Stop the running root launcher using Ctrl+C and run `./start.ps1` again to load
the updated backend. Generate a new count-based layout: existing saved layouts
retain their own walls until replaced. The current running session was left intact.
