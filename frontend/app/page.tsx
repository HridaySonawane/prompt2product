"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RoomKind = "room" | "lobby" | "bathroom" | "reception";
type Room = { id: string; name: string; type: RoomKind; x: number; y: number; width: number; height: number };
type Sensor = { id: string; type: "temperature_sensor" | "leak_sensor"; x: number; y: number; room_id: string };
type Gateway = { id: string; x: number; y: number; active: boolean };
type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; material: "drywall" | "wood" | "concrete" | "metal" };
type Link = { source: string; destination: string; distance: number; walls_crossed: number; wall_attenuation_db: number };
type ApiResult = { status?: string; geometry?: { links: Link[] }; error?: { code: string; message: string } };
type HealthState = { state: "checking" | "ready" | "simulator-missing" | "offline"; message: string };

const initialRooms: Room[] = [
  { id: "room_101", name: "Room 101", type: "room", x: 50, y: 50, width: 180, height: 140 },
  { id: "room_102", name: "Room 102", type: "room", x: 250, y: 50, width: 180, height: 140 },
  { id: "room_103", name: "Room 103", type: "room", x: 450, y: 50, width: 180, height: 140 },
  { id: "room_104", name: "Room 104", type: "room", x: 50, y: 250, width: 180, height: 140 },
  { id: "room_105", name: "Room 105", type: "room", x: 450, y: 250, width: 180, height: 140 },
  { id: "lobby", name: "Lobby", type: "lobby", x: 250, y: 250, width: 180, height: 140 },
  { id: "bathroom", name: "Bathroom", type: "bathroom", x: 50, y: 450, width: 180, height: 100 },
  { id: "reception_room", name: "Reception", type: "reception", x: 650, y: 250, width: 250, height: 180 },
];
const initialSensors: Sensor[] = [
  { id: "temp_101", type: "temperature_sensor", x: 120, y: 120, room_id: "room_101" },
  { id: "temp_102", type: "temperature_sensor", x: 320, y: 120, room_id: "room_102" },
  { id: "temp_103", type: "temperature_sensor", x: 520, y: 120, room_id: "room_103" },
  { id: "temp_104", type: "temperature_sensor", x: 120, y: 320, room_id: "room_104" },
  { id: "temp_105", type: "temperature_sensor", x: 520, y: 320, room_id: "room_105" },
  { id: "leak_1", type: "leak_sensor", x: 120, y: 500, room_id: "bathroom" },
];
const apiUrl = process.env.NEXT_PUBLIC_IOTFORGE_API_URL ?? "http://127.0.0.1:8000";
const center = (room: Room) => ({ x: room.x + room.width / 2, y: room.y + room.height / 2 });

