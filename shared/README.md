# IoTForge shared contract

Roadmap baseline: **1.0.0**, checkpoints **00-10**. Wire schema: **"1.0"**.
This directory currently specifies **CP01-02 geometry interoperability only**.
Both developers own this contract. Existing field names must remain stable;
breaking changes require explicit agreement and a schema version change.

- `input.schema.json`: JSON Schema Draft 2020-12 for one complete request.
- `output.schema.json`: one geometry success object or structured error object.
- `fixtures/basic-hotel.json`: five guest rooms, lobby, bathroom, reception,
  five temperature sensors, one leak sensor, and one gateway.
- `fixtures/wall-obstruction.json`: one horizontal link of length 220 logical
  units crossing the interior of one concrete wall; expected attenuation 12 dB.

`weak-signal.json` and `gateway-failure.json` are deferred to CP03 and CP09.
Creating them now would imply behavior the simulator cannot calculate yet.

## Compatibility decisions for CP01-02

- Coordinates and dimensions are common logical 2D units, **not metres**.
  Physical conversion begins at CP03 and is not silently assumed now.
- IDs are nonempty strings, unique **within each collection**, preserving the
  existing simulator contract. `room_id` references a room ID. The schemas
  describe these semantic constraints; C++ checks them. A future change to
  global ID uniqueness must be agreed explicitly.
- Dimensions are positive; every numeric value is finite. Coverage/reliability
  requirements are fractions in [0,1]; maximum latency is nonnegative.
- Gateways are always an array with real JSON `active` booleans. The demo will
  use one or two; the existing parser does not impose a new two-gateway cap.
- Extra fields are tolerated, preserving the existing parser behavior. They
  do not enable future simulation features. Empty arrays are permitted.
- Device types are exactly `temperature_sensor` and `leak_sensor`. Gateways
  and reception are separate entities. There is no device state field yet.
- Room types are `room`, `lobby`, `bathroom`, `reception`. Materials are
  `drywall`, `wood`, `concrete`, `metal`.
- Room bounds and device positions are not clamped to the floor. Room metadata
  does not imply automatic geometric containment validation.
- Each wall is an independent segment. Strict transverse interior crossing
  counts; endpoint-only contact, collinear overlap and zero-length segments do
  not penetrate. Defaults are 3/5/12/20 dB for drywall/wood/concrete/metal.
- Every device/gateway pair is evaluated, including inactive gateways, because
  this checkpoint describes geometry only. This does not mean an offline
  gateway carries traffic. Traffic eligibility belongs to later checkpoints.
- Requirements and reception are preserved/validated; no requirements are
  evaluated and no reception uplink/latency is simulated at CP02.

## Frontend handoff

POST the **complete input object** to `http://127.0.0.1:8000/api/simulate` with
`Content-Type: application/json`. Do not wrap it in a `data`, `layout` or
`simulation` property. Use the fixtures as executable examples.

```ts
const response = await fetch(`${apiBase}/api/simulate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(exportedLayout),
});
const result = await response.json();
if (!response.ok || result.status === "error") {
  throw new Error(result.error?.message ?? "Simulation request failed");
}
// Render result.geometry.links; keep unsupported network metrics unavailable.
```

The current frontend uses internal `kind`, `w`, `h`, `roomId`, `temperature`,
`leak`, and room-based device placement. Its owner must map those to contract
`type`, `width`, `height`, `room_id`, `temperature_sensor`, `leak_sensor`, and
explicit device/gateway `x`/`y`. Separate gateway records and include `active`.
Choose and document one mapping from grid cells to logical coordinates, then
use it for floor, rooms, walls, sensors, gateways and reception alike.

The current frontend uses Next.js/port 3000; the final scope specifies Vite/5173.
Both development origins are allowed by default. No frontend framework migration
is performed here; that decision remains with the team.

Error shape is always:

```json
{"schema_version":"1.0","status":"error","error":{"code":"INVALID_INPUT","message":"Description"}}
```

See `backend/README.md` for status codes, configuration and startup commands.

## Shared acceptance gate

Backend/C++ tests alone are **COMPONENT PASSED** evidence. CP00-02 still require
the frontend to export valid JSON and display actual returned geometry. Confirm
sensor movement, concrete wall obstruction and non-intersecting walls from the
browser. No integration pass is declared until both developers record that
evidence. CP03 is not assigned by this implementation; CP06-10 cannot proceed
before the mandatory CP05 end-to-end gate.
