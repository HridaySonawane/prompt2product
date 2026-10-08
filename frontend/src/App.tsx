import { useEffect, useRef, useState } from "react";
import hotel from "../../shared/fixtures/network-hotel.json";
import weakHotel from "../../shared/fixtures/weak-signal.json";
import type { Layout, Result, Room, RoomKind, Sensor, Wall, Planner, ScenarioResult } from "./models";

const api = import.meta.env.VITE_IOTFORGE_API_URL ?? "";
const copy = <T,>(value: T): T => structuredClone(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const latency = (value: number | null) => value === null ? "Undefined" : `${value.toFixed(0)} ms`;
const center = (room: Room) => ({ x: room.x + room.width / 2, y: room.y + room.height / 2 });
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export default function App() {
  const [layout, setLayout] = useState<Layout>(copy(hotel) as Layout);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState("room_101");
  const [tab, setTab] = useState<"rooms" | "devices" | "walls" | "settings">("rooms");
  const [health, setHealth] = useState("Checking backend");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Edit the floor plan, then simulate your deployment.");
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [prompt, setPrompt] = useState("Monitor temperature in all five rooms, detect bathroom leaks, and deliver alerts to reception within two seconds with at least 95% reliability.");
  const [aiStatus, setAiStatus] = useState("Checking local AI…");
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [comparison, setComparison] = useState<{ before: Result; after: Result; label: string; improved?: boolean } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [failureId, setFailureId] = useState("gateway_1");
  const svg = useRef<SVGSVGElement>(null);
  const room = layout.rooms.find(item => item.id === selected);
  const device = layout.devices.find(item => item.id === selected);
  const gateway = layout.gateways.find(item => item.id === selected);
  const wall = layout.walls.find(item => item.id === selected);

  useEffect(() => { let active = true;
    fetch(`${api}/api/health`).then(response => response.json()).then(data => {
      if (active) setHealth(data.simulator_available ? "C++ engine ready" : "Build simulator first");
    }).catch(() => { if (active) setHealth("Backend offline"); });
    fetch(`${api}/api/ai/health`).then(response => response.json()).then(data => {
      if (active) setAiStatus(data.available ? `Local AI · ${data.model}` : "AI unavailable · labeled fallback available");
    }).catch(() => { if (active) setAiStatus("AI unavailable · manual simulation works"); });
    return () => { active = false; };
  }, []);

  function edit(change: (draft: Layout) => void) {
    if (busy) return;
    setLayout(previous => { const next = copy(previous); change(next); return next; });
    setResult(null); setComparison(null); setPlanner(null); setError(""); setNotice("Layout changed · simulate to refresh results.");
  }
  function load(value: Layout) {
    setLayout(copy(value)); setResult(null); setError(""); setSelected(value.rooms[0]?.id ?? "");
    setComparison(null); setPlanner(null); setFailureId(value.gateways[0]?.id ?? "");
    setNotice("Example loaded · results will be calculated when you simulate.");
  }
  function updateRoom(patch: Partial<Room>) {
    if (!room) return;
    if (patch.width !== undefined) patch.width = Math.max(1, patch.width);
    if (patch.height !== undefined) patch.height = Math.max(1, patch.height);
    edit(draft => {
      const target = draft.rooms.find(item => item.id === room.id)!;
      const old = { ...target }; Object.assign(target, patch);
      // Preserve each associated sensor's relative position during room edits.
      draft.devices.filter(item => item.room_id === target.id).forEach(item => {
        item.x = target.x + ((item.x - old.x) / old.width) * target.width;
        item.y = target.y + ((item.y - old.y) / old.height) * target.height;
      });
    });
  }
  function addRoom() {
    const next: Room = { id: uid("room"), name: "New room", type: "room", x: 690, y: 50, width: 180, height: 140 };
    edit(draft => { draft.rooms.push(next); }); setSelected(next.id); setTab("rooms");
  }
  function addSensor(type: Sensor["type"]) {
    const target = room ?? layout.rooms.find(item => item.type === (type === "leak_sensor" ? "bathroom" : "room"));
    if (!target) { setError("Add a room before placing a sensor."); return; }
    const sensor = { id: uid(type === "leak_sensor" ? "leak" : "temp"), type, ...center(target), room_id: target.id };
    edit(draft => { draft.devices.push(sensor); }); setSelected(sensor.id); setTab("devices");
  }
  function addGateway() {
    if (layout.gateways.length >= 2) return;
    const next = { id: uid("gateway"), x: 350, y: 400, active: true };
    edit(draft => { draft.gateways.push(next); }); setSelected(next.id); setTab("devices");
  }
  function removeSelected() {
    edit(draft => {
      draft.rooms = draft.rooms.filter(item => item.id !== selected);
      draft.devices = draft.devices.filter(item => item.id !== selected && item.room_id !== selected);
      draft.gateways = draft.gateways.filter(item => item.id !== selected);
      draft.walls = draft.walls.filter(item => item.id !== selected);
    }); setSelected("");
  }
  function position(event: React.PointerEvent<SVGElement>) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: Math.round(Math.max(0, Math.min(layout.floor.width, point.x))), y: Math.round(Math.max(0, Math.min(layout.floor.height, point.y))) };
  }
  function drag(event: React.PointerEvent<SVGElement>, id: string, kind: "sensor" | "gateway") {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = position(event);
    edit(draft => {
      const target = kind === "sensor" ? draft.devices.find(item => item.id === id) : draft.gateways.find(item => item.id === id);
      if (!target) return;
      Object.assign(target, point);
      if (kind === "sensor") {
        const containing = draft.rooms.find(item => point.x >= item.x && point.x <= item.x + item.width && point.y >= item.y && point.y <= item.y + item.height);
        if (containing) (target as Sensor).room_id = containing.id;
      }
    });
  }
  async function simulate() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/api/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout), signal: AbortSignal.timeout(20000) });
      const value = await response.json() as Result;
      if (!response.ok || value.status !== "ok") throw new Error(value.error?.message ?? `HTTP ${response.status}`);
      if (!value.summary) throw new Error("Network result missing. Rebuild the C++ simulator.");
      setResult(value); setNotice("Simulation complete · all metrics calculated by C++.");
    } catch (cause) { setResult(null); setError(cause instanceof Error ? cause.message : "Simulation failed"); }
    finally { setBusy(false); }
  }
  async function scenario(operation: "design" | "optimize" | "failure", backup = false) {
    setBusy(true); setError("");
    setNotice(operation === "design" ? "Local AI is interpreting your requirements; C++ will verify the design…" : operation === "optimize" ? "Evaluating placement proposals against actual C++ diagnostics…" : backup ? "Testing backup placement and reassociation with C++…" : "Disabling the gateway and recalculating every sensor…");
    try {
      const id = layout.gateways.find(item => item.id === failureId)?.id ?? layout.gateways[0]?.id;
      const body = operation === "failure" ? { layout, gateway_id: id, add_backup: backup } : { layout, prompt };
      const response = await fetch(`${api}/api/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
      const value = await response.json() as ScenarioResult;
      if (!response.ok || value.status !== "ok") throw new Error(value.error?.message ?? `HTTP ${response.status}`);
      const nextResult = value.simulation ?? value.after;
      if (!nextResult) throw new Error("Simulation result missing from response");
      setLayout(value.layout); setResult(nextResult); setPlanner(value.planner); setSelected(value.layout.gateways.find(item => item.active)?.id ?? value.layout.gateways[0]?.id ?? ""); setTab("devices");
      setComparison(value.before && value.after ? { before: value.before, after: value.after, label: operation === "optimize" ? "Placement optimization" : backup ? "Backup recovery" : "Gateway failure", improved: value.improved } : null);
      setNotice(operation === "design" ? "Design placed and verified by C++." : operation === "optimize" ? value.improved ? "Verified improvement · compare the real runs below." : "No verified improvement found · previous placement retained." : backup ? value.recovered ? "Backup restored the original requirements." : "Backup tested · requirements still fail. Inspect sensor diagnostics." : "Gateway offline · failure impact calculated by C++.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); setNotice("Request failed · previous deployment retained."); }
    finally { setBusy(false); }
  }
  async function importJson() {
    setBusy(true); setError("");
    try { const value = JSON.parse(jsonText) as Layout;
      if (value.schema_version !== "1.0" || !Array.isArray(value.rooms) || !Array.isArray(value.devices) || !Array.isArray(value.gateways) || !Array.isArray(value.walls) || !value.floor || !value.requirements || !value.reception) throw new Error("Expected a complete schema 1.0 layout.");
      value.simulation ??= { metres_per_unit: 0.05, seed: 1337, packets_per_device: 200 };
      const response = await fetch(`${api}/api/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal: AbortSignal.timeout(20000) });
      const validated = await response.json() as Result;
      if (!response.ok || validated.status !== "ok") throw new Error(validated.error?.message ?? "Invalid layout");
      load(value); setResult(validated); setShowJson(false); setNotice("Imported layout validated and simulated by C++.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid JSON"); }
    finally { setBusy(false); }
  }

  return <div className="application">
    <header className="topbar"><a className="brand" href="/" aria-label="IoTForge home"><span className="brand-icon">◈</span>IoT<span>Forge</span><sup>LAB</sup></a><span className="tagline">Design it. Simulate it. Break it. Improve it.</span><span className={`health ${health === "C++ engine ready" ? "online" : ""}`}><i/>{health}</span><a className="docs-link" href={`${api}/api/docs`} target="_blank" rel="noreferrer">API docs ↗</a></header>
    <main>
      <div className="page-heading"><div><span className="eyebrow">DEPLOYMENT WORKSPACE / SINGLE FLOOR</span><h1>Test the network.<br className="mobile-only"/> Before you install it.</h1><p>A digital testing ground for indoor IoT deployment and resilience.</p></div><div className="heading-actions"><button className="button subtle" disabled={busy} onClick={() => load(copy(weakHotel) as Layout)}>Load weak deployment</button><button className="button subtle" disabled={busy} onClick={() => load(copy(hotel) as Layout)}>Reset hotel</button><button className="button primary" onClick={() => void simulate()} disabled={busy}>{busy ? "Simulating…" : "▶  Simulate network"}</button></div></div>
      <div className="metrics" aria-label="Simulation metrics">
        <Metric title="COVERAGE" value={result ? percent(result.summary.coverage) : "—"} detail={result ? `${result.summary.reachable_devices} of ${result.summary.total_devices} sensors reachable` : "Run a simulation to calculate"}/>
        <Metric title="DELIVERY RELIABILITY" value={result ? percent(result.summary.reliability) : "—"} detail={result ? `${result.summary.delivered_messages} / ${result.summary.generated_messages} messages delivered` : "Seeded packet delivery model"}/>
        <Metric title="WORST LATENCY" value={result ? latency(result.summary.worst_latency_ms) : "—"} detail={`Target ≤ ${layout.requirements.max_latency_ms} ms · includes retries`}/>
        <Metric title="REQUIREMENT STATUS" value={result ? (result.requirements_evaluation.pass ? "PASS" : "FAIL") : "Not simulated"} detail={result ? "Evaluated independently by C++" : "No estimated placeholder metrics"} state={result ? result.requirements_evaluation.pass ? "pass" : "fail" : ""}/>
      </div>
      <section className="planning-panel"><div className="planning-intro"><span className="eyebrow">LOCAL AI / INDEPENDENT VERIFICATION</span><h2>A plan starts with a requirement.</h2><p>{aiStatus}</p></div><div className="planning-input"><label htmlFor="requirements-prompt">Describe what you need to monitor</label><textarea id="requirements-prompt" maxLength={4000} disabled={busy} value={prompt} onChange={event => setPrompt(event.target.value)}/><div className="planning-actions"><span>AI proposes. C++ decides whether it works.</span><button className="button subtle" disabled={busy || !layout.gateways.some(item => item.active)} onClick={() => void scenario("optimize")}>↗ Optimize placement</button><button className="button primary" disabled={busy || !prompt.trim()} onClick={() => void scenario("design")}>✧ Generate design</button></div></div></section>
      {planner && <div className={`planner-note ${planner.source !== "ollama" ? "fallback" : ""}`} role="status"><b>{planner.source === "ollama" ? `Ollama · ${planner.model}` : planner.source === "deterministic_fallback" ? "Rule-based fallback · not AI" : "C++ verified scenario"}</b><span>{planner.reasoning}</span>{planner.warning && <small>{planner.warning}</small>}</div>}
      <div className="workspace">
        <section className="panel floor-panel"><div className="panel-heading"><div><span className="eyebrow">01 / FLOOR PLAN</span><h2>Hotel deployment</h2></div><span className="pill">{layout.floor.width * layout.simulation.metres_per_unit} × {layout.floor.height * layout.simulation.metres_per_unit} m</span></div>
          <div className="canvas-toolbar"><span>◉ {layout.rooms.length} areas <b>·</b> {layout.devices.length} sensors <b>·</b> {layout.gateways.length}/2 gateways</span><label className="heatmap-toggle"><input type="checkbox" checked={showHeatmap} onChange={event => setShowHeatmap(event.target.checked)}/>Signal heatmap</label></div>
          <svg ref={svg} className={`floor-plan ${showHeatmap && result ? "heatmap-visible" : ""}`} viewBox={`0 0 ${layout.floor.width} ${layout.floor.height}`} aria-label="Editable hotel floor plan">
            <defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e1e8ef" strokeWidth="1"/></pattern></defs>
            <rect width={layout.floor.width} height={layout.floor.height} fill="#f7f9fc"/><rect width={layout.floor.width} height={layout.floor.height} fill="url(#grid)"/>
            {showHeatmap && result?.heatmap && <g aria-hidden="true" className="heatmap-cells">{result.heatmap.cells.map(cell => <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={result.heatmap!.cell_width} height={result.heatmap!.cell_height} fill={cell.rssi_dbm === null ? "#c8cdd6" : cell.rssi_dbm < result.model.sensitivity_dbm ? "#ee8c83" : `hsl(${Math.max(30, Math.min(155, 30 + (cell.rssi_dbm - result.model.sensitivity_dbm) * 5))}, 55%, 66%)`} opacity=".4"><title>{cell.rssi_dbm === null ? "No active gateway" : `${cell.rssi_dbm.toFixed(1)} dBm · ${cell.reachable ? "reachable" : "below sensitivity"}`}</title></rect>)}</g>}
            {layout.rooms.map(item => <g key={item.id} className="room" onClick={() => { setSelected(item.id); setTab("rooms"); }}><rect x={item.x} y={item.y} width={item.width} height={item.height} rx="6" className={`room-${item.type} ${selected === item.id ? "selected" : ""}`}/><text x={item.x + 13} y={item.y + 26} className="room-label">{item.name}</text><text x={item.x + 13} y={item.y + 45} className="room-kind">{item.type.toUpperCase()}</text></g>)}
            {result?.geometry.links.map(link => { const source = layout.devices.find(item => item.id === link.source); const destination = layout.gateways.find(item => item.id === link.destination); const chosen = result.devices.find(item => item.device_id === link.source)?.gateway_id === link.destination;
              return source && destination ? <line key={`${link.source}-${link.destination}`} x1={source.x} y1={source.y} x2={destination.x} y2={destination.y} className={`network-link ${link.reachable ? chosen ? "connected" : "standby" : "disconnected"}`}><title>{link.source} → {link.destination}: {link.rssi_dbm.toFixed(1)} dBm, {link.walls_crossed} walls</title></line> : null; })}
            {layout.walls.map(item => <line key={item.id} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} className={`wall ${selected === item.id ? "selected-wall" : ""}`} onClick={() => { setSelected(item.id); setTab("walls"); }}><title>{item.material} wall</title></line>)}
            <g className="reception"><rect x={layout.reception.x - 13} y={layout.reception.y - 13} width="26" height="26" rx="5"/><text x={layout.reception.x} y={layout.reception.y + 4} textAnchor="middle">R</text><text className="marker-caption" x={layout.reception.x} y={layout.reception.y + 30} textAnchor="middle">RECEPTION</text></g>
            {layout.devices.map(item => <g key={item.id} className="marker" role="button" tabIndex={0} aria-label={`Select ${item.id}`} onKeyDown={event => { if (event.key === "Enter") { setSelected(item.id); setTab("devices"); } }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id); setTab("devices"); }} onPointerMove={event => drag(event, item.id, "sensor")} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}>
              <circle cx={item.x} cy={item.y} r={selected === item.id ? 21 : 18} className={`sensor ${item.type === "leak_sensor" ? "leak" : "temperature"} ${selected === item.id ? "selected-marker" : ""}`}/><text x={item.x} y={item.y + 5} textAnchor="middle" className="marker-letter">{item.type === "leak_sensor" ? "L" : "T"}</text><title>{item.id}</title></g>)}
            {layout.gateways.map((item, index) => <g key={item.id} className="marker" role="button" tabIndex={0} aria-label={`Select ${item.id}`} onKeyDown={event => { if (event.key === "Enter") { setSelected(item.id); setTab("devices"); } }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id); setTab("devices"); }} onPointerMove={event => drag(event, item.id, "gateway")} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}><rect x={item.x - 20} y={item.y - 20} width="40" height="40" rx="10" className={`gateway ${!item.active ? "offline" : ""} ${selected === item.id ? "selected-marker" : ""}`}/><text x={item.x} y={item.y + 5} textAnchor="middle" className="marker-letter">G{index + 1}</text><text className="marker-caption" x={item.x} y={item.y + 37} textAnchor="middle">{item.active ? "ONLINE" : "OFFLINE"}</text></g>)}
          </svg>
          <div className="legend"><span><i className="dot temperature"/>Temperature</span><span><i className="dot leak"/>Water leak</span><span><i className="dot gateway"/>Gateway</span><span><i className="line connected"/>Connected</span><span><i className="line disconnected"/>Unavailable</span></div>
          {result?.heatmap && showHeatmap && <div className="heatmap-key"><span className="gradient"/><span>Below sensitivity → weak → strong</span><span>{result.heatmap.columns} × {result.heatmap.rows} C++ samples · cell centres</span></div>}
          <div className="notice" role="status">{notice}</div>
        </section>
        <aside className="panel inspector"><div className="panel-heading"><div><span className="eyebrow">02 / BUILD YOUR SCENARIO</span><h2>Layout inspector</h2></div><span className="pill">SCHEMA 1.0</span></div>
          <div className="tabs">{(["rooms", "devices", "walls", "settings"] as const).map(item => <button key={item} onClick={() => setTab(item)} className={tab === item ? "active" : ""}>{item}</button>)}</div>
          <fieldset disabled={busy} className="inspector-content">
            {tab === "rooms" && <><div className="section-label">AREAS <button onClick={addRoom}>＋ Add</button></div><select aria-label="Selected room" value={room?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="" disabled>Select an area</option>{layout.rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              {room && <><label>Name<input value={room.name} onChange={event => updateRoom({ name: event.target.value })}/></label><label>Type<select value={room.type} onChange={event => updateRoom({ type: event.target.value as RoomKind })}>{["room", "lobby", "bathroom", "reception"].map(type => <option key={type}>{type}</option>)}</select></label><div className="fields">{(["x", "y", "width", "height"] as const).map(key => <NumberField key={key} label={`Room ${key}`} value={room[key]} min={key === "width" || key === "height" ? 1 : 0} onChange={value => updateRoom({ [key]: value })}/>)}</div><button className="text-button danger" onClick={removeSelected}>Remove area & its sensors</button></>}
              <p className="help">Room edits move assigned sensors proportionally. Each guest room needs a temperature sensor; each bathroom needs a leak sensor.</p></>}
            {tab === "devices" && <><div className="section-label">SENSORS & GATEWAYS <span>{layout.devices.length + layout.gateways.length}</span></div><select aria-label="Selected device" value={device?.id ?? gateway?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="" disabled>Select a device</option>{[...layout.devices, ...layout.gateways].map(item => <option key={item.id}>{item.id}</option>)}</select><div className="button-row"><button className="button subtle" onClick={() => addSensor("temperature_sensor")}>＋ Temp</button><button className="button subtle" onClick={() => addSensor("leak_sensor")}>＋ Leak</button><button className="button subtle" disabled={layout.gateways.length >= 2} onClick={addGateway}>＋ Gateway</button></div>
              {(device || gateway) && <><div className="fields"><NumberField label="Device x" value={(device ?? gateway)!.x} onChange={value => edit(draft => { Object.assign([...draft.devices, ...draft.gateways].find(item => item.id === selected)!, { x: value }); })}/><NumberField label="Device y" value={(device ?? gateway)!.y} onChange={value => edit(draft => { Object.assign([...draft.devices, ...draft.gateways].find(item => item.id === selected)!, { y: value }); })}/></div>
                {device && <label>Assigned room<select value={device.room_id} onChange={event => edit(draft => { draft.devices.find(item => item.id === selected)!.room_id = event.target.value; })}>{layout.rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                {gateway && <label className="toggle"><input type="checkbox" checked={gateway.active} onChange={event => edit(draft => { draft.gateways.find(item => item.id === selected)!.active = event.target.checked; })}/> Gateway active</label>}
                <button className="text-button danger" onClick={removeSelected}>Remove device</button></>}
              <p className="help">Drag T, L or G markers on the floor. An inactive gateway cannot carry traffic.</p></>}
            {tab === "walls" && <><div className="section-label">WALL SEGMENTS <button onClick={() => { const next: Wall = { id: uid("wall"), x1: 640, y1: 0, x2: 640, y2: 600, material: "concrete" }; edit(draft => { draft.walls.push(next); }); setSelected(next.id); }}>＋ Add</button></div><select aria-label="Selected wall" value={wall?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="" disabled>Select a wall</option>{layout.walls.map(item => <option key={item.id}>{item.id}</option>)}</select>{wall && <><label>Material<select value={wall.material} onChange={event => edit(draft => { draft.walls.find(item => item.id === selected)!.material = event.target.value as Wall["material"]; })}>{["drywall", "wood", "concrete", "metal"].map(item => <option key={item}>{item}</option>)}</select></label><div className="fields">{(["x1", "y1", "x2", "y2"] as const).map(key => <NumberField key={key} label={`Wall ${key}`} value={wall[key]} onChange={value => edit(draft => { draft.walls.find(item => item.id === selected)![key] = value; })}/>)}</div><button className="text-button danger" onClick={removeSelected}>Remove wall</button></>}<p className="help">Assumed losses: drywall 3 dB, wood 5 dB, concrete 12 dB, metal 20 dB. Only interior crossings count.</p></>}
            {tab === "settings" && <><div className="section-label">REQUIREMENTS</div><NumberField label="Coverage required (0–1)" value={layout.requirements.coverage_required} step={0.01} min={0} max={1} onChange={value => edit(draft => { draft.requirements.coverage_required = value; })}/><NumberField label="Minimum reliability (0–1)" value={layout.requirements.min_reliability} step={0.01} min={0} max={1} onChange={value => edit(draft => { draft.requirements.min_reliability = value; })}/><NumberField label="Maximum latency (ms)" value={layout.requirements.max_latency_ms} min={0} onChange={value => edit(draft => { draft.requirements.max_latency_ms = value; })}/><div className="section-label">MODEL & RECEPTION</div><NumberField label="Metres per logical unit" value={layout.simulation.metres_per_unit} min={0.001} step={0.01} onChange={value => edit(draft => { draft.simulation.metres_per_unit = value; })}/><NumberField label="Random seed" value={layout.simulation.seed} min={0} onChange={value => edit(draft => { draft.simulation.seed = value; })}/><div className="fields"><NumberField label="Reception x" value={layout.reception.x} onChange={value => edit(draft => { draft.reception.x = value; })}/><NumberField label="Reception y" value={layout.reception.y} onChange={value => edit(draft => { draft.reception.y = value; })}/></div><p className="help">Approximate log-distance loss, seeded packet trials, and a fixed wired reception backhaul. No real-world radio measurements.</p></>}
          </fieldset>
        </aside>
      </div>
      <section className="panel resilience-panel"><div><span className="eyebrow">RESILIENCE / BREAK IT, THEN TEST RECOVERY</span><h2>What if a gateway goes offline?</h2><p>Recalculate affected sensors, then test a backup against the same requirements.</p></div><div className="resilience-controls"><select aria-label="Gateway to fail" disabled={busy} value={layout.gateways.some(item => item.id === failureId) ? failureId : layout.gateways[0]?.id ?? ""} onChange={event => setFailureId(event.target.value)}>{layout.gateways.map(item => <option key={item.id} value={item.id}>{item.id} · {item.active ? "online" : "offline"}</option>)}</select><button className="button fail-button" disabled={busy || !layout.gateways.length} onClick={() => void scenario("failure")}>⏻ Fail gateway</button><button className="button subtle" disabled={busy || layout.gateways.length >= 2 || !layout.gateways.some(item => !item.active)} onClick={() => void scenario("failure", true)}>＋ Test backup recovery</button></div></section>
      {error && <div className="error" role="alert"><b>Unable to complete request.</b> {error}</div>}
      {comparison && <section className="panel comparison"><div className="panel-heading"><div><span className="eyebrow">TWO REAL SIMULATION RUNS</span><h2>{comparison.label}</h2></div>{comparison.improved !== undefined && <span className="pill">{comparison.improved ? "VERIFIED IMPROVEMENT" : "NO IMPROVEMENT"}</span>}</div><div className="table-scroll"><table><thead><tr><th>Run</th><th>Coverage</th><th>Reliability</th><th>Worst latency</th><th>Requirements</th></tr></thead><tbody>{(["before", "after"] as const).map(key => <tr key={key}><td><b>{key === "before" ? "Before" : "After"}</b></td><td>{percent(comparison[key].summary.coverage)}</td><td>{percent(comparison[key].summary.reliability)}</td><td>{latency(comparison[key].summary.worst_latency_ms)}</td><td className={comparison[key].requirements_evaluation.pass ? "status-pass" : "status-fail"}>{comparison[key].requirements_evaluation.pass ? "PASS" : "FAIL"}</td></tr>)}</tbody></table></div></section>}
      <section className="panel result-panel"><div className="panel-heading"><div><span className="eyebrow">03 / SIMULATOR RESULTS</span><h2>Every sensor, accounted for.</h2></div><span className="pill">REAL C++ OUTPUT</span></div>
        {!result ? <div className="empty"><span>⌁</span><h3>Your next run starts here.</h3><p>Simulation results appear after you run the current layout.</p></div> : <><div className="checks">{Object.entries(result.requirements_evaluation.checks).map(([name, passed]) => <span key={name} className={passed ? "pass" : "fail"}>{passed ? "✓" : "×"} {name}</span>)}</div>{result.requirements_evaluation.diagnostics.length > 0 && <div className="diagnostics">{result.requirements_evaluation.diagnostics.map(item => <p key={item}>• {item}</p>)}</div>}<div className="table-scroll"><table><thead><tr><th>Sensor</th><th>Selected gateway</th><th>Signal</th><th>Delivery</th><th>Reliability</th><th>Worst latency</th></tr></thead><tbody>{result.devices.map(item => <tr key={item.device_id}><td><b>{item.device_id}</b><small>{layout.rooms.find(area => area.id === layout.devices.find(sensor => sensor.id === item.device_id)?.room_id)?.name}</small></td><td>{item.gateway_id ?? "No reachable gateway"}</td><td>{item.rssi_dbm === null ? "—" : `${item.rssi_dbm.toFixed(1)} dBm`}</td><td>{item.delivered_messages} / {item.generated_messages}</td><td>{percent(item.reliability)}</td><td>{latency(item.worst_latency_ms)}</td></tr>)}</tbody></table></div><details className="geometry-detail"><summary>Inspect all {result.geometry.links.length} device-to-gateway links</summary><div className="table-scroll"><table><thead><tr><th>Link</th><th>Distance</th><th>Walls</th><th>Wall loss</th><th>RSSI</th></tr></thead><tbody>{result.geometry.links.map(item => <tr key={`${item.source}-${item.destination}`}><td>{item.source} → {item.destination}</td><td>{item.distance_metres.toFixed(2)} m</td><td>{item.walls_crossed}</td><td>{item.wall_attenuation_db} dB</td><td>{item.rssi_dbm.toFixed(1)} dBm</td></tr>)}</tbody></table></div></details></>}
      </section>
      <section className="json-controls"><button className="text-button" onClick={() => { setJsonText(JSON.stringify(layout, null, 2)); setShowJson(!showJson); }}>{showJson ? "Hide" : "Import / export"} schema 1.0 JSON</button>{showJson && <><textarea aria-label="Layout JSON" value={jsonText} onChange={event => setJsonText(event.target.value)}/><button className="button subtle" disabled={busy} onClick={() => void importJson()}>Validate & load JSON</button></>}</section>
      <footer><span><b>IoTForge</b> · Indoor deployment lab</span><span>Approximate engineering models. Validate installations with a real site survey.</span></footer>
    </main>
  </div>;
}

function Metric({ title, value, detail, state = "" }: { title: string; value: string; detail: string; state?: string }) {
  return <article className={`metric ${state}`}><span>{title}</span><strong>{value}</strong><p>{detail}</p></article>;
}
function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label>{label}<input type="number" value={Number(value.toFixed(3))} min={min} max={max} step={step} onChange={event => { if (event.target.value !== "") onChange(Number(event.target.value)); }}/></label>;
}
