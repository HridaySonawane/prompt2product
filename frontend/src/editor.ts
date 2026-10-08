import type { Layout, Room } from "./models";
import { reflowRooms } from "./room_layout";

export type Point = { x: number; y: number };
export type GatewayRooms = Record<string, string>;
export const MARKER_INSET = 24;
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
export const roomCenter = (room: Room): Point => ({
  x: room.x + room.width / 2,
  y: room.y + room.height / 2,
});

export function bindReception(layout: Layout): string {
  const contains = (room: Room) =>
    layout.reception.x >= room.x &&
    layout.reception.x <= room.x + room.width &&
    layout.reception.y >= room.y &&
    layout.reception.y <= room.y + room.height;
  return (
    (
      layout.rooms.find(
        (room) => room.type === "reception" && contains(room),
      ) ??
      layout.rooms.find(contains) ??
      layout.rooms.find((room) => room.type === "reception") ??
      nearestRoom(layout.reception, layout.rooms)
    )?.id ?? ""
  );
}

// Keep the entire marker inside the area, including its selection outline.
// Small imported rooms use their centre and a correspondingly smaller SVG marker.
export function clampToRoom(point: Point, room: Room): Point {
  const dx = Math.min(MARKER_INSET, room.width / 2);
  const dy = Math.min(MARKER_INSET, room.height / 2);
  return {
    x: clamp(point.x, room.x + dx, room.x + room.width - dx),
    y: clamp(point.y, room.y + dy, room.y + room.height - dy),
  };
}

export function nearestRoom(point: Point, rooms: Room[]): Room | undefined {
  return rooms.reduce<Room | undefined>((best, room) => {
    const distance = (r: Room) =>
      Math.hypot(
        point.x - clamp(point.x, r.x, r.x + r.width),
        point.y - clamp(point.y, r.y, r.y + r.height),
      );
    return !best || distance(room) < distance(best) ? room : best;
  }, undefined);
}

// Gateway room bindings are editor state, never extra fields in schema 1.0.
export function bindGateways(layout: Layout): GatewayRooms {
  return Object.fromEntries(
    layout.gateways.flatMap((gateway) => {
      // Prefer an area that already fits the full marker (important when areas
      // overlap); loading a verified proposal must not move it a second time.
      const room =
        layout.rooms.find((item) => {
          const fitted = clampToRoom(gateway, item);
          return fitted.x === gateway.x && fitted.y === gateway.y;
        }) ?? nearestRoom(gateway, layout.rooms);
      return room ? [[gateway.id, room.id]] : [];
    }),
  );
}

export function constrainLayout(
  layout: Layout,
  bindings: GatewayRooms,
  receptionRoomId = bindReception(layout),
): Layout {
  for (const sensor of layout.devices) {
    const room = layout.rooms.find((item) => item.id === sensor.room_id);
    if (!room)
      throw new Error(`Sensor ${sensor.id} needs an existing assigned room.`);
    Object.assign(sensor, clampToRoom(sensor, room));
  }
  for (const gateway of layout.gateways) {
    const room = layout.rooms.find((item) => item.id === bindings[gateway.id]);
    if (!room)
      throw new Error(`Gateway ${gateway.id} needs an existing assigned area.`);
    Object.assign(gateway, clampToRoom(gateway, room));
  }
  const receptionRoom = layout.rooms.find(
    (room) => room.id === receptionRoomId,
  );
  if (!receptionRoom)
    throw new Error("Reception needs an existing assigned area.");
  Object.assign(layout.reception, clampToRoom(layout.reception, receptionRoom));
  return layout;
}

