## Frontend tooling

The user authorized final-scope completion across all components. The frontend was explicitly migrated from Next.js to the approved React + Vite stack after its production build failed. Use npm ci, npm run build, and npm run dev. Source lives in src/.

## IoTForge final project scope — mandatory boundary

The product is **IoTForge: AI-Assisted IoT Network Planning, Simulation & Resilience Testing** (“Design it. Simulate it. Break it. Improve it.”). Keep all project work strictly within the user-approved final scope below. Do not add unrelated features or expand the product.

### Product outcome

Deliver a working, reproducible browser application for planning and evaluating a small, single-floor hotel or office IoT network. The end-to-end demo is: customize a simple building → enter monitoring requirements → AI proposes sensor/gateway placement → C++ simulates it → view calculated results → AI proposes and simulator verifies improvements → fail a gateway → test a backup gateway.

### Included scope

- One floor with rooms, lobby, bathroom, reception, and simple walls; basic add, delete, move, resize, and rename controls.
- Temperature and water-leak sensors; one or two wireless gateways.
- Distance and wall-attenuation radio model; connectivity, packet delivery, reliability, and latency simulation.
- 2D floor plan, signal heatmap, sensor/gateway links, calculated metrics, requirement PASS/FAIL, before/after comparison, gateway-failure visualization, and backup-gateway recovery.
- AI requirement interpretation, initial placement, and optimization suggestions. The C++ simulator must verify proposed changes; AI must not invent simulator metrics.
- The approved stack is React + TypeScript + Vite + Canvas/SVG, Python FastAPI, C++20 with STL/nlohmann-json/CMake, Ollama with a suitable open-weight model, and HTTP/JSON with C++ stdin/stdout. No database is required.

### Explicit exclusions

Do not add real ESP32/hardware connections, physical Wi-Fi implementation, firmware, MQTT, full cybersecurity scanning, multiple floors, 3D modeling, advanced CAD, unrelated chatbot features, accounts, cloud infrastructure, or mobile apps.

### Acceptance and placeholder rules

- Every displayed simulation metric and requirement result in the working application must come from the simulator. Do not use hard-coded values as if they were calculated results.
- Any illustrative mock, stub, or placeholder must be clearly labeled and excluded from integration acceptance.
- Keep the deployment reproducible from documented startup instructions.
- Vite is the approved and implemented frontend stack.
