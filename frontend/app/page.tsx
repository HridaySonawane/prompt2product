"use client";

import { useMemo, useState } from "react";

type Room = { id: string; name: string; kind: "room" | "lobby" | "bathroom" | "reception"; x: number; y: number; w?: number; h?: number };
type Device = { id: string; type: "temperature" | "leak" | "gateway"; roomId: string; label?: string };

const initialRooms: Room[] = [
  { id: "r101", name: "Room 101", kind: "room", x: 0, y: 0 },
  { id: "r102", name: "Room 102", kind: "room", x: 1, y: 0 },
  { id: "r103", name: "Room 103", kind: "room", x: 2, y: 0 },
  { id: "r104", name: "Room 104", kind: "room", x: 0, y: 1 },
  { id: "lobby", name: "Lobby", kind: "lobby", x: 1, y: 1 },
  { id: "r105", name: "Room 105", kind: "room", x: 2, y: 1 },
  { id: "bath", name: "Bathroom", kind: "bathroom", x: 0, y: 2 },
  { id: "reception", name: "Reception", kind: "reception", x: 1, y: 2 },
];
const roomIcon = (kind: Room["kind"]) => ({ room: "▦", lobby: "⌂", bathroom: "◉", reception: "▤" })[kind];
const deviceInfo = {
  temperature: { icon: "🌡️", name: "Temperature sensor", color: "temp" },
  leak: { icon: "💧", name: "Leak sensor", color: "leak" },
  gateway: { icon: "📡", name: "Gateway", color: "gateway" },
};