export default function Home() {
  const [rooms, setRooms] = useState(initialRooms);
  const [sensors, setSensors] = useState(initialSensors);
  const [gateways, setGateways] = useState<Gateway[]>([{ id: "gateway_1", x: 340, y: 320, active: true }]);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [reception, setReception] = useState({ id: "reception", x: 725, y: 340 });
  const [requirements, setRequirements] = useState({ coverage_required: 0.95, max_latency_ms: 2000, min_reliability: 0.95 });
  const [selectedSensor, setSelectedSensor] = useState("temp_101");
  const [selectedRoomId, setSelectedRoomId] = useState("room_101");
  const [links, setLinks] = useState<Link[] | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<HealthState>({ state: "checking", message: "Checking backend…" });
  const [notice, setNotice] = useState("Ready · edit the layout, then run the geometry simulator");
  const [busy, setBusy] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [requestCustomized, setRequestCustomized] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [wallScenario, setWallScenario] = useState<"crossing" | "clear">("crossing");
  const svgRef = useRef<SVGSVGElement>(null);
  const selected = sensors.find((sensor) => sensor.id === selectedSensor) ?? sensors[0];
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];
  const layout = useMemo(() => ({
    schema_version: "1.0",
    floor: { width: 1000, height: 600 },
    rooms: rooms.map((room) => ({ ...room })),
    walls: walls.map((wall) => ({ ...wall })),
    devices: sensors.map((sensor) => ({ ...sensor })),
    gateways: gateways.map((gateway) => ({ ...gateway, active: Boolean(gateway.active) })),
    reception: { ...reception },
    requirements: { ...requirements },
  }), [rooms, walls, sensors, gateways, reception, requirements]);

  async function fetchBackendHealth(): Promise<HealthState> {
    try {
      const response = await fetch(`${apiUrl}/api/health`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}`);
      const status = await response.json() as { status?: string; simulator_available?: boolean };
      if (status.status !== "ok") throw new Error("Backend health check failed");
      return status.simulator_available
        ? { state: "ready", message: "Backend ready · simulator executable found" }
        : { state: "simulator-missing", message: "Backend ready · simulator executable missing" };
    } catch {
      return { state: "offline", message: "Backend unavailable · start FastAPI on port 8000" };
    }
  }

  function checkBackend() {
    setHealth({ state: "checking", message: "Checking backend…" });
    void fetchBackendHealth().then(setHealth);
  }

  useEffect(() => { void fetchBackendHealth().then(setHealth); }, []);

  function updateSensor(id: string, patch: Partial<Sensor>) {
    setSensors((current) => current.map((sensor) => sensor.id === id ? { ...sensor, ...patch } : sensor));
    setLinks(null);
  }

  function addSensor(type: Sensor["type"]) {
    const room = rooms.find((item) => item.type === (type === "leak_sensor" ? "bathroom" : "room")) ?? rooms[0];
    if (!room) return;
    const id = `${type === "leak_sensor" ? "leak" : "temp"}_${Date.now()}`;
    const point = center(room);
    setSensors((current) => [...current, { id, type, ...point, room_id: room.id }]);
    setSelectedSensor(id);
    setLinks(null);
  }

  function addGateway() {
    if (gateways.length >= 2) return;
    const room = rooms.find((item) => item.type === "lobby") ?? rooms[0];
    if (!room) return;
    const point = center(room);
    setGateways((current) => [...current, { id: "gateway_2", ...point, active: true }]);
    setLinks(null);
  }

  function addWall() {
    if (!selected || gateways.length === 0) return;
    const gateway = gateways[0];
    let wall: Wall;
    if (wallScenario === "crossing") {
      const dx = gateway.x - selected.x;
      const dy = gateway.y - selected.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const mx = (gateway.x + selected.x) / 2;
      const my = (gateway.y + selected.y) / 2;
      const half = 70;
      wall = { id: `wall_${Date.now()}`, x1: mx - (dy / length) * half, y1: my + (dx / length) * half, x2: mx + (dy / length) * half, y2: my - (dx / length) * half, material: "concrete" };
    } else {
      // This segment stays at the floor edge; its endpoint contact is not a wall crossing.
      wall = { id: `wall_${Date.now()}`, x1: 920, y1: 0, x2: 1000, y2: 0, material: "concrete" };
    }
    setWalls((current) => [...current, wall]);
    setLinks(null);
  }

  function pointerPosition(event: React.PointerEvent<SVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000)), y: Math.max(0, Math.min(600, ((event.clientY - rect.top) / rect.height) * 600)) };
  }

  async function simulate() {
    setBusy(true);
    setError("");
    try {
      const payload = requestCustomized && requestText.trim() ? JSON.parse(requestText) : layout;
      const response = await fetch(`${apiUrl}/api/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as ApiResult;
      if (!response.ok || result.status === "error") throw new Error(result.error?.message ?? `Simulation failed (HTTP ${response.status})`);
      const nextLinks = result.geometry?.links;
      if (!nextLinks) throw new Error("Backend response did not include geometry links");
      setLinks(nextLinks);
      setNotice(`Geometry returned by simulator · ${nextLinks.length} link${nextLinks.length === 1 ? "" : "s"}`);
    } catch (cause) {
      setLinks(null);
      setError(cause instanceof Error ? cause.message : "Simulation failed");
      setNotice("Simulation request failed");
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    setRequestText(JSON.stringify(layout, null, 2));
    setRequestCustomized(false);
    setShowRequest(true);
    setNotice("Complete schema 1.0 request exported below");
  }

  function resetLayout() {
    setRooms(initialRooms);
    setSensors(initialSensors);
    setGateways([{ id: "gateway_1", x: 340, y: 320, active: true }]);
    setWalls([]);
    setReception({ id: "reception", x: 725, y: 340 });
    setLinks(null); setError(""); setRequestText(""); setRequestCustomized(false);
    setNotice("Example hotel layout restored");
  }

  function addRoom() {
    const id = `room_${101 + rooms.filter((room) => room.type === "room").length}`;
    const x = 50 + ((rooms.length % 4) * 200);
    const y = rooms.length > 7 ? 450 : 50 + (Math.floor(rooms.length / 4) * 200);
    setRooms((current) => [...current, { id, name: `Room ${id.slice(-3)}`, type: "room", x: Math.min(800, x), y: Math.min(450, y), width: 150, height: 120 }]);
  }

  return <main className="forge-app">
    <header className="forge-header"><a className="forge-brand" href="#layout"><span>◈</span><b>IoT<span>Forge</span></b></a><div><small>CP00–02 · GEOMETRY INTEGRATION</small><h1>Plan a small IoT network</h1><p>Design it. Simulate it. Inspect the returned geometry.</p></div><button className="button quiet" onClick={resetLayout}>Reset example</button></header>
    <div className="forge-grid">
      <section className="panel plan-panel" id="layout">
        <div className="panel-heading"><div><span className="kicker">ONE FLOOR · LOGICAL UNITS</span><h2>Hotel layout</h2><p>Drag a sensor or gateway to change its coordinates. The simulator receives this same 1000 × 600 coordinate space.</p></div><span className="tag">SCHEMA 1.0</span></div>
        <div className="floor-wrap"><svg ref={svgRef} viewBox="0 0 1000 600" className="floor-plan" aria-label="Hotel floor plan">
          <rect width="1000" height="600" rx="12" className="floor-bg" />
          {rooms.map((room) => <g key={room.id} onClick={() => setSelectedRoomId(room.id)}>
            <rect x={room.x} y={room.y} width={room.width} height={room.height} rx="6" className={`room-shape room-${room.type} ${selectedRoomId === room.id ? "room-selected-shape" : ""}`} />
            <foreignObject x={room.x + 8} y={room.y + 8} width={Math.max(75, room.width - 16)} height="28"><input className="room-name" aria-label={`Rename ${room.name}`} value={room.name} onChange={(event) => setRooms((current) => current.map((item) => item.id === room.id ? { ...item, name: event.target.value } : item))} /></foreignObject>
            <text x={room.x + 10} y={room.y + 54} className="room-type-label">{room.type.toUpperCase()}</text>
          </g>)}
          {walls.map((wall) => <line key={wall.id} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} className="wall-line" />)}
          {links?.map((link) => { const sensor = sensors.find((item) => item.id === link.source); const gateway = gateways.find((item) => item.id === link.destination); return sensor && gateway ? <line key={`${link.source}-${link.destination}`} x1={sensor.x} y1={sensor.y} x2={gateway.x} y2={gateway.y} className="link-line" /> : null; })}
          {sensors.map((sensor) => <g key={sensor.id} className="plan-marker" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setSelectedSensor(sensor.id); }} onPointerMove={(event) => { if (event.buttons === 1) updateSensor(sensor.id, pointerPosition(event)); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onClick={() => setSelectedSensor(sensor.id)} role="button" tabIndex={0} aria-label={`Drag ${sensor.id}`}>
            <circle cx={sensor.x} cy={sensor.y} r="17" className={selectedSensor === sensor.id ? "sensor-ring selected-ring" : "sensor-ring"} /><circle cx={sensor.x} cy={sensor.y} r="10" className={sensor.type === "leak_sensor" ? "sensor-leak" : "sensor-temp"} /><text x={sensor.x} y={sensor.y + 4} textAnchor="middle" className="sensor-glyph">{sensor.type === "leak_sensor" ? "L" : "T"}</text>
          </g>)}
          {gateways.map((gateway) => <g key={gateway.id} className="plan-marker" onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => { if (event.buttons === 1) { const point = pointerPosition(event); setGateways((current) => current.map((item) => item.id === gateway.id ? { ...item, ...point } : item)); setLinks(null); } }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} role="img" aria-label={`Drag ${gateway.id}`}>
            <rect x={gateway.x - 15} y={gateway.y - 15} width="30" height="30" rx="8" className="gateway-marker" /><text x={gateway.x} y={gateway.y + 5} textAnchor="middle" className="gateway-glyph">G</text>
          </g>)}
        </svg></div>
        <div className="plan-toolbar"><button className="button quiet" onClick={addRoom}>＋ Add room</button><button className="button quiet" onClick={() => { const room = [...rooms].reverse().find((item) => item.type === "room"); if (room) { setRooms((current) => current.filter((item) => item.id !== room.id)); setSensors((current) => current.filter((item) => item.room_id !== room.id)); } }}>− Remove room</button><span className="coordinate-note">Room position and size are sent in logical floor units.</span></div>
        {selectedRoom && <div className="room-editor"><b>Selected room · {selectedRoom.name}</b><label>X<input type="number" value={selectedRoom.x} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, x: Number(event.target.value) } : room))} /></label><label>Y<input type="number" value={selectedRoom.y} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, y: Number(event.target.value) } : room))} /></label><label>Width<input type="number" min="1" value={selectedRoom.width} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, width: Math.max(1, Number(event.target.value)) } : room))} /></label><label>Height<input type="number" min="1" value={selectedRoom.height} onChange={(event) => setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, height: Math.max(1, Number(event.target.value)) } : room))} /></label></div>}
        <div className="legend"><span><i className="dot temp-dot" />Temperature sensor</span><span><i className="dot leak-dot" />Leak sensor</span><span><i className="dot gateway-dot" />Gateway</span><span><i className="line-sample" />Returned simulator link</span><span><i className="line-sample wall-sample" />Concrete wall</span></div>
      </section>
      <aside className="side-column">
        <section className="panel control-panel"><div className="panel-heading"><div><span className="kicker">LAYOUT INPUT</span><h2>Devices & requirements</h2></div></div>
          <div className="control-block"><div className="block-title"><b>Sensors</b><span>{sensors.length}</span></div><div className="sensor-list">{sensors.map((sensor) => <button key={sensor.id} className={`sensor-row ${sensor.id === selectedSensor ? "is-selected" : ""}`} onClick={() => setSelectedSensor(sensor.id)}><i className={`dot ${sensor.type === "leak_sensor" ? "leak-dot" : "temp-dot"}`} /><span>{sensor.id}<small>{sensor.type === "leak_sensor" ? "Water leak" : "Temperature"}</small></span><b>{Math.round(sensor.x)}, {Math.round(sensor.y)}</b></button>)}</div>
            <div className="inline-actions"><button className="button quiet" onClick={() => addSensor("temperature_sensor")}>＋ Temperature</button><button className="button quiet" onClick={() => addSensor("leak_sensor")}>＋ Leak sensor</button></div>
            {selected && <div className="coordinate-editor"><strong>Selected: {selected.id}</strong><label>X <input type="number" value={Number(selected.x.toFixed(1))} onChange={(event) => updateSensor(selected.id, { x: Number(event.target.value) })} /></label><label>Y <input type="number" value={Number(selected.y.toFixed(1))} onChange={(event) => updateSensor(selected.id, { y: Number(event.target.value) })} /></label><label>Room <select value={selected.room_id} onChange={(event) => updateSensor(selected.id, { room_id: event.target.value })}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><button className="remove-link" onClick={() => { setSensors((current) => current.filter((item) => item.id !== selected.id)); setSelectedSensor(sensors.find((item) => item.id !== selected.id)?.id ?? ""); setLinks(null); }}>Remove selected sensor</button></div>}
          </div>
          <div className="control-block"><div className="block-title"><b>Gateways</b><span>{gateways.length}/2</span></div>{gateways.map((gateway) => <label className="gateway-row" key={gateway.id}><span>▣ &nbsp;{gateway.id}</span><input type="checkbox" checked={gateway.active} onChange={(event) => { setGateways((current) => current.map((item) => item.id === gateway.id ? { ...item, active: event.target.checked } : item)); setLinks(null); }} /> Active</label>)}<div className="inline-actions"><button className="button quiet" disabled={gateways.length >= 2} onClick={addGateway}>＋ Add gateway</button><button className="button quiet" disabled={gateways.length <= 1} onClick={() => { setGateways((current) => current.slice(0, -1)); setLinks(null); }}>− Remove last</button></div></div>
          <div className="control-block"><div className="block-title"><b>Concrete wall check</b><span>{walls.length} walls</span></div><label className="field-label">Wall placement<select value={wallScenario} onChange={(event) => setWallScenario(event.target.value as "crossing" | "clear")}><option value="crossing">Across selected sensor link</option><option value="clear">At floor edge, away from link</option></select></label><div className="inline-actions"><button className="button quiet" onClick={addWall}>＋ Add concrete wall</button><button className="button quiet" disabled={!walls.length} onClick={() => { setWalls([]); setLinks(null); }}>Clear walls</button></div><p className="help-text">A crossing concrete wall should add 12 dB. The edge wall should add zero.</p></div>
          <div className="control-block"><div className="block-title"><b>Reception & requirements</b></div><div className="requirements-grid"><label>X<input type="number" value={reception.x} onChange={(event) => setReception((current) => ({ ...current, x: Number(event.target.value) }))} /></label><label>Y<input type="number" value={reception.y} onChange={(event) => setReception((current) => ({ ...current, y: Number(event.target.value) }))} /></label><label>Coverage required<input type="number" min="0" max="1" step="0.01" value={requirements.coverage_required} onChange={(event) => setRequirements((current) => ({ ...current, coverage_required: Number(event.target.value) }))} /></label><label>Max latency (ms)<input type="number" min="0" value={requirements.max_latency_ms} onChange={(event) => setRequirements((current) => ({ ...current, max_latency_ms: Number(event.target.value) }))} /></label><label>Min reliability<input type="number" min="0" max="1" step="0.01" value={requirements.min_reliability} onChange={(event) => setRequirements((current) => ({ ...current, min_reliability: Number(event.target.value) }))} /></label></div></div>
        </section>
        <section className="panel simulation-panel"><div className="panel-heading"><div><span className="kicker">REAL BACKEND · C++ GEOMETRY</span><h2>Run simulation</h2></div><span className={`api-indicator health-${health.state}`}>● {health.state === "checking" ? "CHECKING" : health.state === "ready" ? "READY" : health.state === "simulator-missing" ? "NO SIMULATOR" : "OFFLINE"}</span></div><div className={`health-message health-${health.state}`} role="status"><span>{health.message}</span><button onClick={() => void checkBackend()} disabled={health.state === "checking"}>Recheck</button></div><p className="sim-copy">Sends the complete layout to <code>{apiUrl}/api/simulate</code>. Results below come directly from the backend.</p><button className="button primary" onClick={simulate} disabled={busy}>{busy ? "Sending…" : "▶  Simulate layout"}</button><button className="export-button" onClick={exportJson}>Export complete schema 1.0 JSON</button><div className="notice" role="status">{notice}</div>{error && <div className="error-box" role="alert"><b>Backend error</b><span>{error}</span></div>}
          <div className="results-head"><h3>Returned links</h3><span>{links ? `${links.length} links` : "No result yet"}</span></div>{links && <div className="link-list">{links.length === 0 ? <p className="empty-state">The simulator returned no sensor/gateway pairs.</p> : links.map((link) => <div className="link-row" key={`${link.source}-${link.destination}`}><div><b>{link.source}</b><span>→ {link.destination}</span></div><strong>{link.distance.toFixed(2)} units</strong><small>{link.walls_crossed} wall{link.walls_crossed === 1 ? "" : "s"} · {link.wall_attenuation_db.toFixed(1)} dB</small></div>)}</div>}
          <div className="scope-note">CP00–02 reports geometry only. Coverage, reliability, latency, RSSI, heatmaps and PASS/FAIL are not calculated here.</div>
        </section>
      </aside>
    </div>
    <section className="panel json-panel"><div className="json-heading"><div><span className="kicker">COMPLETE REQUEST OBJECT</span><h2>Schema 1.0 JSON</h2><p>Exported coordinates use the same 1000 × 600 logical units for every entity. Edit and run this payload to inspect backend validation errors.</p></div><button className="button quiet" onClick={() => { setRequestText(JSON.stringify(layout, null, 2)); setRequestCustomized(false); setShowRequest((value) => !value); }}>{showRequest ? "Refresh & hide JSON" : "Show JSON"}</button></div>{showRequest && <textarea className="json-editor" spellCheck={false} value={requestText || JSON.stringify(layout, null, 2)} onChange={(event) => { setRequestText(event.target.value); setRequestCustomized(true); }} aria-label="Complete simulation request JSON" />}</section>
    <footer className="forge-footer"><span>IoTForge · Shared geometry schema 1.0</span><a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">Backend API docs ↗</a><span>Requests can be repeated without restarting either service.</span></footer>
  </main>;
}
