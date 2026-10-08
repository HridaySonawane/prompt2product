export type RoomKind = "room" | "lobby" | "bathroom" | "reception";
export type Room = { id: string; name: string; type: RoomKind; x: number; y: number; width: number; height: number };
export type Sensor = { id: string; type: "temperature_sensor" | "leak_sensor"; x: number; y: number; room_id: string };
export type Gateway = { id: string; x: number; y: number; active: boolean };
export type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; material: "drywall" | "wood" | "concrete" | "metal" };
export type Layout = {
  schema_version: string; floor: { width: number; height: number }; rooms: Room[];
  devices: Sensor[]; gateways: Gateway[]; walls: Wall[];
  reception: { id: string; x: number; y: number };
  requirements: { coverage_required: number; max_latency_ms: number; min_reliability: number };
  simulation: { metres_per_unit: number; seed: number; packets_per_device: number };
};
export type Link = { source: string; destination: string; distance: number; walls_crossed: number; wall_attenuation_db: number; distance_metres: number; rssi_dbm: number; reachable: boolean; gateway_active: boolean };
export type Summary = { coverage: number; reliability: number; total_devices: number; reachable_devices: number; generated_messages: number; delivered_messages: number; lost_messages: number; average_latency_ms: number | null; worst_latency_ms: number | null };
export type Result = {
  status: string; schema_version: string; geometry: { links: Link[] }; summary: Summary;
  devices: { device_id: string; gateway_id: string | null; reachable: boolean; rssi_dbm: number | null; delivered_messages: number; generated_messages: number; reliability: number; worst_latency_ms: number | null }[];
  requirements_evaluation: { pass: boolean; checks: Record<string, boolean>; diagnostics: string[] };
  error?: { code: string; message: string };
  model: { sensitivity_dbm: number };
  heatmap?: { columns: number; rows: number; cell_width: number; cell_height: number; width: number; height: number; cells: { x: number; y: number; rssi_dbm: number | null; reachable: boolean; gateway_id: string | null }[] };
};
export type Planner = { source: string; model?: string | null; reasoning: string; warning?: string | null };
export type ScenarioResult = { status: string; layout: Layout; simulation?: Result; before?: Result; after?: Result; improved?: boolean; recovered?: boolean; planner: Planner; design_request?: { mode: "new_layout" | "existing_layout"; requested_counts: Partial<Record<RoomKind | "gateways", number>>; actual_counts: Record<RoomKind | "gateways", number>; matched: boolean }; error?: { code: string; message: string } };
