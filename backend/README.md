# FastAPI orchestration

Run from the repository root using `start.ps1` after `demo/build.ps1` and Ollama
model setup. The launcher requires configured Ollama and starts its service if needed.
FastAPI hosts the built frontend and `/api/*` together at 127.0.0.1:8000.
API docs: `/api/docs`. See root README and shared/API.md for all endpoints.

The backend validates shared schema 1.0, executes the real C++ binary via JSON
stdin/stdout without a shell, validates its output, and preserves nonzero errors,
timeouts and diagnostic stderr separation. C++ owns all simulation metrics.
`planning.py` asks local Ollama for schema-constrained proposals; validates room
placement and verifies proposals using C++. AI failure is explicitly labeled.
Optimization sends actual diagnostics and retains a result only if verified
better; a bounded fallback search is clearly identified. Failure/recovery always
runs real C++ and preserves original requirements.

Configuration environment variables:
- IOTFORGE_SIMULATOR_PATH: absolute or repo-relative executable path.
- IOTFORGE_SIMULATOR_TIMEOUT: positive seconds, default 10.
- IOTFORGE_CORS_ORIGINS: comma-separated development origins (3000/5173 defaults).
- IOTFORGE_OLLAMA_URL: default http://127.0.0.1:11434.
- IOTFORGE_OLLAMA_MODEL: default qwen2.5:1.5b.
- IOTFORGE_AI_TIMEOUT: positive seconds, default 120.

Install: `python -m venv backend/.venv`, then the environment's Python with
`-m pip install -r backend/requirements-dev.txt`.
Test: `backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests -v`.
Live: `backend/.venv/Scripts/python.exe demo/verify_final.py --require-ai`.
Production needs requirements.txt only. Bind to loopback; this hackathon MVP
has no accounts, authentication, persistence or public-hosting hardening.
