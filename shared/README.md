# Shared schema 1.0

`input.schema.json` and `output.schema.json` are the authoritative additive
frontend/backend/C++ contract. Existing floor, room, wall, device, gateway,
reception, requirements, geometry and error field names remain stable.

Optional `simulation` adds explicit physical scale, deterministic packet settings
and heatmap resolution. Without it, CP01-02 geometry-only behavior is preserved.
Network requests validate floor bounds and the two-gateway MVP limit in C++.
Schema validates numeric ranges and types; semantic ID/reference/placement checks
are also performed by the engine. No non-finite numbers are permitted.

See NETWORK_MODEL.md for formulas/assumptions, API.md for backend envelopes, and
fixtures/ for repeatable examples. Basic-hotel and wall-obstruction remain geometry
fixtures. Network-hotel, weak-signal and gateway-failure enable real network runs.
Checkpoint evidence files record actual executed checks, not automatic team closure.
