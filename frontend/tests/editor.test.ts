import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  availablePosition,
  bindGateways,
  clampToRoom,
  constrainLayout,
  markerSize,
  moveRoom,
  reassignSensor,
} from "../src/editor";
import type { Layout } from "../src/models";

const fixture = (): Layout =>
  JSON.parse(
    readFileSync(
      new URL("../../shared/fixtures/network-hotel.json", import.meta.url),
      "utf8",
    ),
  );
function assertContained(layout: Layout, bindings = bindGateways(layout)) {
  for (const item of [...layout.devices, ...layout.gateways]) {
    const id = "room_id" in item ? item.room_id : bindings[item.id];
    const room = layout.rooms.find((room) => room.id === id)!;
    assert.ok(room, `${item.id} has a room`);
    const size = markerSize(room, "room_id" in item ? 21 : 20);
    assert.ok(
      item.x - size >= room.x - 1e-9 &&
        item.x + size <= room.x + room.width + 1e-9,
      `${item.id} horizontal bounds`,
    );
    assert.ok(
      item.y - size >= room.y - 1e-9 &&
        item.y + size <= room.y + room.height + 1e-9,
      `${item.id} vertical bounds`,
    );
  }
}

test("drag and numeric edits cannot escape the assigned room or change its ID", () => {
  for (const x of [-1000, 0, 50, 230, 1000, 1e9])
    for (const y of [-1000, 0, 50, 190, 600, 1e9]) {
      const layout = fixture(),
        bindings = bindGateways(layout);
      layout.devices[0].x = x;
      layout.devices[0].y = y;
      layout.gateways[0].x = x;
      layout.gateways[0].y = y;
      constrainLayout(layout, bindings);
      assert.equal(layout.devices[0].room_id, "room_101");
      assert.equal(bindings.gateway_1, "lobby");
      assertContained(layout, bindings);
    }
});
test("explicit room reassignment moves a sensor to the new room centre", () => {
  const layout = fixture();
  reassignSensor(layout, "temp_101", "room_105");
  assert.deepEqual(layout.devices[0], {
    id: "temp_101",
    type: "temperature_sensor",
    room_id: "room_105",
    x: 540,
    y: 320,
  });
  assertContained(layout);
});
test("room move and resize carry sensors, gateways and reception within the floor", () => {
  const layout = fixture(),
    bindings = bindGateways(layout);
  moveRoom(
    layout,
    "room_101",
    { x: 700, y: 400, width: 250, height: 160 },
    bindings,
  );
  assert.equal(layout.devices[0].x, 700 + (70 / 180) * 250);
  moveRoom(
    layout,
    "lobby",
    { x: 9999, y: -500, width: 9999, height: 1 },
    bindings,
  );
  assertContained(layout, bindings);
  const lobby = layout.rooms.find((room) => room.id === "lobby")!;
  assert.ok(lobby.x + lobby.width <= layout.floor.width);
  assert.equal(lobby.y, 0);
  moveRoom(
    layout,
    "reception_room",
    { x: 500, y: 400, width: 200, height: 100 },
    bindings,
  );
  assert.deepEqual(layout.reception, { id: "reception", x: 560, y: 450 });
});
test("tiny imported rooms keep fitted marker footprints inside", () => {
  for (const width of [0.001, 1, 2, 10, 40]) {
    const layout = fixture(),
      bindings = bindGateways(layout);
    Object.assign(layout.rooms[0], { width, height: width });
    constrainLayout(layout, bindings);
    assertContained(layout, bindings);
    assert.deepEqual(clampToRoom({ x: -100, y: 9999 }, layout.rooms[0]), {
      x: 50 + width / 2,
      y: 50 + width / 2,
    });
  }
});
test("imported out-of-room markers are fitted without adding contract fields", () => {
  const layout = fixture();
  layout.devices[0].x = 999;
  layout.gateways[0].x = 990;
  const bindings = bindGateways(layout);
  constrainLayout(layout, bindings);
  assertContained(layout, bindings);
  assert.deepEqual(Object.keys(layout.gateways[0]).sort(), [
    "active",
    "id",
    "x",
    "y",
  ]);
  assert.throws(
    () =>
      constrainLayout(
        { ...layout, devices: [{ ...layout.devices[0], room_id: "missing" }] },
        bindings,
      ),
    /existing assigned room/,
  );
  assert.throws(
    () => constrainLayout({ ...fixture(), rooms: [], devices: [] }, {}),
    /existing assigned area/,
  );
});
test("normalization is idempotent, including overlapping areas and repeated room edits", () => {
  const layout = fixture(),
    bindings = bindGateways(layout);
  for (let index = 0; index < 50; index++) {
    moveRoom(
      layout,
      "room_101",
      { x: index * 17, y: index * 9, width: 60 + index, height: 80 },
      bindings,
    );
    assertContained(layout, bindings);
  }
  const once = structuredClone(layout);
  constrainLayout(layout, bindings);
  assert.deepEqual(layout, once);
});

test("repeated additions use available interior space without escaping crowded areas", () => {
  const layout = fixture(),
    room = layout.rooms[0];
  const positions = new Set<string>();
  for (let index = 0; index < 12; index++) {
    const point = availablePosition(layout, room);
    positions.add(JSON.stringify(point));
    layout.devices.push({
      id: `added_${index}`,
      room_id: room.id,
      type: "temperature_sensor",
      ...point,
    });
    assertContained(layout);
  }
  assert.ok(positions.size >= 4, "new sensors use multiple interior positions");
});

test("loading overlapping areas preserves already fitted gateway coordinates", () => {
  const layout = fixture();
  layout.rooms.unshift({
    id: "overlap",
    name: "Overlap",
    type: "lobby",
    x: 330,
    y: 310,
    width: 150,
    height: 100,
  });
  const before = structuredClone(layout.gateways[0]);
  const bindings = bindGateways(layout);
  assert.equal(bindings.gateway_1, "lobby");
  constrainLayout(layout, bindings);
  assert.deepEqual(layout.gateways[0], before);
});

test("dragging a room against the floor boundary preserves its size and occupants", () => {
  const layout = fixture(),
    bindings = bindGateways(layout);
  moveRoom(layout, "room_101", { x: 9999, y: 9999 }, bindings);
  assert.deepEqual(layout.rooms[0], {
    id: "room_101",
    name: "Room 101",
    type: "room",
    x: 820,
    y: 460,
    width: 180,
    height: 140,
  });
  assertContained(layout, bindings);
});
