import type { Layout, Room } from "./models";

export const ROOM_GAP = 8;
const EPSILON = 1e-7;

export function roomsOverlap(a: Room, b: Room, gap = ROOM_GAP): boolean {
  return (
    a.x < b.x + b.width + gap - EPSILON &&
    a.x + a.width + gap > b.x + EPSILON &&
    a.y < b.y + b.height + gap - EPSILON &&
    a.y + a.height + gap > b.y + EPSILON
  );
}

/** Bounded deterministic packing: keep the dragged area fixed, preserve other
 * positions where possible, then try nearby obstacle edges. Backtracking allows
 * a chain of neighbours to move. Failure is transactional; never shrink rooms
 * or leave an overlapping intermediate layout visible. */
export function reflowRooms(layout: Layout, preferredId?: string): Room[] {
  const { width, height } = layout.floor;
  const original = layout.rooms.map((room) => ({ ...room }));
  if (!original.length)
    throw new Error("Keep at least one area for reception.");
  if (
    original.some(
      (room) =>
        ![room.x, room.y, room.width, room.height].every(Number.isFinite) ||
        room.width <= 0 ||
        room.height <= 0 ||
        room.width > width ||
        room.height > height,
    ) ||
    original.reduce((sum, room) => sum + room.width * room.height, 0) >
      width * height + EPSILON
  )
    throw new Error(
      "These area sizes cannot fit on this floor. Reduce a size or remove an area.",
    );
  const anchor =
    original.find((room) => room.id === preferredId) ?? original[0];
  const bounded = (room: Room) => ({
    ...room,
    x: Math.max(0, Math.min(width - room.width, room.x)),
    y: Math.max(0, Math.min(height - room.height, room.y)),
  });
  const fixed = bounded(anchor);
  if (
    original.every(
      (room) =>
        room.x >= 0 &&
        room.y >= 0 &&
        room.x + room.width <= width &&
        room.y + room.height <= height,
    ) &&
    original.every((room, index) =>
      original.slice(index + 1).every((other) => !roomsOverlap(room, other)),
    )
  )
    return original;
  const remaining = original
    .filter((room) => room.id !== anchor.id)
    .sort(
      (a, b) =>
        Number(roomsOverlap(a, fixed)) - Number(roomsOverlap(b, fixed)) ||
        Math.hypot(a.x - fixed.x, a.y - fixed.y) -
          Math.hypot(b.x - fixed.x, b.y - fixed.y) ||
        a.id.localeCompare(b.id),
    );
  const placed: Room[] = [fixed];
  let attempts = 0;
  function pack(index: number): boolean {
    if (index === remaining.length) return true;
    if (++attempts > 600) return false;
    const room = remaining[index];
    const xs = new Set([
      Math.max(0, Math.min(width - room.width, room.x)),
      0,
      width - room.width,
    ]);
    const ys = new Set([
      Math.max(0, Math.min(height - room.height, room.y)),
      0,
      height - room.height,
    ]);
    for (const obstacle of placed) {
      xs.add(obstacle.x + obstacle.width + ROOM_GAP);
      xs.add(obstacle.x - room.width - ROOM_GAP);
      ys.add(obstacle.y + obstacle.height + ROOM_GAP);
      ys.add(obstacle.y - room.height - ROOM_GAP);
    }
    const candidates: Room[] = [];
    for (const x of xs)
      for (const y of ys) {
        if (
          x < -EPSILON ||
          y < -EPSILON ||
          x + room.width > width + EPSILON ||
          y + room.height > height + EPSILON
        )
          continue;
        const candidate = {
          ...room,
          x: Math.max(0, Math.min(width - room.width, x)),
          y: Math.max(0, Math.min(height - room.height, y)),
        };
        if (placed.every((other) => !roomsOverlap(candidate, other)))
          candidates.push(candidate);
      }
    candidates.sort(
      (a, b) =>
        (a.x - room.x) ** 2 +
          (a.y - room.y) ** 2 -
          (b.x - room.x) ** 2 -
          (b.y - room.y) ** 2 ||
        a.y - b.y ||
        a.x - b.x,
    );
    for (const candidate of candidates.slice(0, 24)) {
      placed.push(candidate);
      if (pack(index + 1)) return true;
      placed.pop();
      if (attempts > 600) break;
    }
    return false;
  }
  if (!pack(0))
    throw new Error(
      "No collision-free arrangement found here. Try another position or a smaller area.",
    );
  return original.map(
    (room) => placed.find((candidate) => candidate.id === room.id)!,
  );
}

export function clientToFloor(
  point: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  floor: Layout["floor"],
) {
  const scale = Math.min(box.width / floor.width, box.height / floor.height);
  if (!(scale > 0)) throw new Error("Floor plan is not visible yet.");
  return {
    x: (point.x - box.left - (box.width - floor.width * scale) / 2) / scale,
    y: (point.y - box.top - (box.height - floor.height * scale) / 2) / scale,
  };
}
