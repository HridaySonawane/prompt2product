# IoTForge

**Design it. Simulate it. Break it. Improve it.**

AI-assisted indoor IoT planning and resilience testing. The roadmap baseline is
1.0.0 (CP00-10); the wire schema is `"1.0"`. Current implemented simulation scope
is **CP01-02 geometry only**, using approximate wall attenuation assumptions.
Radio/network metrics, AI and failure scenarios require later assignments.

| Directory | Responsibility |
|---|---|
| `simulator/` | C++20 standalone geometry engine |
| `backend/` | FastAPI health, schema validation and real subprocess adapter |
| `shared/` | Versioned schemas, fixtures and frontend handoff |
| `frontend/` | Teammate-owned React/TypeScript UI (currently Next.js) |

## Start locally on Windows

1. In the VS 2022 x64 Native Tools Command Prompt, from this repository root:

   ```bat
   cmake -S simulator -B simulator/build -G "NMake Makefiles" -DCMAKE_BUILD_TYPE=Debug
   cmake --build simulator/build
   ctest --test-dir simulator/build --output-on-failure
   python -m venv backend\.venv
   backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
   backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
   backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

2. In another terminal, from the repository root:

   ```bat
   backend\.venv\Scripts\python.exe -m backend.verify_http
   cd frontend
   npm ci
   npm run dev
   ```

Frontend: `http://localhost:3000`. Backend: `http://127.0.0.1:8000`.
API docs: `http://127.0.0.1:8000/docs`. The current frontend has not yet been
connected to this adapter and its local demo metrics are not acceptance evidence.
The production frontend build previously failed in its Turbopack CSS worker;
frontend changes and framework decisions remain with its owner.

No database, Ollama instance, device hardware or additional network service is
required for CP00-02. There is no HTTP server inside C++.

See [backend setup](backend/README.md), [shared contract and handoff](shared/README.md)
and [simulator setup](simulator/README.md). Both developers must verify real
browser-to-backend-to-C++ behavior before declaring an integration checkpoint
passed. CP06-10 remain gated on CP05.
