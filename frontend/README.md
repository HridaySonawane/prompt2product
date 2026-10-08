# IoTForge frontend

This checkout currently runs the browser UI with Next.js. It sends complete
schema 1.0 layout JSON to the FastAPI service and displays geometry links and
structured backend errors. The API returns geometry only for CP00–02; the UI
does not present coverage, reliability, latency, or requirement results as
simulated values.

## Run locally

Start the C++ simulator build and FastAPI service first. The full Windows
startup steps and service responsibilities are in the [repository README](../README.md).

Then, from this directory:

```bat
npm ci
npm run dev
```

Open `http://localhost:3000`. The default API URL is
`http://127.0.0.1:8000`. Override it before starting Next.js with
`NEXT_PUBLIC_IOTFORGE_API_URL` if FastAPI uses another address. The backend must
allow the frontend origin in `IOTFORGE_CORS_ORIGINS`.

The status indicator checks `GET /api/health`; a successful health response
means FastAPI is reachable and reports whether the simulator executable file
exists. It does not itself prove a successful simulation. Use **Simulate layout**
to run a real request through FastAPI and C++.

## Framework note

The approved product scope names Vite, while this checkout and its repository
instructions currently use Next.js. This integration keeps the current
framework; resolve that scope mismatch with the team before making a
framework-level change.
