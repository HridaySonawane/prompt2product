# Radio and packet contract extension (schema 1.0)

CP03–04 extend the existing contract additively. No existing fields are renamed.
Without `simulation`, the executable still returns the CP01–02 geometry response.
With `simulation`, `metres_per_unit` is required, positive and explicit. The demo
uses 0.05 metres per logical unit: a 1000×600 floor represents 50×30 metres.

## Approximate assumptions

`RSSI = transmit_power_dbm - reference_loss_db - 10 * path_loss_exponent *
log10(max(1, distance_metres)) - crossed_wall_attenuation_db`.
Defaults: transmit 14 dBm, reference loss 40 dB at one metre, exponent 3,
sensitivity −72 dBm. Distances below one metre use the one-metre loss.
Wall losses remain drywall 3, wood 5, concrete 12, metal 20 dB. Strict wall
interior crossings count; endpoint contact and collinear travel do not.

A sensor selects the strongest reachable **active** gateway, with input order
breaking ties. Reachability requires RSSI at least sensitivity. Each device
generates 200 messages by default, with at most two retries per message.
Per-attempt success probability is
`1 / (1 + exp(-(RSSI - sensitivity_dbm - 5) / 2.5))`.
Independent Bernoulli trials use `mt19937`, seed 1337 by default, and the device
index to derive each stream. Identical requests produce identical results.
This is a chosen planning approximation, not a calibrated protocol or radio model.

Successful delivery latency is `(attempt + 1) * packet_airtime_ms + attempt *
retry_delay_ms + backhaul_latency_ms`: defaults 30, 100 and 20 ms respectively.
Gateway-to-reception backhaul is assumed wired with fixed latency. Reception
position does not introduce another wireless hop. There is no contention,
interference, bandwidth, queuing, real Wi-Fi stack or hardware measurement.

Coverage is the reachable fraction of configured sensors. Reliability is the
delivered fraction of generated messages after retries. Per-device latency is
null when no message arrives. Summary worst latency is null if any sensor has
no deliveries; the latency requirement then fails. Summary average latency
includes delivered messages only. Empty deployments fail requirements.

The C++ engine evaluates coverage, reliability, worst latency, and monitoring:
each guest room requires a temperature sensor inside its rectangle, and each
bathroom requires a leak sensor inside it. The sensor must reference that room.
All four checks must pass. Thresholds come from the unchanged `requirements`.

Optional parameters, bounds, and calculated fields are defined in the shared
schemas. `network-hotel.json` is a normal network request; `weak-signal.json`
deliberately puts a concrete barrier between sensors and a distant gateway.

## Reproduce

From the repository root after an MSVC Debug build:

```bat
simulator\build\iot_simulator.exe shared\fixtures\network-hotel.json
simulator\build\iot_simulator.exe shared\fixtures\weak-signal.json
ctest --test-dir simulator\build --output-on-failure
backend\.venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```

This document defines the final-scope extension; it does not declare shared
checkpoint acceptance without frontend/backend integration evidence.

## Heatmap and placement extension (CP06–09)

Network responses now add a row-major signal grid. `heatmap_columns` and
`heatmap_rows` default to 20×12 and are bounded at 50×50. Each cell reports its
top-left logical coordinates and centre-sampled strongest **active** gateway
RSSI using the same wall crossings, metre conversion and loss equation as links.
No active gateway means RSSI/gateway_id null and reachable false. Cell dimensions
and floor extents are explicitly returned. This is a signal estimate, not a packet
reliability grid; weak cells can differ from device positions within the same cell.

Network inputs enforce floor bounds for areas, wall endpoints, devices, gateways
and reception, plus a maximum of two gateways. Geometry-only legacy requests
retain their original behavior. AI candidate sensors must additionally be inside
their assigned room; backend validation checks this and C++ monitoring checks
prevent a misleading PASS when required sensors are misplaced or missing.

AI/backend envelopes and provenance are documented in API.md. A gateway failure
uses the unchanged active boolean. C++ re-evaluates links, selected gateways,
packet delivery, requirements and grid; an offline gateway never carries traffic.
