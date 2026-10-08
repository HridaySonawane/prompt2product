import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Layout } from "../src/models";
import {
  bindGateways,
  bindReception,
  moveRoom,
  prepareLayout,
  removeArea,
  constrainLayout,
} from "../src/editor";
import {
  clientToFloor,
  reflowRooms,
  roomsOverlap,
  ROOM_GAP,
} from "../src/room_layout";

const hotel = (): Layout =>
  JSON.parse(
    readFileSync(
      new URL("../../shared/fixtures/network-hotel.json", import.meta.url),
      "utf8",
    ),
  );
function assertValid(
  layout: Layout,
  bindings = bindGateways(layout),
  receptionId = bindReception(layout),
) {
  for (const room of layout.rooms) {
    assert.ok(
      room.x >= 0 &&
        room.y >= 0 &&
        room.x + room.width <= layout.floor.width + 1e-7 &&
        room.y + room.height <= layout.floor.height + 1e-7,
    );
    assert.ok(room.width > 0 && room.height > 0);
  }
  for (let i = 0; i < layout.rooms.length; i++)
    for (let j = i + 1; j < layout.rooms.length; j++)
      assert.ok(
        !roomsOverlap(layout.rooms[i], layout.rooms[j]),
        `${layout.rooms[i].id} overlaps ${layout.rooms[j].id}`,
      );
  for (const item of [
    ...layout.devices.map((item) => ({ ...item, area: item.room_id })),
    ...layout.gateways.map((item) => ({ ...item, area: bindings[item.id] })),
    { ...layout.reception, area: receptionId },
  ]) {
    const room = layout.rooms.find((room) => room.id === item.area)!;
    assert.ok(
      room &&
        item.x >= room.x &&
        item.x <= room.x + room.width + 1e-7 &&
        item.y >= room.y &&
        item.y <= room.y + room.height + 1e-7,
      `${item.id} escaped its area`,
    );
  }
}