export default function Home() {
  const [rooms, setRooms] = useState(initialRooms);
  const [devices, setDevices] = useState<Device[]>([
    { id: "d1", type: "temperature", roomId: "r101" },
    { id: "d2", type: "temperature", roomId: "r102" },
    { id: "d3", type: "temperature", roomId: "r103" },
    { id: "d4", type: "temperature", roomId: "r104" },
    { id: "d5", type: "temperature", roomId: "r105" },
    { id: "d6", type: "leak", roomId: "bath" },
    { id: "g1", type: "gateway", roomId: "lobby" },
  ]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [requirement, setRequirement] = useState("Monitor temperature in every room, detect bathroom leaks, and make sure alerts reach reception within 2 seconds.");
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [simulated, setSimulated] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failedGateway, setFailedGateway] = useState<string | null>(null);
  const [optimized, setOptimized] = useState(false);
  const [notice, setNotice] = useState("Ready to design");

  const gateways = devices.filter((d) => d.type === "gateway");
  const activeSensors = devices.filter((d) => d.type !== "gateway");
  const metrics = useMemo(() => {
    const base = optimized ? { coverage: 98, reliability: 97, avg: 840, worst: 1420 } : { coverage: 84, reliability: 88, avg: 1700, worst: 2800 };
    if (failed) return optimized ? { coverage: 92, reliability: 94, avg: 1040, worst: 1700 } : { coverage: 42, reliability: 55, avg: 3100, worst: 5100 };
    if (gateways.length > 1 && simulated) return { coverage: 99, reliability: 99, avg: 710, worst: 1180 };
    return base;
  }, [failed, optimized, gateways.length, simulated]);
  const selectedDevice = devices.find((device) => device.id === selected);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? (selectedDevice ? rooms.find((room) => room.id === selectedDevice.roomId) : null);

  function runDesign() {
    const deployment: Device[] = [];
    rooms.forEach((room) => {
      if (room.kind === "room") deployment.push({ id: `temp-${room.id}`, type: "temperature", roomId: room.id });
      if (room.kind === "bathroom") deployment.push({ id: `leak-${room.id}`, type: "leak", roomId: room.id });
    });
    const hub = rooms.find((room) => room.kind === "lobby") ?? rooms[0];
    if (hub) deployment.push({ id: "gateway-main", type: "gateway", roomId: hub.id });
    setDevices(deployment);
    setFailed(false); setFailedGateway(null); setOptimized(false); setSimulated(false); setSelected(null);
    setNotice("AI design placed · 6 devices connected");
  }
  function simulate() { setSimulated(true); setNotice(failed ? "Failure simulation complete" : "Simulation complete · network evaluated"); }
  function optimize() {
    setDevices((current) => {
      const hub = rooms.find((room) => room.kind === "lobby") ?? rooms[0];
      const extra = rooms.find((room) => room.kind === "room" && room.x === 2) ?? rooms[rooms.length - 1];
      const gatewaysNow = current.filter((device) => device.type === "gateway");
      const sensors = current.filter((device) => device.type !== "gateway");
      if (gatewaysNow.length < 2 && extra && hub) return [...sensors, { id: "gateway-main", type: "gateway", roomId: hub.id }, { id: "gateway-backup", type: "gateway", roomId: extra.id }];
      return current;
    });
    setOptimized(true); setFailed(false); setSimulated(false);
    setNotice("Resilience improved · backup gateway added");
  }
  function addRoom() {
    const next = rooms.filter((room) => room.kind === "room").length + 101;
    const spots = [[0, 3], [1, 3], [2, 3], [3, 0], [3, 1], [3, 2]];
    const [x, y] = spots.find(([sx, sy]) => !rooms.some((room) => room.x === sx && room.y === sy)) ?? [rooms.length % 4, 3];
    setRooms((current) => [...current, { id: `r${next}`, name: `Room ${next}`, kind: "room", x, y }]);
    setNotice("Room added · select its name to rename");
  }
  function moveSelectedRoom(dx: number, dy: number) {
    if (!selectedRoom) return;
    const x = Math.max(0, Math.min(3 - (selectedRoom.w ?? 1) + 1, selectedRoom.x + dx));
    const y = Math.max(0, Math.min(3 - (selectedRoom.h ?? 1) + 1, selectedRoom.y + dy));
    const occupant = rooms.find((room) => room.id !== selectedRoom.id && room.x === x && room.y === y);
    setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, x: occupant ? occupant.x : x, y: occupant ? occupant.y : y } : occupant && room.id === occupant.id ? { ...room, x: selectedRoom.x, y: selectedRoom.y } : room));
    setNotice(`${selectedRoom.name} moved`);
  }
  function resizeSelectedRoom(dw: number, dh: number) {
    if (!selectedRoom) return;
    const w = Math.max(1, Math.min(2, (selectedRoom.w ?? 1) + dw));
    const h = Math.max(1, Math.min(2, (selectedRoom.h ?? 1) + dh));
    if (selectedRoom.x + w > 4 || selectedRoom.y + h > 4) return;
    const blocked = rooms.some((room) => room.id !== selectedRoom.id && room.x < selectedRoom.x + w && room.x + (room.w ?? 1) > selectedRoom.x && room.y < selectedRoom.y + h && room.y + (room.h ?? 1) > selectedRoom.y);
    if (blocked) { setNotice("Resize blocked · move nearby rooms first"); return; }
    setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, w, h } : room));
    setNotice(`${selectedRoom.name} resized`);
  }
  function addDevice(type: Device["type"]) {
    const room = rooms.find((r) => r.kind === (type === "gateway" ? "lobby" : type === "leak" ? "bathroom" : "room")) ?? rooms[0];
    if (!room) return;
    const id = `${type}-${Date.now()}`;
    setDevices((current) => [...current, { id, type, roomId: room.id }]); setSelected(id); setNotice(`${deviceInfo[type].name} added`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#workspace"><span className="brand-mark">◈</span><span>twin<span className="brand-light">forge</span><small>SECURITY DIGITAL TWIN</small></span></a>
        <div className="topbar-center"><span className="live-dot" /> WORKSPACE <span className="crumb">/</span> RESIDENCE 01 <span className="topbar-pill">DEMO</span></div>
        <div className="topbar-right"><button className="icon-button" aria-label="Notifications">♧</button><span className="avatar">JD</span><span className="profile-name">Jordan Davis <small>DESIGNER</small></span><span className="chevron">⌄</span></div>
      </header>

      <div className="workspace" id="workspace">
        <section className="main-column">
          <div className="page-heading"><div><div className="eyebrow">DIGITAL TWIN <span>·</span> BUILDING 01</div><h1>Residence <span>01</span></h1><p>Design, simulate, and harden your building network.</p></div><button className="outline-button" onClick={() => { setRooms(initialRooms); setDevices([]); setFailed(false); setOptimized(false); setSimulated(false); setNotice("Example building restored"); }}>↺ <span>Reset workspace</span></button></div>

          <section className="card plan-card">
            <div className="card-head"><div><div className="section-label">FLOOR PLAN</div><h2>Building layout <span className="count-chip">{rooms.length} spaces</span></h2></div><div className="plan-actions"><button className={`toggle-button ${showHeatmap ? "active" : ""}`} onClick={() => setShowHeatmap(!showHeatmap)}><span className="heat-icon">◉</span> Signal heatmap <span className={`switch ${showHeatmap ? "on" : ""}`} /></button><button className="square-button" aria-label="Add room" title="Add room" onClick={addRoom}>＋</button><button className="square-button" aria-label="Remove room" title="Remove last room" onClick={() => { const removable = [...rooms].reverse().find((r) => r.kind === "room"); if (removable) { setRooms((current) => current.filter((r) => r.id !== removable.id)); setDevices((current) => current.filter((d) => d.roomId !== removable.id)); setNotice(`${removable.name} removed`); } }}>−</button><button className="square-button" aria-label="Toggle bathroom" title="Add or remove bathroom" onClick={() => { const bath = rooms.find((r) => r.kind === "bathroom"); if (bath) { setRooms((current) => current.filter((r) => r.id !== bath.id)); setDevices((current) => current.filter((d) => d.roomId !== bath.id)); setNotice("Bathroom removed"); } else { const [x,y] = [[0,3],[1,3],[2,3],[3,0],[3,1],[3,2]].find(([sx,sy]) => !rooms.some((r) => r.x===sx && r.y===sy)) ?? [0,3]; setRooms((current) => [...current,{id:"bath",name:"Bathroom",kind:"bathroom",x,y}]); setNotice("Bathroom added"); } }}>◉</button></div></div>
            <div className={`plan-canvas ${showHeatmap ? "heat-on" : ""}`}>
              <div className="plan-topline"><span><span className="mini-dot" /> NORTH WING</span><span>28 m <span className="dimension-line" /></span></div>
              <div className="floor-grid" style={{ gridTemplateColumns: `repeat(${Math.max(3, Math.min(4, Math.max(...rooms.map((r) => r.x)) + 1))}, minmax(0, 1fr))` }}>
                {rooms.map((room) => {
                  const occupants = devices.filter((d) => d.roomId === room.id);
                  const signal = room.kind === "lobby" ? "strong" : room.x >= 2 && !optimized ? "weak" : room.kind === "bathroom" ? "moderate" : "good";
                  return <div key={room.id} className={`room-cell ${room.kind} signal-${signal} ${selectedRoom?.id === room.id ? "room-selected" : ""}`} style={{ gridColumn: `${room.x + 1} / span ${room.w ?? 1}`, gridRow: `${room.y + 1} / span ${room.h ?? 1}` }} onClick={() => setSelectedRoomId(room.id)}>
                    <div className="room-heading"><span className="room-symbol">{roomIcon(room.kind)}</span><input aria-label={`Rename ${room.name}`} value={room.name} onClick={() => setSelectedRoomId(room.id)} onChange={(event) => setRooms((current) => current.map((r) => r.id === room.id ? { ...r, name: event.target.value } : r))} /></div>
                    <div className="room-kind">{room.kind === "room" ? "PRIVATE ROOM" : room.kind.toUpperCase()}</div>
                    <div className="device-list">{occupants.map((device) => { const offline = failed && device.id === failedGateway; return <button key={device.id} className={`device-chip ${deviceInfo[device.type].color} ${selected === device.id ? "selected" : ""} ${failed && !optimized && device.type !== "gateway" ? "degraded" : ""} ${offline ? "degraded" : ""}`} onClick={() => setSelected(device.id)} title={`Select ${deviceInfo[device.type].name}`}><span>{deviceInfo[device.type].icon}</span>{device.type === "gateway" ? device.id.includes("backup") ? "GW-02" : "GW-01" : device.type === "temperature" ? "TEMP" : "LEAK"}{offline ? <i>OFFLINE</i> : null}</button>; })}</div>
                    {room.kind === "reception" && <div className="server-label"><span>▣</span> SERVER · ALERT DESTINATION</div>}
                  </div>;
                })}
                <svg className="connections" viewBox="0 0 900 520" preserveAspectRatio="none" aria-hidden="true"><path className={failed ? "line-failed" : "line-healthy"} d="M 165 95 C 280 130, 375 185, 450 260"/><path className={failed ? "line-failed" : "line-healthy"} d="M 450 95 C 470 165, 470 200, 450 260"/><path className={failed ? "line-failed" : "line-weak"} d="M 735 95 C 630 150, 540 205, 450 260"/><path className={failed ? "line-failed" : "line-healthy"} d="M 165 265 C 270 260, 350 260, 450 260"/><path className={failed ? "line-failed" : "line-healthy"} d="M 735 265 C 610 265, 535 260, 450 260"/><path className="line-uplink" d="M 450 260 C 485 340, 570 390, 650 430"/></svg>
              </div>
              <div className="plan-bottomline"><span><span className="mini-dot" /> SOUTH WING</span><span>28 m <span className="dimension-line" /></span></div>
              <div className="plan-legend"><span><i className="legend-dot strong-dot"/>Strong</span><span><i className="legend-dot moderate-dot"/>Moderate</span><span><i className="legend-dot weak-dot"/>Weak</span><span className="legend-divider"/><span><i className="legend-line healthy-line"/>Connected</span><span><i className="legend-line broken-line"/>Degraded</span></div>
            </div>
            <div className="plan-footer"><span>⌖ &nbsp;Select a room to move or resize · edit names inline</span><div className="room-tools"><span>{selectedRoom ? selectedRoom.name : "Select a room"}</span><button title="Move left" onClick={() => moveSelectedRoom(-1,0)}>←</button><button title="Move up" onClick={() => moveSelectedRoom(0,-1)}>↑</button><button title="Move down" onClick={() => moveSelectedRoom(0,1)}>↓</button><button title="Move right" onClick={() => moveSelectedRoom(1,0)}>→</button><span className="tool-separator"/><button title="Widen room" onClick={() => resizeSelectedRoom(1,0)}>↔</button><button title="Taller room" onClick={() => resizeSelectedRoom(0,1)}>↕</button><button className="text-button" onClick={addRoom}>＋ Add room</button></div></div>
          </section>

          <section className="card results-card">
            <div className="card-head results-head"><div><div className="section-label">NETWORK PERFORMANCE</div><h2>Simulation results</h2></div><div className={`result-state ${metrics.coverage >= 95 && metrics.reliability >= 95 && metrics.worst <= 2000 ? "pass" : "fail"}`}><span />{metrics.coverage >= 95 && metrics.reliability >= 95 && metrics.worst <= 2000 ? "REQUIREMENTS MET" : "REQUIREMENTS AT RISK"}</div></div>
            <div className="metrics-grid"><Metric label="Coverage" value={`${metrics.coverage}%`} detail="Target ≥ 95%" progress={metrics.coverage} tone={metrics.coverage >= 95 ? "green" : "amber"}/><Metric label="Reliability" value={`${metrics.reliability}%`} detail="Target ≥ 95%" progress={metrics.reliability} tone={metrics.reliability >= 95 ? "green" : "amber"}/><Metric label="Avg. latency" value={`${(metrics.avg / 1000).toFixed(2)}s`} detail="Target ≤ 2.0s" progress={Math.min(100, metrics.avg / 20)} tone="blue"/><Metric label="Worst latency" value={`${(metrics.worst / 1000).toFixed(2)}s`} detail="Target ≤ 2.0s" progress={Math.min(100, metrics.worst / 30)} tone={metrics.worst <= 2000 ? "green" : "red"}/></div>
            {failed && <div className="failure-callout"><span className="failure-icon">!</span><div><strong>Gateway 01 is offline</strong><p>{optimized ? "Backup gateway is maintaining connectivity across the building." : `${Math.max(1, activeSensors.length - 2)} sensors lost their path to reception.`}</p></div><span className="failure-impact">{optimized ? "BACKUP ACTIVE" : "NETWORK DEGRADED"}</span></div>}
            {optimized && !failed && <div className="comparison"><span className="compare-title">AI OPTIMIZATION</span><span>Coverage <b>84%</b> <i>→</i> <strong>98%</strong></span><span>Reliability <b>88%</b> <i>→</i> <strong>97%</strong></span><span>Worst latency <b>2.8s</b> <i>→</i> <strong>1.4s</strong></span><span className="compare-pass">FAIL <i>→</i> PASS</span></div>}
          </section>
        </section>

        <aside className="control-panel">
          <div className="panel-title"><div><div className="section-label">CONTROL CENTER</div><h2>Design workspace</h2></div><span className="panel-status"><i /> LIVE</span></div>
          <div className="panel-scroll">
            <section className="panel-section"><div className="section-heading"><span className="step-number">01</span><div><h3>Requirements</h3><p>Describe what your network needs to do</p></div></div><label className="sr-only" htmlFor="requirement">Building requirements</label><textarea id="requirement" className="requirement-input" value={requirement} onChange={(event) => setRequirement(event.target.value)} /><div className="requirement-summary"><div className="summary-title"><span>✧</span> EXTRACTED REQUIREMENTS <span className="ai-tag">AI</span></div><div className="summary-row"><span>Temperature coverage</span><b>100%</b></div><div className="summary-row"><span>Leak detection</span><b>Required</b></div><div className="summary-row"><span>Max. latency</span><b>2,000 ms</b></div><div className="summary-row"><span>Min. reliability</span><b>95%</b></div></div></section>
            <section className="panel-section device-section"><div className="section-heading"><span className="step-number">02</span><div><h3>Devices <span className="small-count">{devices.length}</span></h3><p>Place sensors and network hardware</p></div></div><div className="catalog"><button onClick={() => addDevice("temperature")}><span className="catalog-icon temp-icon">🌡️</span><span>Temperature<small>Room monitoring</small></span><b>＋</b></button><button onClick={() => addDevice("leak")}><span className="catalog-icon leak-icon">💧</span><span>Leak sensor<small>Wet area detection</small></span><b>＋</b></button><button onClick={() => addDevice("gateway")}><span className="catalog-icon gateway-icon">📡</span><span>Gateway<small>Network uplink</small></span><b>＋</b></button></div>{selectedDevice && <div className="selected-device"><div className="selected-top"><span>{deviceInfo[selectedDevice.type].icon} &nbsp;SELECTED DEVICE</span><button aria-label="Remove selected device" onClick={() => { setDevices((current) => current.filter((d) => d.id !== selectedDevice.id)); setSelected(null); }}>×</button></div><strong>{deviceInfo[selectedDevice.type].name}</strong><select value={selectedDevice.roomId} onChange={(event) => setDevices((current) => current.map((d) => d.id === selectedDevice.id ? { ...d, roomId: event.target.value } : d))}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select><div className="device-facts"><span>Signal <b className={failed ? "text-amber" : "text-green"}>{failed ? "Weak" : "Good"}</b></span><span>Latency <b>{failed ? "3,100" : "420"} ms</b></span><span>Reliability <b>{failed ? "55%" : "97%"}</b></span></div></div>}</section>
            <section className="panel-section actions-section"><div className="section-heading"><span className="step-number">03</span><div><h3>Design & simulate</h3><p>Generate and evaluate your deployment</p></div></div><button className="primary-action" onClick={runDesign}><span>✧</span> AI DESIGN <small>⌘ ↵</small></button><button className="secondary-action" onClick={simulate}><span>▶</span> SIMULATE <small>Run network analysis</small></button><button className="secondary-action optimize-action" onClick={optimize}><span>✦</span> OPTIMIZE <small>Improve coverage & resilience</small></button><div className="action-divider"/><button className={`failure-action ${failed ? "is-failed" : ""}`} onClick={() => { if (failed) { setFailed(false); setFailedGateway(null); setNotice("Gateway restored"); } else { const gateway = (selectedDevice?.type === "gateway" ? selectedDevice : gateways[0]); if (gateway) { setFailedGateway(gateway.id); setFailed(true); setNotice(`${gateway.id.includes("backup") ? "Gateway 02" : "Gateway 01"} failed · network degraded`); } else { setNotice("Add or design a gateway before testing failure"); } } setSimulated(true); }}><span className="failure-button-icon">⚡</span><span>{failed ? "RESTORE GATEWAY" : "FAIL GATEWAY"}<small>{failed ? "Bring the failed gateway back online" : "Test network resilience"}</small></span><span className="arrow">↗</span></button></section>
            <section className="assistant-note"><div className="assistant-spark">✧</div><div><strong>DESIGN ASSISTANT</strong><p>{optimized ? "A backup gateway now covers the east wing. Run a failure simulation to verify the resilient design." : failed ? "Gateway 01 is offline. Optimize to add a backup path and keep critical sensors connected." : "Your east wing has weaker signal. Run AI Design to place devices, then simulate to see the coverage."}</p><span>◉ &nbsp;{notice}</span></div></section>
          </div>
          <div className="panel-footer"><span><i className="live-dot"/> System operational</span><span>v1.4.2</span></div>
        </aside>
      </div>
      <footer className="statusbar"><div className="status-brand"><span>◈</span> NETWORK STATUS</div><div><i className="status-dot green-dot"/><span>Coverage</span><b>{metrics.coverage}%</b></div><div><i className="status-dot amber-dot"/><span>Reliability</span><b>{metrics.reliability}%</b></div><div><i className="status-dot blue-dot"/><span>Avg. latency</span><b>{(metrics.avg / 1000).toFixed(2)}s</b></div><div><i className="status-dot red-dot"/><span>Worst latency</span><b>{(metrics.worst / 1000).toFixed(2)}s</b></div><div className={`overall-status ${metrics.coverage >= 95 && metrics.reliability >= 95 ? "overall-pass" : "overall-fail"}`}><span>{metrics.coverage >= 95 && metrics.reliability >= 95 ? "✓" : "!"}</span>{metrics.coverage >= 95 && metrics.reliability >= 95 ? "PASS" : "AT RISK"}</div><div className="security-state"><span className="shield">⬡</span><span>RESILIENCE</span><b>{failed ? optimized ? "BACKUP ACTIVE" : "DEGRADED" : optimized ? "HARDENED" : "STANDARD"}</b></div></footer>
    </main>
  );
}

function Metric({ label, value, detail, progress, tone }: { label: string; value: string; detail: string; progress: number; tone: string }) {
  return <div className="metric"><div className="metric-label">{label}<span className={`metric-check ${tone}`}>{tone === "green" ? "✓" : tone === "red" ? "!" : "·"}</span></div><strong>{value}</strong><div className="metric-track"><i className={tone} style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}/></div><small>{detail}</small></div>;
}