export function moveRoom(
  layout: Layout,
  id: string,
  patch: Partial<Room>,
  bindings: GatewayRooms,
  receptionRoomId = bindReception(layout),
): void {
  const candidate = structuredClone(layout);
  const oldRooms = layout.rooms;
  const room = candidate.rooms.find((item) => item.id === id);
  if (!room) return;
  const old = { ...room };
  Object.assign(room, patch);
  // Moving an area against a floor boundary must not silently shrink it.
  room.width = clamp(
    room.width,
    Math.min(1, old.width, layout.floor.width),
    layout.floor.width,
  );
  room.height = clamp(
    room.height,
    Math.min(1, old.height, layout.floor.height),
    layout.floor.height,
  );
  room.x = clamp(room.x, 0, layout.floor.width - room.width);
  room.y = clamp(room.y, 0, layout.floor.height - room.height);
  candidate.rooms = reflowRooms(candidate, id);
  carryContents(candidate, oldRooms, bindings, receptionRoomId);
  constrainLayout(candidate, bindings, receptionRoomId);
  Object.assign(layout, candidate);
}

function carryContents(
  layout: Layout,
  oldRooms: Room[],
  bindings: GatewayRooms,
  receptionRoomId: string,
) {
  const occupants = [
    ...layout.devices.map((item) => ({ item, roomId: item.room_id })),
    ...layout.gateways.map((item) => ({ item, roomId: bindings[item.id] })),
    { item: layout.reception, roomId: receptionRoomId },
  ];
  for (const { item, roomId } of occupants) {
    const old = oldRooms.find((room) => room.id === roomId),
      room = layout.rooms.find((room) => room.id === roomId);
    if (!old || !room) continue;
    Object.assign(
      item,
      clampToRoom(
        {
          x: room.x + ((item.x - old.x) / old.width) * room.width,
          y: room.y + ((item.y - old.y) / old.height) * room.height,
        },
        room,
      ),
    );
  }
}

export function prepareLayout(
  layout: Layout,
  bindings: GatewayRooms,
  receptionRoomId: string,
): Layout {
  const candidate = structuredClone(layout);
  const original = candidate.rooms;
  candidate.rooms = reflowRooms(candidate);
  carryContents(candidate, original, bindings, receptionRoomId);
  return constrainLayout(candidate, bindings, receptionRoomId);
}

export function removeArea(
  layout: Layout,
  id: string,
  bindings: GatewayRooms,
  receptionRoomId: string,
): string {
  if (layout.rooms.length <= 1)
    throw new Error(
      "Keep at least one area for reception. You can remove its sensors and gateways.",
    );
  layout.rooms = layout.rooms.filter((room) => room.id !== id);
  layout.devices = layout.devices.filter((sensor) => sensor.room_id !== id);
  layout.gateways = layout.gateways.filter(
    (gateway) => bindings[gateway.id] !== id,
  );
  if (receptionRoomId === id) {
    const replacement =
      layout.rooms.find((room) => room.type === "reception") ?? layout.rooms[0];
    receptionRoomId = replacement.id;
    Object.assign(layout.reception, roomCenter(replacement));
  }
  return receptionRoomId;
}

export function reassignSensor(
  layout: Layout,
  id: string,
  roomId: string,
): void {
  const sensor = layout.devices.find((item) => item.id === id);
  const room = layout.rooms.find((item) => item.id === roomId);
  if (sensor && room)
    Object.assign(sensor, roomCenter(room), { room_id: room.id });
}

export function markerSize(room: Room | undefined, maximum: number): number {
  return room
    ? Math.max(0, Math.min(maximum, Math.min(room.width, room.height) / 2))
    : maximum;
}

export function availablePosition(layout: Layout, room: Room): Point {
  const candidates = [roomCenter(room)];
  for (const y of [0.25, 0.75, 0.5])
    for (const x of [0.25, 0.75, 0.5])
      candidates.push(
        clampToRoom(
          { x: room.x + room.width * x, y: room.y + room.height * y },
          room,
        ),
      );
  const occupants = [...layout.devices, ...layout.gateways];
  const clearance = (point: Point) =>
    Math.min(
      Infinity,
      ...occupants.map((item) =>
        Math.hypot(item.x - point.x, item.y - point.y),
      ),
    );
  // Prefer a clear spot; for a crowded/tiny area keep placement inside rather
  // than overflowing into a neighbouring room to manufacture space.
  return (
    candidates.find((point) => clearance(point) >= 48) ??
    candidates.reduce((best, point) =>
      clearance(point) > clearance(best) ? point : best,
    )
  );
}
