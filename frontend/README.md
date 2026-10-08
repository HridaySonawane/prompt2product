# IoTForge frontend

React + TypeScript + Vite. The user-approved final stack replaces the previous Next/Turbopack configuration, whose production build failed in this environment.

From this folder: `npm ci`, `npm run build`, then `npm run dev` (port 3000).
The Vite dev/preview server proxies `/api` to FastAPI on 127.0.0.1:8000.
`npm run lint` runs strict TypeScript checks; the production build checks types too.

For the production demo, build once, then run FastAPI from the repository root:
`backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`.
Open http://127.0.0.1:8000 — FastAPI serves `dist/` and the APIs together.
Optional `VITE_IOTFORGE_API_URL` changes the API origin at build time.

Metrics and PASS/FAIL come from C++; edits clear old results. The layout editor
supports rooms, sensors, gateways, walls, requirements and schema 1.0 import/export.
See the root README for the final complete demo and simulation assumptions.
