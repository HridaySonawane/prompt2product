import { useEffect, useRef, useState } from "react";
import hotel from "../../shared/fixtures/network-hotel.json";
import weakHotel from "../../shared/fixtures/weak-signal.json";
import type {
  Layout,
  Result,
  Room,
  RoomKind,
  Sensor,
  Wall,
  Planner,
  ScenarioResult,
} from "./models";
import {
  availablePosition,
  bindGateways,
  bindReception,
  constrainLayout,
  markerSize,
  moveRoom,
  reassignSensor,
  prepareLayout,
  removeArea,
} from "./editor";
import { clientToFloor } from "./room_layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Download,
  LayoutGrid,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  WandSparkles,
  Wifi,
  X,
  LockKeyhole,
  UnlockKeyhole,
  Trash2,
  Thermometer,
  Droplets,
} from "lucide-react";

const api = import.meta.env?.VITE_IOTFORGE_API_URL ?? "";
const copy = <T,>(value: T): T => structuredClone(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const latency = (value: number | null) =>
  value === null ? "Undefined" : `${value.toFixed(0)} ms`;
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const initial = copy(hotel) as Layout;
constrainLayout(initial, bindGateways(initial));

export default function App() {
  const [layout, setLayout] = useState<Layout>(copy(initial));
  const gatewayRooms = useRef(bindGateways(initial));
  const receptionRoom = useRef(bindReception(initial));
  const [editContents, setEditContents] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    id: string;
    mode: "room" | "content";
    dx: number;
    dy: number;
    clientX: number;
    clientY: number;
    layout: Layout;
    moved: boolean;
  } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState("room_101");
  const [tab, setTab] = useState<"rooms" | "devices" | "walls" | "settings">(
    "rooms",
  );
  const [health, setHealth] = useState("Checking backend");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(
    "Edit the floor plan, then simulate your deployment.",
  );
  const [showJson, setShowJson] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [prompt, setPrompt] = useState(
    "Monitor temperature in all five rooms, detect bathroom leaks, and deliver alerts to reception within two seconds with at least 95% reliability.",
  );
  const [aiStatus, setAiStatus] = useState("Checking local AI…");
  const [planner, setPlanner] = useState<Planner | null>(null);
  const [comparison, setComparison] = useState<{
    before: Result;
    after: Result;
    label: string;
    improved?: boolean;
  } | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [failureId, setFailureId] = useState("gateway_1");
  const svg = useRef<SVGSVGElement>(null);
  const device = layout.devices.find((item) => item.id === selected);
  const gateway = layout.gateways.find((item) => item.id === selected);
  const room =
    layout.rooms.find((item) => item.id === selected) ??
    layout.rooms.find(
      (item) =>
        item.id ===
        (device?.room_id ??
          gatewayRooms.current[selected] ??
          (selected === layout.reception.id ? receptionRoom.current : "")),
    );
  const wall = layout.walls.find((item) => item.id === selected);
  const selectedFailureId = layout.gateways.some(
    (item) => item.id === failureId,
  )
    ? failureId
    : (layout.gateways[0]?.id ?? "");
  const areaContents = room
    ? [
        ...layout.devices
          .filter((item) => item.room_id === room.id)
          .map((item) => ({
            ...item,
            kind: "sensor",
            label:
              item.type === "leak_sensor"
                ? "Water leak sensor"
                : "Temperature sensor",
          })),
        ...layout.gateways
          .filter((item) => gatewayRooms.current[item.id] === room.id)
          .map((item) => ({
            ...item,
            kind: "gateway",
            label: item.active ? "Gateway · online" : "Gateway · offline",
          })),
        ...(receptionRoom.current === room.id
          ? [
              {
                ...layout.reception,
                kind: "reception",
                label: "Reception desk",
              },
            ]
          : []),
      ]
    : [];
  const content = areaContents.find((item) => item.id === selected);

  useEffect(() => {
    let active = true;
    fetch(`${api}/api/health`)
      .then((response) => response.json())
      .then((data) => {
        if (active)
          setHealth(
            data.simulator_available
              ? "C++ engine ready"
              : "Build simulator first",
          );
      })
      .catch(() => {
        if (active) setHealth("Backend offline");
      });
    fetch(`${api}/api/ai/health`)
      .then((response) => response.json())
      .then((data) => {
        if (active)
          setAiStatus(
            data.available
              ? `Local AI · ${data.model}`
              : "AI unavailable · labeled fallback available",
          );
      })
      .catch(() => {
        if (active) setAiStatus("AI unavailable · manual simulation works");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const blur = () => cancelDrag();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        cancelDrag();
      }
    };
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  function edit(change: (draft: Layout) => void) {
    if (busy || dragging) return false;
    const previousBindings = { ...gatewayRooms.current };
    const previousReception = receptionRoom.current;
    try {
      const next = copy(layout);
      change(next);
      setLayout(
        constrainLayout(next, gatewayRooms.current, receptionRoom.current),
      );
    } catch (cause) {
      gatewayRooms.current = previousBindings;
      receptionRoom.current = previousReception;
      setError(
        cause instanceof Error ? cause.message : "Cannot edit this layout",
      );
      return false;
    }
    invalidateResults();
    return true;
  }
  function invalidateResults() {
    setResult(null);
    setComparison(null);
    setPlanner(null);
    setError("");
    setNotice("Layout changed · simulate to refresh results.");
  }
  function load(value: Layout, bindings = bindGateways(value)) {
    const receptionId = bindReception(value);
    const prepared = prepareLayout(value, bindings, receptionId);
    gatewayRooms.current = bindings;
    receptionRoom.current = receptionId;
    setEditContents(false);
    setLayout(prepared);
    setResult(null);
    setError("");
    setSelected(value.rooms[0]?.id ?? "");
    setComparison(null);
    setPlanner(null);
    setFailureId(value.gateways[0]?.id ?? "");
    setNotice("Example loaded · results will be calculated when you simulate.");
  }
  function updateRoom(patch: Partial<Room>) {
    if (!room) return;
    edit((draft) =>
      moveRoom(
        draft,
        room.id,
        patch,
        gatewayRooms.current,
        receptionRoom.current,
      ),
    );
  }
  function addRoom() {
    const next: Room = {
      id: uid("room"),
      name: "New room",
      type: "room",
      x: 690,
      y: 50,
      width: 180,
      height: 140,
    };
    const added = edit((draft) => {
      draft.rooms.push(next);
      moveRoom(draft, next.id, {}, gatewayRooms.current, receptionRoom.current);
    });
    if (!added) return;
    setSelected(next.id);
    setTab("rooms");
  }
  function addSensor(type: Sensor["type"]) {
    const target =
      room ??
      layout.rooms.find(
        (item) =>
          item.id === device?.room_id ||
          item.id === gatewayRooms.current[selected],
      ) ??
      layout.rooms.find(
        (item) => item.type === (type === "leak_sensor" ? "bathroom" : "room"),
      );
    if (!target) {
      setError("Add a room before placing a sensor.");
      return;
    }
    const sensor = {
      id: uid(type === "leak_sensor" ? "leak" : "temp"),
      type,
      ...availablePosition(layout, target),
      room_id: target.id,
    };
    const added = edit((draft) => {
      draft.devices.push(sensor);
    });
    if (!added) return;
    setSelected(sensor.id);
    setTab("rooms");
  }
  function addGateway() {
    if (layout.gateways.length >= 2) return;
    const target =
      room ??
      layout.rooms.find(
        (item) =>
          item.id === device?.room_id ||
          item.id === gatewayRooms.current[selected],
      ) ??
      layout.rooms.find((item) => item.type === "lobby") ??
      layout.rooms[0];
    if (!target) {
      setError("Add an area before placing a gateway.");
      return;
    }
    const next = {
      id: uid("gateway"),
      ...availablePosition(layout, target),
      active: true,
    };
    const added = edit((draft) => {
      gatewayRooms.current[next.id] = target.id;
      draft.gateways.push(next);
    });
    if (!added) return;
    setSelected(next.id);
    setTab("rooms");
  }
  function removeContent(id: string) {
    const removed = edit((draft) => {
      draft.devices = draft.devices.filter((item) => item.id !== id);
      draft.gateways = draft.gateways.filter((item) => item.id !== id);
    });
    if (removed && selected === id) setSelected(room?.id ?? "");
  }
  function removeSelected(areaId?: string) {
    const id = areaId ?? selected;
    const removed = edit((draft) => {
      if (draft.rooms.some((item) => item.id === id))
        receptionRoom.current = removeArea(
          draft,
          id,
          gatewayRooms.current,
          receptionRoom.current,
        );
      else {
        draft.devices = draft.devices.filter((item) => item.id !== id);
        draft.gateways = draft.gateways.filter((item) => item.id !== id);
        draft.walls = draft.walls.filter((item) => item.id !== id);
      }
    });
    if (removed)
      setSelected(layout.rooms.find((item) => item.id !== id)?.id ?? "");
  }
  function position(event: { clientX: number; clientY: number }) {
    return clientToFloor(
      { x: event.clientX, y: event.clientY },
      svg.current!.getBoundingClientRect(),
      layout.floor,
    );
  }
  function startDrag(
    event: React.PointerEvent<SVGElement>,
    id: string,
    mode: "room" | "content",
  ) {
    if (busy || gesture.current || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = position(event);
    const target =
      mode === "room"
        ? layout.rooms.find((item) => item.id === id)
        : [...layout.devices, ...layout.gateways, layout.reception].find(
            (item) => item.id === id,
          );
    if (!target) return;
    gesture.current = {
      pointerId: event.pointerId,
      id,
      mode,
      dx: point.x - target.x,
      dy: point.y - target.y,
      clientX: event.clientX,
      clientY: event.clientY,
      layout: copy(layout),
      moved: false,
    };
    svg.current!.setPointerCapture(event.pointerId);
    setDragging(true);
    setTab("rooms");
  }
  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    const start = gesture.current;
    if (!start || event.pointerId !== start.pointerId) return;
    // Clicking to inspect must not round fractional positions or invalidate results.
    if (
      !start.moved &&
      Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <
        2
    )
      return;
    const point = position(event),
      target = copy(start.layout);
    const desired = {
      x: Math.round(point.x - start.dx),
      y: Math.round(point.y - start.dy),
    };
    try {
      if (start.mode === "room")
        moveRoom(
          target,
          start.id,
          desired,
          gatewayRooms.current,
          receptionRoom.current,
        );
      else
        Object.assign(
          [...target.devices, ...target.gateways, target.reception].find(
            (item) => item.id === start.id,
          )!,
          desired,
        );
      constrainLayout(target, gatewayRooms.current, receptionRoom.current);
      if (JSON.stringify(target) === JSON.stringify(layout)) return;
      start.moved = true;
      setLayout(target);
      invalidateResults();
      setNotice(
        start.mode === "room"
          ? "Room moved · neighbouring areas and their contents adjusted automatically."
          : "Device positioned inside its assigned area.",
      );
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Cannot place this room here",
      );
    }
  }
  function finishDrag(
    event: React.PointerEvent<SVGSVGElement>,
    cancel = false,
  ) {
    const start = gesture.current;
    if (!start || event.pointerId !== start.pointerId) return;
    if (cancel && start.moved) {
      setLayout(copy(start.layout));
      setNotice("Move cancelled · layout restored.");
    }
    gesture.current = null;
    setDragging(false);
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
  }
  function cancelDrag() {
    const start = gesture.current;
    if (!start) return;
    gesture.current = null;
    setDragging(false);
    if (start.moved) {
      setLayout(copy(start.layout));
      setNotice("Move cancelled · layout restored.");
    }
    if (svg.current?.hasPointerCapture(start.pointerId))
      svg.current.releasePointerCapture(start.pointerId);
  }
  function selectRoom(id: string) {
    setSelected(id);
    setTab("rooms");
    setEditContents(false);
  }
  function startMarkerDrag(
    event: React.PointerEvent<SVGElement>,
    id: string,
    areaId: string,
  ) {
    setSelected(id);
    setTab("rooms");
    const unlocked = editContents && room?.id === areaId;
    if (room?.id !== areaId) setEditContents(false);
    startDrag(event, unlocked ? id : areaId, unlocked ? "content" : "room");
  }
  function markerProps(id: string, areaId: string) {
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `Select ${id}`,
      "data-device-id": id,
      "data-room-id": areaId,
      onKeyDown: (event: React.KeyboardEvent<SVGElement>) =>
        moveMarkerByKey(event, id, areaId),
      onPointerDown: (event: React.PointerEvent<SVGElement>) =>
        startMarkerDrag(event, id, areaId),
      onClick: () => {
        if (room?.id !== areaId) setEditContents(false);
        setSelected(id);
        setTab("rooms");
      },
    };
  }
  function assignReception(areaId: string) {
    const area = layout.rooms.find((item) => item.id === areaId);
    if (!area) return;
    const assigned = edit((draft) => {
      receptionRoom.current = areaId;
      Object.assign(draft.reception, availablePosition(draft, area));
    });
    if (!assigned) return;
    setSelected(areaId);
    setTab("rooms");
    setEditContents(false);
  }
  function assignContent(id: string, areaId: string) {
    if (id === layout.reception.id) {
      assignReception(areaId);
      return;
    }
    const area = layout.rooms.find((item) => item.id === areaId);
    if (!area) return;
    edit((draft) => {
      if (draft.devices.some((item) => item.id === id))
        reassignSensor(draft, id, areaId);
      else {
        gatewayRooms.current[id] = areaId;
        Object.assign(
          draft.gateways.find((item) => item.id === id)!,
          availablePosition(draft, area),
        );
      }
    });
    setEditContents(false);
  }
  function moveMarkerByKey(
    event: React.KeyboardEvent<SVGElement>,
    id: string,
    areaId: string,
    isRoom = false,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isRoom || room?.id !== areaId) setEditContents(false);
      setSelected(id);
      setTab("rooms");
      return;
    }
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!delta[event.key]) return;
    event.preventDefault();
    setSelected(id);
    setTab("rooms");
    edit((draft) => {
      const step = event.shiftKey ? 10 : 1;
      if (isRoom || !editContents) {
        const target = draft.rooms.find((item) => item.id === areaId)!;
        moveRoom(
          draft,
          areaId,
          {
            x: target.x + delta[event.key][0] * step,
            y: target.y + delta[event.key][1] * step,
          },
          gatewayRooms.current,
          receptionRoom.current,
        );
      } else {
        const item = [
          ...draft.devices,
          ...draft.gateways,
          draft.reception,
        ].find((item) => item.id === id)!;
        item.x += delta[event.key][0] * step;
        item.y += delta[event.key][1] * step;
      }
    });
  }
  async function simulate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${api}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
        signal: AbortSignal.timeout(20000),
      });
      const value = (await response.json()) as Result;
      if (!response.ok || value.status !== "ok")
        throw new Error(value.error?.message ?? `HTTP ${response.status}`);
      if (!value.summary)
        throw new Error("Network result missing. Rebuild the C++ simulator.");
      setResult(value);
      setNotice("Simulation complete · all metrics calculated by C++.");
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  }
  async function scenario(
    operation: "design" | "optimize" | "failure",
    backup = false,
  ) {
    setBusy(true);
    setError("");
    setNotice(
      operation === "design"
        ? "Local AI is interpreting your requirements; C++ will verify the design…"
        : operation === "optimize"
          ? "Evaluating placement proposals against actual C++ diagnostics…"
          : backup
            ? "Testing backup placement and reassociation with C++…"
            : "Disabling the gateway and recalculating every sensor…",
    );
    try {
      const id =
        layout.gateways.find((item) => item.id === failureId)?.id ??
        layout.gateways[0]?.id;
      const body =
        operation === "failure"
          ? { layout, gateway_id: id, add_backup: backup }
          : { layout, prompt };
      const response = await fetch(`${api}/api/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      });
      const value = (await response.json()) as ScenarioResult;
      if (!response.ok || value.status !== "ok")
        throw new Error(value.error?.message ?? `HTTP ${response.status}`);
      const nextResult = value.simulation ?? value.after;
      if (!nextResult)
        throw new Error("Simulation result missing from response");
      gatewayRooms.current = bindGateways(value.layout);
      receptionRoom.current = bindReception(value.layout);
      setEditContents(false);
      setLayout(value.layout);
      setResult(nextResult);
      setPlanner(value.planner);
      setPlanningOpen(false);
      setSelected(
        value.layout.gateways.find((item) => item.active)?.id ??
          value.layout.gateways[0]?.id ??
          "",
      );
      setTab("devices");
      setComparison(
        value.before && value.after
          ? {
              before: value.before,
              after: value.after,
              label:
                operation === "optimize"
                  ? "Placement optimization"
                  : backup
                    ? "Backup recovery"
                    : "Gateway failure",
              improved: value.improved,
            }
          : null,
      );
      setNotice(
        operation === "design"
          ? "Design placed and verified by C++."
          : operation === "optimize"
            ? value.improved
              ? "Verified improvement · compare the real runs below."
              : "No verified improvement found · previous placement retained."
            : backup
              ? value.recovered
                ? "Backup restored the original requirements."
                : "Backup tested · requirements still fail. Inspect sensor diagnostics."
              : "Gateway offline · failure impact calculated by C++.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
      setNotice("Request failed · previous deployment retained.");
    } finally {
      setBusy(false);
    }
  }
  async function importJson() {
    setBusy(true);
    setError("");
    try {
      const value = JSON.parse(jsonText) as Layout;
      if (
        value.schema_version !== "1.0" ||
        !Array.isArray(value.rooms) ||
        !Array.isArray(value.devices) ||
        !Array.isArray(value.gateways) ||
        !Array.isArray(value.walls) ||
        !value.floor ||
        !value.requirements ||
        !value.reception
      )
        throw new Error("Expected a complete schema 1.0 layout.");
      value.simulation ??= {
        metres_per_unit: 0.05,
        seed: 1337,
        packets_per_device: 200,
      };
      const response = await fetch(`${api}/api/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(20000),
      });
      let validated = (await response.json()) as Result;
      if (!response.ok || validated.status !== "ok")
        throw new Error(validated.error?.message ?? "Invalid layout");
      const bindings = bindGateways(value);
      const prepared = prepareLayout(value, bindings, bindReception(value));
      if (JSON.stringify(prepared) !== JSON.stringify(value)) {
        const adjusted = await fetch(`${api}/api/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prepared),
          signal: AbortSignal.timeout(20000),
        });
        validated = (await adjusted.json()) as Result;
        if (!adjusted.ok || validated.status !== "ok")
          throw new Error(
            validated.error?.message ?? "Invalid adjusted layout",
          );
      }
      load(prepared, bindings);
      setResult(validated);
      setShowJson(false);
      setNotice(
        "Imported layout · devices fitted to their areas and simulated.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid JSON");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="application">
      <header className="topbar">
        <a className="brand" href="/" aria-label="IoTForge home">
          <span className="brand-icon">
            <Box size={19} />
          </span>
          IoTForge
        </a>
        <span className="header-divider" />
        <span className="project-name">Hotel deployment</span>
        <ChevronRight size={14} className="muted" />
        <span className="floor-crumb">Ground floor</span>
        <span
          className={`health ${health === "C++ engine ready" ? "online" : ""}`}
        >
          <i />
          {health === "C++ engine ready" ? "Engine connected" : health}
        </span>
        <a
          className="docs-link"
          href={`${api}/api/docs`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open API documentation"
        >
          <Code2 size={16} />
        </a>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              <LayoutGrid size={13} /> DEPLOYMENT WORKSPACE
            </div>
            <h1>Floor plan</h1>
            <p>
              Place devices, evaluate coverage, and test gateway resilience.
            </p>
          </div>
          <div className="heading-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || dragging}
              onClick={() => load(copy(weakHotel) as Layout)}
            >
              Weak deployment
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reset hotel"
              title="Reset hotel"
              disabled={busy || dragging}
              onClick={() => load(copy(hotel) as Layout)}
            >
              <RotateCcw />
            </Button>
            <Dialog open={planningOpen} onOpenChange={setPlanningOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy || dragging}>
                  <WandSparkles />
                  Plan deployment
                </Button>
              </DialogTrigger>
              <DialogContent
                className="planning-dialog"
                showCloseButton={!busy}
                onEscapeKeyDown={(event) => {
                  if (busy) event.preventDefault();
                }}
                onInteractOutside={(event) => {
                  if (busy) event.preventDefault();
                }}
              >
                <DialogHeader>
                  <DialogTitle>Plan deployment</DialogTitle>
                  <DialogDescription>
                    Describe your monitoring needs. Review the proposed
                    placement and its simulation results.
                  </DialogDescription>
                </DialogHeader>
                <div className="ai-availability">
                  <i
                    className={
                      aiStatus.startsWith("Local AI")
                        ? "available-dot"
                        : "unavailable-dot"
                    }
                  />
                  {aiStatus.replace("Local AI · ", "Ollama · ")}
                </div>
                <label htmlFor="requirements-prompt">
                  Monitoring requirements
                  <textarea
                    id="requirements-prompt"
                    maxLength={4000}
                    disabled={busy || dragging}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                  />
                </label>
                <div className="planning-actions">
                  <Button
                    variant="outline"
                    disabled={
                      busy || !layout.gateways.some((item) => item.active)
                    }
                    onClick={() => void scenario("optimize")}
                  >
                    <ArrowUpRight />
                    Optimize placement
                  </Button>
                  <Button
                    disabled={busy || dragging || !prompt.trim()}
                    onClick={() => void scenario("design")}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                    {busy ? "Evaluating…" : "Generate design"}
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="dialog-error">
                    {error}
                  </p>
                )}
                <p className="dialog-footnote">
                  Proposals are checked by the simulator. Unavailable AI is
                  clearly identified as a rule-based fallback.
                </p>
              </DialogContent>
            </Dialog>
            <Button
              size="sm"
              onClick={() => void simulate()}
              disabled={busy || dragging}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Play />}
              {busy ? "Working…" : "Simulate network"}
            </Button>
          </div>
        </div>
        <div className="metrics" aria-label="Simulation metrics">
          <Metric
            title="Coverage"
            value={result ? percent(result.summary.coverage) : "—"}
            detail={
              result
                ? `${result.summary.reachable_devices} of ${result.summary.total_devices} sensors reachable`
                : "Awaiting simulation"
            }
          />
          <Metric
            title="Delivery reliability"
            value={result ? percent(result.summary.reliability) : "—"}
            detail={
              result
                ? `${result.summary.delivered_messages} / ${result.summary.generated_messages} messages delivered`
                : "Awaiting simulation"
            }
          />
          <Metric
            title="Worst latency"
            value={result ? latency(result.summary.worst_latency_ms) : "—"}
            detail={`Target ≤ ${layout.requirements.max_latency_ms} ms`}
          />
          <Metric
            title="Requirements"
            value={
              result
                ? result.requirements_evaluation.pass
                  ? "PASS"
                  : "FAIL"
                : "—"
            }
            detail={
              result
                ? result.requirements_evaluation.pass
                  ? "All requirements met"
                  : "Review sensor diagnostics"
                : "Awaiting simulation"
            }
            state={
              result
                ? result.requirements_evaluation.pass
                  ? "pass"
                  : "fail"
                : ""
            }
          />
        </div>
        {error && (
          <div className="error" role="alert">
            <X size={16} />
            <span>{error}</span>
          </div>
        )}
        {planner && (
          <details
            className={`planner-note ${planner.source === "deterministic_fallback" ? "fallback" : ""}`}
          >
            <summary>
              {planner.source === "ollama"
                ? `Ollama · ${planner.model}`
                : planner.source === "deterministic_fallback"
                  ? "Rule-based fallback · not AI"
                  : "Scenario evaluated"}
              <span>View details</span>
            </summary>
            <p>{planner.reasoning}</p>
            {planner.warning && <p>{planner.warning}</p>}
          </details>
        )}
        <div className="workspace">
          <section className="panel floor-panel">
            <div className="panel-heading">
              <div className="canvas-title">
                <LayoutGrid size={16} />
                <h2>Ground floor</h2>
                <span className="pill">
                  {layout.floor.width * layout.simulation.metres_per_unit} ×{" "}
                  {layout.floor.height * layout.simulation.metres_per_unit} m
                </span>
              </div>
              <label className="heatmap-toggle">
                <Switch
                  checked={showHeatmap}
                  onCheckedChange={setShowHeatmap}
                  aria-label="Signal heatmap"
                />
                Heatmap
              </label>
            </div>
            <div className="canvas-toolbar">
              <span>
                {layout.rooms.length} areas <b>·</b> {layout.devices.length}{" "}
                sensors <b>·</b> {layout.gateways.length}/2 gateways
              </span>
              <div className="canvas-add">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy || dragging}
                  onClick={addRoom}
                >
                  <Plus />
                  Area
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy || dragging || !layout.rooms.length}
                  onClick={() => addSensor("temperature_sensor")}
                >
                  <Plus />
                  Sensor
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={
                    busy || !layout.rooms.length || layout.gateways.length >= 2
                  }
                  onClick={addGateway}
                >
                  <Plus />
                  Gateway
                </Button>
              </div>
            </div>
            <svg
              ref={svg}
              className={`floor-plan ${showHeatmap && result ? "heatmap-visible" : ""}`}
              viewBox={`0 0 ${layout.floor.width} ${layout.floor.height}`}
              aria-label="Editable hotel floor plan"
              data-testid="floor-plan"
              onPointerMove={moveDrag}
              onPointerUp={(event) => {
                moveDrag(event);
                finishDrag(event);
              }}
              onPointerCancel={(event) => finishDrag(event, true)}
              onLostPointerCapture={(event) => finishDrag(event, true)}
            >
              <defs>
                <pattern
                  id="grid"
                  width="25"
                  height="25"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 25 0 L 0 0 0 25"
                    fill="none"
                    stroke="#e1e8ef"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect
                width={layout.floor.width}
                height={layout.floor.height}
                fill="#f7f9fc"
              />
              <rect
                width={layout.floor.width}
                height={layout.floor.height}
                fill="url(#grid)"
              />
              {showHeatmap && result?.heatmap && (
                <g aria-hidden="true" className="heatmap-cells">
                  {result.heatmap.cells.map((cell) => (
                    <rect
                      key={`${cell.x}-${cell.y}`}
                      x={cell.x}
                      y={cell.y}
                      width={result.heatmap!.cell_width}
                      height={result.heatmap!.cell_height}
                      fill={
                        cell.rssi_dbm === null
                          ? "#c8cdd6"
                          : cell.rssi_dbm < result.model.sensitivity_dbm
                            ? "#ee8c83"
                            : `hsl(${Math.max(30, Math.min(155, 30 + (cell.rssi_dbm - result.model.sensitivity_dbm) * 5))}, 55%, 66%)`
                      }
                      opacity=".4"
                    >
                      <title>
                        {cell.rssi_dbm === null
                          ? "No active gateway"
                          : `${cell.rssi_dbm.toFixed(1)} dBm · ${cell.reachable ? "reachable" : "below sensitivity"}`}
                      </title>
                    </rect>
                  ))}
                </g>
              )}
              {layout.rooms.map((item, index) => (
                <g
                  key={item.id}
                  className="room"
                  role="button"
                  tabIndex={0}
                  aria-label={`Select area ${item.name}`}
                  data-testid={`room-${item.id}`}
                  data-room-id={item.id}
                  data-x={item.x}
                  data-y={item.y}
                  data-width={item.width}
                  data-height={item.height}
                  onKeyDown={(event) =>
                    moveMarkerByKey(event, item.id, item.id, true)
                  }
                  onClick={() => selectRoom(item.id)}
                  onPointerDown={(event) => {
                    selectRoom(item.id);
                    startDrag(event, item.id, "room");
                  }}
                >
                  <defs>
                    <clipPath id={`room-clip-${index}`}>
                      <rect
                        x={item.x + 3}
                        y={item.y + 3}
                        width={Math.max(0, item.width - 6)}
                        height={Math.max(0, item.height - 6)}
                      />
                    </clipPath>
                  </defs>
                  <rect
                    x={item.x}
                    y={item.y}
                    width={item.width}
                    height={item.height}
                    rx="3"
                    className={`room-${item.type} ${room?.id === item.id ? "selected" : ""}`}
                  />
                  <g clipPath={`url(#room-clip-${index})`}>
                    <text
                      x={item.x + 13}
                      y={item.y + 26}
                      className="room-label"
                    >
                      {item.name}
                    </text>
                    <text x={item.x + 13} y={item.y + 43} className="room-kind">
                      {item.type === "room"
                        ? "GUEST ROOM"
                        : item.type.toUpperCase()}
                    </text>
                  </g>
                </g>
              ))}
              {result?.geometry.links.map((link) => {
                const source = layout.devices.find(
                  (item) => item.id === link.source,
                );
                const destination = layout.gateways.find(
                  (item) => item.id === link.destination,
                );
                const chosen =
                  result.devices.find((item) => item.device_id === link.source)
                    ?.gateway_id === link.destination;
                return source && destination ? (
                  <line
                    key={`${link.source}-${link.destination}`}
                    x1={source.x}
                    y1={source.y}
                    x2={destination.x}
                    y2={destination.y}
                    className={`network-link ${link.reachable ? (chosen ? "connected" : "standby") : "disconnected"}`}
                  >
                    <title>
                      {link.source} → {link.destination}:{" "}
                      {link.rssi_dbm.toFixed(1)} dBm, {link.walls_crossed} walls
                    </title>
                  </line>
                ) : null;
              })}
              {layout.walls.map((item) => (
                <line
                  key={item.id}
                  x1={item.x1}
                  y1={item.y1}
                  x2={item.x2}
                  y2={item.y2}
                  className={`wall ${selected === item.id ? "selected-wall" : ""}`}
                  onClick={() => {
                    setSelected(item.id);
                    setTab("walls");
                  }}
                >
                  <title>{item.material} wall</title>
                </line>
              ))}
              <g
                className={`reception marker ${editContents ? "unlocked" : "locked"}`}
                {...markerProps(layout.reception.id, receptionRoom.current)}
                data-x={layout.reception.x}
                data-y={layout.reception.y}
                transform={`translate(${layout.reception.x} ${layout.reception.y}) scale(${
                  markerSize(
                    layout.rooms.find(
                      (area) => area.id === receptionRoom.current,
                    ),
                    24,
                  ) / 24
                })`}
              >
                <rect x="-13" y="-13" width="26" height="26" rx="5" />
                <text y="4" textAnchor="middle">
                  R
                </text>
                <title>
                  Reception ·{" "}
                  {
                    layout.rooms.find(
                      (area) => area.id === receptionRoom.current,
                    )?.name
                  }
                </title>
              </g>
              {layout.devices.map((item) => (
                <g
                  key={item.id}
                  className={`marker ${editContents ? "unlocked" : "locked"}`}
                  {...markerProps(item.id, item.room_id)}
                  data-x={item.x}
                  data-y={item.y}
                  transform={`translate(${item.x} ${item.y}) scale(${
                    markerSize(
                      layout.rooms.find((area) => area.id === item.room_id),
                      24,
                    ) / 24
                  })`}
                >
                  <circle
                    r={selected === item.id ? 21 : 18}
                    className={`sensor ${item.type === "leak_sensor" ? "leak" : "temperature"} ${selected === item.id ? "selected-marker" : ""}`}
                  />
                  <text y="5" textAnchor="middle" className="marker-letter">
                    {item.type === "leak_sensor" ? "L" : "T"}
                  </text>
                  <title>
                    {item.id} ·{" "}
                    {
                      layout.rooms.find((area) => area.id === item.room_id)
                        ?.name
                    }
                  </title>
                </g>
              ))}
              {layout.gateways.map((item, index) => (
                <g
                  key={item.id}
                  className={`marker ${editContents ? "unlocked" : "locked"}`}
                  {...markerProps(item.id, gatewayRooms.current[item.id])}
                  data-x={item.x}
                  data-y={item.y}
                  transform={`translate(${item.x} ${item.y}) scale(${
                    markerSize(
                      layout.rooms.find(
                        (area) => area.id === gatewayRooms.current[item.id],
                      ),
                      24,
                    ) / 24
                  })`}
                >
                  <rect
                    x="-20"
                    y="-20"
                    width="40"
                    height="40"
                    rx="8"
                    className={`gateway ${!item.active ? "offline" : ""} ${selected === item.id ? "selected-marker" : ""}`}
                  />
                  <text y="5" textAnchor="middle" className="marker-letter">
                    G{index + 1}
                  </text>
                  <title>
                    {item.id} · {item.active ? "Online" : "Offline"}
                  </title>
                </g>
              ))}
            </svg>
            <div className="legend">
              <span>
                <i className="dot temperature" />
                Temperature
              </span>
              <span>
                <i className="dot leak" />
                Water leak
              </span>
              <span>
                <i className="dot gateway" />
                Gateway
              </span>
              <span>
                <i className="line connected" />
                Connected
              </span>
              <span>
                <i className="line disconnected" />
                Unavailable
              </span>
            </div>
            {result?.heatmap && showHeatmap && (
              <div className="heatmap-key">
                <span className="gradient" />
                <span>Below sensitivity → weak → strong</span>
                <span>
                  {result.heatmap.columns} × {result.heatmap.rows} C++ samples ·
                  cell centres
                </span>
              </div>
            )}
            <div className="notice" role="status">
              {notice}
            </div>
          </section>
          <aside className="panel inspector">
            <div className="panel-heading">
              <h2>Properties</h2>
              <SlidersHorizontal size={15} className="muted" />
            </div>
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as typeof tab)}
            >
              <TabsList className="inspector-tabs">
                {(["rooms", "devices", "walls", "settings"] as const).map(
                  (item) => (
                    <TabsTrigger key={item} value={item}>
                      {item}
                    </TabsTrigger>
                  ),
                )}
              </TabsList>
              <div className="placement-lock">
                <label>
                  <Switch
                    aria-label="Unlock individual placement"
                    disabled={busy || dragging}
                    checked={editContents}
                    onCheckedChange={setEditContents}
                  />
                  {editContents ? (
                    <UnlockKeyhole size={13} />
                  ) : (
                    <LockKeyhole size={13} />
                  )}
                  <span>
                    {editContents
                      ? "Individual placement unlocked"
                      : "Room contents locked"}
                  </span>
                </label>
              </div>
              <TabsContent value={tab}>
                <fieldset
                  disabled={busy || dragging}
                  className="inspector-content"
                >
                  {tab === "rooms" && (
                    <>
                      <div className="section-label">
                        AREAS{" "}
                        <Button variant="ghost" size="xs" onClick={addRoom}>
                          <Plus />
                          Add area
                        </Button>
                      </div>
                      <select
                        aria-label="Selected room"
                        value={room?.id ?? ""}
                        onChange={(event) => selectRoom(event.target.value)}
                      >
                        <option value="" disabled>
                          Select an area
                        </option>
                        {layout.rooms.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      {room && (
                        <>
                          <div className="fields">
                            <label>
                              Name
                              <input
                                aria-label="Room name"
                                value={room.name}
                                onChange={(event) =>
                                  updateRoom({ name: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Type
                              <select
                                aria-label="Room type"
                                value={room.type}
                                onChange={(event) =>
                                  updateRoom({
                                    type: event.target.value as RoomKind,
                                  })
                                }
                              >
                                {["room", "lobby", "bathroom", "reception"].map(
                                  (type) => (
                                    <option key={type}>{type}</option>
                                  ),
                                )}
                              </select>
                            </label>
                          </div>
                          <section
                            className="room-contents"
                            aria-label={`Contents of ${room.name}`}
                          >
                            <div className="section-label">
                              CONTENTS <span>{areaContents.length}</span>
                            </div>
                            <div className="contents-add">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => addSensor("temperature_sensor")}
                              >
                                <Thermometer />
                                Temperature
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => addSensor("leak_sensor")}
                              >
                                <Droplets />
                                Leak
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={layout.gateways.length >= 2}
                                onClick={addGateway}
                              >
                                <Wifi />
                                Gateway
                              </Button>
                            </div>
                            <div className="contents-list">
                              {areaContents.map((item) => (
                                <div
                                  key={item.id}
                                  className={`content-row ${selected === item.id ? "selected" : ""}`}
                                >
                                  <button
                                    className="content-select"
                                    aria-label={`Inspect ${item.id}`}
                                    onClick={() => {
                                      setSelected(item.id);
                                      setTab("rooms");
                                    }}
                                  >
                                    {item.kind === "gateway" ? (
                                      <Wifi size={14} />
                                    ) : item.kind === "reception" ? (
                                      <Box size={14} />
                                    ) : item.label.startsWith("Water") ? (
                                      <Droplets size={14} />
                                    ) : (
                                      <Thermometer size={14} />
                                    )}
                                    <span>
                                      <b>{item.label}</b>
                                      <small title={item.id}>{item.id}</small>
                                    </span>
                                  </button>
                                  {item.kind !== "reception" && (
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label={`Remove ${item.id}`}
                                      title="Remove from room"
                                      onClick={() => removeContent(item.id)}
                                    >
                                      <Trash2 />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                            {!areaContents.length && (
                              <p className="contents-empty">
                                No devices in this area. Add a sensor or gateway
                                above.
                              </p>
                            )}
                            {receptionRoom.current !== room.id && (
                              <Button
                                variant="ghost"
                                size="xs"
                                className="reception-action"
                                onClick={() => assignReception(room.id)}
                              >
                                Move reception here
                              </Button>
                            )}
                            {content && (
                              <div
                                className="content-detail"
                                aria-label={`Details of ${content.id}`}
                              >
                                <b>{content.label}</b>
                                <span className="content-position">
                                  Position: {content.x.toFixed(1)},{" "}
                                  {content.y.toFixed(1)}
                                </span>
                                <label>
                                  Assigned room
                                  <select
                                    aria-label="Content assigned room"
                                    value={room.id}
                                    onChange={(event) =>
                                      assignContent(
                                        content.id,
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {layout.rooms.map((item) => (
                                      <option key={item.id} value={item.id}>
                                        {item.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div className="fields">
                                  <NumberField
                                    label="Content x"
                                    disabled={!editContents}
                                    value={content.x}
                                    onChange={(value) =>
                                      edit((draft) => {
                                        Object.assign(
                                          [
                                            ...draft.devices,
                                            ...draft.gateways,
                                            draft.reception,
                                          ].find(
                                            (item) => item.id === content.id,
                                          )!,
                                          { x: value },
                                        );
                                      })
                                    }
                                  />
                                  <NumberField
                                    label="Content y"
                                    disabled={!editContents}
                                    value={content.y}
                                    onChange={(value) =>
                                      edit((draft) => {
                                        Object.assign(
                                          [
                                            ...draft.devices,
                                            ...draft.gateways,
                                            draft.reception,
                                          ].find(
                                            (item) => item.id === content.id,
                                          )!,
                                          { y: value },
                                        );
                                      })
                                    }
                                  />
                                </div>
                                {gateway && (
                                  <label className="toggle">
                                    <Switch
                                      aria-label="Selected gateway active"
                                      checked={gateway.active}
                                      onCheckedChange={(checked) =>
                                        edit((draft) => {
                                          draft.gateways.find(
                                            (item) => item.id === gateway.id,
                                          )!.active = checked;
                                        })
                                      }
                                    />
                                    Gateway active
                                  </label>
                                )}
                                {content.kind === "reception" && (
                                  <p className="help">
                                    One reception is required. Use Assigned room
                                    to move it to another area.
                                  </p>
                                )}
                              </div>
                            )}
                          </section>
                          <details className="room-dimensions">
                            <summary>Position &amp; size</summary>
                            <div className="fields">
                              {(["x", "y", "width", "height"] as const).map(
                                (key) => (
                                  <NumberField
                                    key={key}
                                    label={`Room ${key}`}
                                    value={room[key]}
                                    min={
                                      key === "width" || key === "height"
                                        ? 1
                                        : 0
                                    }
                                    onChange={(value) =>
                                      updateRoom({ [key]: value })
                                    }
                                  />
                                ),
                              )}
                            </div>
                          </details>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="remove-button"
                            disabled={layout.rooms.length <= 1}
                            onClick={() => removeSelected(room.id)}
                          >
                            Remove area &amp; its devices
                          </Button>
                        </>
                      )}
                      <p className="help">
                        Drag a room or its locked contents to move the whole
                        area. Neighbours adjust automatically. Unlock individual
                        placement to reposition a device inside its room.
                      </p>
                    </>
                  )}
                  {tab === "devices" && (
                    <>
                      <div className="section-label">
                        SENSORS & GATEWAYS{" "}
                        <span>
                          {layout.devices.length + layout.gateways.length}
                        </span>
                      </div>
                      <select
                        aria-label="Selected device"
                        value={device?.id ?? gateway?.id ?? ""}
                        onChange={(event) => setSelected(event.target.value)}
                      >
                        <option value="" disabled>
                          Select a device
                        </option>
                        {[...layout.devices, ...layout.gateways].map((item) => (
                          <option key={item.id}>{item.id}</option>
                        ))}
                      </select>
                      <div className="button-row">
                        <button
                          className="button subtle"
                          onClick={() => addSensor("temperature_sensor")}
                        >
                          ＋ Temp
                        </button>
                        <button
                          className="button subtle"
                          onClick={() => addSensor("leak_sensor")}
                        >
                          ＋ Leak
                        </button>
                        <button
                          className="button subtle"
                          disabled={layout.gateways.length >= 2}
                          onClick={addGateway}
                        >
                          ＋ Gateway
                        </button>
                      </div>
                      {(device || gateway) && (
                        <>
                          <div className="fields">
                            <NumberField
                              label="Device x"
                              disabled={!editContents}
                              value={(device ?? gateway)!.x}
                              onChange={(value) =>
                                edit((draft) => {
                                  Object.assign(
                                    [...draft.devices, ...draft.gateways].find(
                                      (item) => item.id === selected,
                                    )!,
                                    { x: value },
                                  );
                                })
                              }
                            />
                            <NumberField
                              label="Device y"
                              disabled={!editContents}
                              value={(device ?? gateway)!.y}
                              onChange={(value) =>
                                edit((draft) => {
                                  Object.assign(
                                    [...draft.devices, ...draft.gateways].find(
                                      (item) => item.id === selected,
                                    )!,
                                    { y: value },
                                  );
                                })
                              }
                            />
                          </div>
                          {device && (
                            <label>
                              Assigned room
                              <select
                                value={device.room_id}
                                onChange={(event) =>
                                  assignContent(selected, event.target.value)
                                }
                              >
                                {layout.rooms.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {gateway && (
                            <>
                              <label>
                                Assigned room
                                <select
                                  value={gatewayRooms.current[gateway.id] ?? ""}
                                  onChange={(event) =>
                                    assignContent(selected, event.target.value)
                                  }
                                >
                                  {layout.rooms.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="toggle">
                                <Switch
                                  checked={gateway.active}
                                  onCheckedChange={(checked) =>
                                    edit((draft) => {
                                      draft.gateways.find(
                                        (item) => item.id === selected,
                                      )!.active = checked;
                                    })
                                  }
                                />
                                Gateway active
                              </label>
                            </>
                          )}
                          <button
                            className="text-button danger"
                            onClick={() => removeSelected()}
                          >
                            Remove device
                          </button>
                        </>
                      )}
                      <p className="help">
                        Drag a marker or use arrow keys (Shift for 10 units).
                        Devices stay in their assigned area. Use Assigned room
                        to move them elsewhere.
                      </p>
                    </>
                  )}
                  {tab === "walls" && (
                    <>
                      <div className="section-label">
                        WALL SEGMENTS{" "}
                        <button
                          onClick={() => {
                            const next: Wall = {
                              id: uid("wall"),
                              x1: 640,
                              y1: 0,
                              x2: 640,
                              y2: 600,
                              material: "concrete",
                            };
                            edit((draft) => {
                              draft.walls.push(next);
                            });
                            setSelected(next.id);
                          }}
                        >
                          ＋ Add
                        </button>
                      </div>
                      <select
                        aria-label="Selected wall"
                        value={wall?.id ?? ""}
                        onChange={(event) => setSelected(event.target.value)}
                      >
                        <option value="" disabled>
                          Select a wall
                        </option>
                        {layout.walls.map((item) => (
                          <option key={item.id}>{item.id}</option>
                        ))}
                      </select>
                      {wall && (
                        <>
                          <label>
                            Material
                            <select
                              value={wall.material}
                              onChange={(event) =>
                                edit((draft) => {
                                  draft.walls.find(
                                    (item) => item.id === selected,
                                  )!.material = event.target
                                    .value as Wall["material"];
                                })
                              }
                            >
                              {["drywall", "wood", "concrete", "metal"].map(
                                (item) => (
                                  <option key={item}>{item}</option>
                                ),
                              )}
                            </select>
                          </label>
                          <div className="fields">
                            {(["x1", "y1", "x2", "y2"] as const).map((key) => (
                              <NumberField
                                key={key}
                                label={`Wall ${key}`}
                                value={wall[key]}
                                onChange={(value) =>
                                  edit((draft) => {
                                    draft.walls.find(
                                      (item) => item.id === selected,
                                    )![key] = value;
                                  })
                                }
                              />
                            ))}
                          </div>
                          <button
                            className="text-button danger"
                            onClick={() => removeSelected()}
                          >
                            Remove wall
                          </button>
                        </>
                      )}
                      <p className="help">
                        Assumed losses: drywall 3 dB, wood 5 dB, concrete 12 dB,
                        metal 20 dB. Only interior crossings count.
                      </p>
                    </>
                  )}
                  {tab === "settings" && (
                    <>
                      <div className="section-label">REQUIREMENTS</div>
                      <NumberField
                        label="Coverage required (0–1)"
                        value={layout.requirements.coverage_required}
                        step={0.01}
                        min={0}
                        max={1}
                        onChange={(value) =>
                          edit((draft) => {
                            draft.requirements.coverage_required = value;
                          })
                        }
                      />
                      <NumberField
                        label="Minimum reliability (0–1)"
                        value={layout.requirements.min_reliability}
                        step={0.01}
                        min={0}
                        max={1}
                        onChange={(value) =>
                          edit((draft) => {
                            draft.requirements.min_reliability = value;
                          })
                        }
                      />
                      <NumberField
                        label="Maximum latency (ms)"
                        value={layout.requirements.max_latency_ms}
                        min={0}
                        onChange={(value) =>
                          edit((draft) => {
                            draft.requirements.max_latency_ms = value;
                          })
                        }
                      />
                      <div className="section-label">MODEL & RECEPTION</div>
                      <NumberField
                        label="Metres per logical unit"
                        value={layout.simulation.metres_per_unit}
                        min={0.001}
                        step={0.01}
                        onChange={(value) =>
                          edit((draft) => {
                            draft.simulation.metres_per_unit = value;
                          })
                        }
                      />
                      <NumberField
                        label="Random seed"
                        value={layout.simulation.seed}
                        min={0}
                        onChange={(value) =>
                          edit((draft) => {
                            draft.simulation.seed = value;
                          })
                        }
                      />
                      <div className="fields">
                        <NumberField
                          label="Reception x"
                          disabled={!editContents}
                          value={layout.reception.x}
                          onChange={(value) =>
                            edit((draft) => {
                              draft.reception.x = value;
                            })
                          }
                        />
                        <NumberField
                          label="Reception y"
                          disabled={!editContents}
                          value={layout.reception.y}
                          onChange={(value) =>
                            edit((draft) => {
                              draft.reception.y = value;
                            })
                          }
                        />
                      </div>
                      <p className="help">
                        Approximate log-distance loss, seeded packet trials, and
                        a fixed wired reception backhaul. No real-world radio
                        measurements.
                      </p>
                    </>
                  )}
                </fieldset>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
        <section className="panel resilience-panel">
          <div className="resilience-title">
            <Wifi size={19} />
            <div>
              <h2>Gateway resilience</h2>
              <p>Test an outage, then evaluate backup recovery.</p>
            </div>
          </div>
          <div className="resilience-controls">
            <select
              aria-label="Gateway to fail"
              disabled={busy || dragging}
              value={selectedFailureId}
              onChange={(event) => setFailureId(event.target.value)}
            >
              {layout.gateways.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} · {item.active ? "online" : "offline"}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="fail-button"
              disabled={
                busy ||
                !layout.gateways.find(
                  (item) => item.id === selectedFailureId && item.active,
                )
              }
              onClick={() => void scenario("failure")}
            >
              Disable gateway
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                layout.gateways.length >= 2 ||
                !layout.gateways.some((item) => !item.active)
              }
              onClick={() => void scenario("failure", true)}
            >
              <Plus />
              Test backup recovery
            </Button>
          </div>
        </section>
        {comparison && (
          <section className="panel comparison">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">TWO REAL SIMULATION RUNS</span>
                <h2>{comparison.label}</h2>
              </div>
              {comparison.improved !== undefined && (
                <span className="pill">
                  {comparison.improved
                    ? "VERIFIED IMPROVEMENT"
                    : "NO IMPROVEMENT"}
                </span>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Coverage</th>
                    <th>Reliability</th>
                    <th>Worst latency</th>
                    <th>Requirements</th>
                  </tr>
                </thead>
                <tbody>
                  {(["before", "after"] as const).map((key) => (
                    <tr key={key}>
                      <td>
                        <b>{key === "before" ? "Before" : "After"}</b>
                      </td>
                      <td>{percent(comparison[key].summary.coverage)}</td>
                      <td>{percent(comparison[key].summary.reliability)}</td>
                      <td>
                        {latency(comparison[key].summary.worst_latency_ms)}
                      </td>
                      <td
                        className={
                          comparison[key].requirements_evaluation.pass
                            ? "status-pass"
                            : "status-fail"
                        }
                      >
                        {comparison[key].requirements_evaluation.pass
                          ? "PASS"
                          : "FAIL"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className="panel result-panel">
          <div className="panel-heading">
            <div className="canvas-title">
              <Activity size={16} />
              <h2>Sensor results</h2>
            </div>
            <span className="pill">
              {result
                ? `${result.devices.length} sensors evaluated`
                : "No run yet"}
            </span>
          </div>
          {!result ? (
            <div className="empty">
              <Activity size={26} />
              <h3>No simulation results</h3>
              <p>
                Run the current floor plan to evaluate signal, delivery, and
                latency.
              </p>
            </div>
          ) : (
            <>
              <div className="checks">
                {Object.entries(result.requirements_evaluation.checks).map(
                  ([name, passed]) => (
                    <span key={name} className={passed ? "pass" : "fail"}>
                      {passed ? <Check size={12} /> : <X size={12} />}{" "}
                      {name.replaceAll("_", " ")}
                    </span>
                  ),
                )}
              </div>
              {result.requirements_evaluation.diagnostics.length > 0 && (
                <div className="diagnostics">
                  {result.requirements_evaluation.diagnostics.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Sensor</th>
                      <th>Selected gateway</th>
                      <th>Signal</th>
                      <th>Delivery</th>
                      <th>Reliability</th>
                      <th>Worst latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.devices.map((item) => (
                      <tr key={item.device_id}>
                        <td>
                          <b>{item.device_id}</b>
                          <small>
                            {
                              layout.rooms.find(
                                (area) =>
                                  area.id ===
                                  layout.devices.find(
                                    (sensor) => sensor.id === item.device_id,
                                  )?.room_id,
                              )?.name
                            }
                          </small>
                        </td>
                        <td>{item.gateway_id ?? "No reachable gateway"}</td>
                        <td>
                          {item.rssi_dbm === null
                            ? "—"
                            : `${item.rssi_dbm.toFixed(1)} dBm`}
                        </td>
                        <td>
                          {item.delivered_messages} / {item.generated_messages}
                        </td>
                        <td>{percent(item.reliability)}</td>
                        <td>{latency(item.worst_latency_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="geometry-detail">
                <summary>
                  Inspect all {result.geometry.links.length} device-to-gateway
                  links
                </summary>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Link</th>
                        <th>Distance</th>
                        <th>Walls</th>
                        <th>Wall loss</th>
                        <th>RSSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.geometry.links.map((item) => (
                        <tr key={`${item.source}-${item.destination}`}>
                          <td>
                            {item.source} → {item.destination}
                          </td>
                          <td>{item.distance_metres.toFixed(2)} m</td>
                          <td>{item.walls_crossed}</td>
                          <td>{item.wall_attenuation_db} dB</td>
                          <td>{item.rssi_dbm.toFixed(1)} dBm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </section>
        <section className="json-controls">
          <Dialog open={showJson} onOpenChange={setShowJson}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setJsonText(JSON.stringify(layout, null, 2))}
              >
                <Code2 />
                Import / export JSON
              </Button>
            </DialogTrigger>
            <DialogContent className="json-dialog">
              <DialogHeader>
                <DialogTitle>Layout JSON</DialogTitle>
                <DialogDescription>
                  Schema 1.0. Import a layout or copy the current deployment.
                </DialogDescription>
              </DialogHeader>
              <textarea
                aria-label="Layout JSON"
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
              />
              <div className="planning-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(layout, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = "iotforge-layout.json";
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download />
                  Download layout
                </Button>
                <Button
                  disabled={busy || dragging}
                  onClick={() => void importJson()}
                >
                  Validate & load JSON
                </Button>
              </div>
              {error && (
                <p role="alert" className="dialog-error">
                  {error}
                </p>
              )}
            </DialogContent>
          </Dialog>
          <a href={`${api}/api/docs`} target="_blank" rel="noreferrer">
            <CircleHelp size={14} />
            API reference
          </a>
        </section>
        <footer>
          <span>
            <b>IoTForge</b> · Indoor network planning
          </span>
          <span>
            Approximate planning model. Confirm results with a real site survey.
          </span>
        </footer>
      </main>
    </div>
  );
}

function Metric({
  title,
  value,
  detail,
  state = "",
}: {
  title: string;
  value: string;
  detail: string;
  state?: string;
}) {
  return (
    <article className={`metric ${state}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        disabled={disabled}
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(next))
            onChange(
              Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next)),
            );
        }}
      />
    </label>
  );
}