test("room collision adjusts neighbours and carries every area's contents", () => {
  const layout = hotel(),
    before = structuredClone(layout),
    bindings = bindGateways(layout),
    receptionId = bindReception(layout);
  moveRoom(layout, "room_101", { x: 250, y: 50 }, bindings, receptionId);
  assert.equal(layout.rooms[0].x, 250);
  assert.notDeepEqual(layout.rooms[1], before.rooms[1]);
  for (const sensor of layout.devices) {
    const previous = before.devices.find((item) => item.id === sensor.id)!;
    const oldRoom = before.rooms.find((item) => item.id === sensor.room_id)!,
      newRoom = layout.rooms.find((item) => item.id === sensor.room_id)!;
    assert.equal(sensor.room_id, previous.room_id);
    assert.equal(sensor.x - previous.x, newRoom.x - oldRoom.x);
    assert.equal(sensor.y - previous.y, newRoom.y - oldRoom.y);
  }
  assertValid(layout, bindings, receptionId);
});
test("colliding with lobby or reception preserves gateway/reception ownership", () => {
  for (const id of ["lobby", "reception_room"]) {
    const layout = hotel(),
      bindings = bindGateways(layout),
      receptionId = bindReception(layout),
      target = layout.rooms.find((room) => room.id === id)!;
    moveRoom(
      layout,
      "room_101",
      { x: target.x, y: target.y, width: target.width, height: target.height },
      bindings,
      receptionId,
    );
    assert.equal(bindings.gateway_1, "lobby");
    assert.equal(receptionId, "reception_room");
    assertValid(layout, bindings, receptionId);
  }
});
test("bounded reflow handles repeated moves, chains, corners and resize deterministically", () => {
  let seed = 48271,
    passed = 0;
  for (let index = 0; index < 100; index++) {
    const layout = hotel(),
      before = structuredClone(layout),
      bindings = bindGateways(layout),
      receptionId = bindReception(layout);
    seed = (seed * 16807) % 2147483647;
    const x = seed % 1000;
    seed = (seed * 16807) % 2147483647;
    const y = seed % 600;
    const patch = {
      x,
      y,
      width: 120 + (index % 5) * 20,
      height: 100 + (index % 3) * 30,
    };
    try {
      moveRoom(layout, "room_101", patch, bindings, receptionId);
      assertValid(layout, bindings, receptionId);
      const again = structuredClone(before);
      moveRoom(again, "room_101", patch, bindings, receptionId);
      assert.deepEqual(layout, again);
      passed++;
    } catch (cause) {
      if (cause instanceof assert.AssertionError) throw cause;
      assert.deepEqual(layout, before);
    }
  }
  assert.ok(passed >= 90, `${passed}/100 placements succeeded`);
});
test("impossible drop or resize leaves the entire layout untouched", () => {
  const layout = hotel();
  layout.floor = { width: 208, height: 100 };
  layout.rooms = layout.rooms
    .slice(0, 2)
    .map((room, index) => ({
      ...room,
      x: index * 108,
      y: 0,
      width: 100,
      height: 100,
    }));
  layout.devices = [];
  layout.gateways = [];
  layout.reception = { id: "reception", x: 50, y: 50 };
  const before = structuredClone(layout);
  assert.throws(
    () => moveRoom(layout, "room_101", { x: 54 }, {}, "room_101"),
    /collision-free/,
  );
  assert.deepEqual(layout, before);
  assert.throws(
    () =>
      moveRoom(layout, "room_101", { width: 208, height: 100 }, {}, "room_101"),
    /cannot fit/,
  );
  assert.deepEqual(layout, before);
});
test("overlapping import reflows rooms and fits sensors, gateways and reception", () => {
  const layout = hotel(),
    bindings = bindGateways(layout),
    receptionId = bindReception(layout);
  layout.rooms[1].x = layout.rooms[0].x;
  layout.rooms[1].y = layout.rooms[0].y;
  const prepared = prepareLayout(layout, bindings, receptionId);
  assertValid(prepared, bindings, receptionId);
  assert.notDeepEqual(prepared.rooms, layout.rooms);
});
test("reception follows its bound area after renaming its type and cannot escape", () => {
  const layout = hotel(),
    bindings = bindGateways(layout),
    receptionId = bindReception(layout);
  moveRoom(
    layout,
    receptionId,
    { type: "lobby", x: 700, y: 430, width: 200, height: 160 },
    bindings,
    receptionId,
  );
  layout.reception.x = -999;
  layout.reception.y = 9999;
  constrainLayout(layout, bindings, receptionId);
  assertValid(layout, bindings, receptionId);
});
test("deleting an occupied area removes its devices and safely relocates required reception", () => {
  const layout = hotel(),
    bindings = bindGateways(layout);
  let receptionId = bindReception(layout);
  bindings.gateway_1 = receptionId;
  receptionId = removeArea(layout, receptionId, bindings, receptionId);
  constrainLayout(layout, bindings, receptionId);
  assert.equal(layout.gateways.length, 0);
  assertValid(layout, bindings, receptionId);
  while (layout.rooms.length > 1)
    receptionId = removeArea(layout, layout.rooms[1].id, bindings, receptionId);
  const before = structuredClone(layout);
  assert.throws(
    () => removeArea(layout, layout.rooms[0].id, bindings, receptionId),
    /at least one area/,
  );
  assert.deepEqual(layout, before);
});
test("room gap and SVG letterboxing have explicit, predictable boundaries", () => {
  const a = hotel().rooms[0],
    b = { ...a, id: "b", x: a.x + a.width + ROOM_GAP };
  assert.equal(roomsOverlap(a, b), false);
  b.x -= 0.1;
  assert.equal(roomsOverlap(a, b), true);
  assert.deepEqual(
    clientToFloor(
      { x: 350, y: 400 },
      { left: 100, top: 100, width: 1000, height: 700 },
      { width: 1000, height: 600 },
    ),
    { x: 250, y: 250 },
  );
  assert.deepEqual(
    clientToFloor(
      { x: 500, y: 100 },
      { left: 100, top: 100, width: 800, height: 600 },
      { width: 1000, height: 600 },
    ),
    { x: 500, y: -75 },
  );
});
