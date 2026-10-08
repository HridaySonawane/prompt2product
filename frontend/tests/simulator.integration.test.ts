/** Actual C++ stdin/stdout integration; no mocked metrics. Build the simulator
 * first, or set IOTFORGE_SIMULATOR to a compiled executable. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import hotel from "../../shared/fixtures/network-hotel.json";
import type { Layout, Result } from "../src/models";
import {
  bindGateways,
  bindReception,
  moveRoom,
  prepareLayout,
  removeArea,
} from "../src/editor";
import { roomsOverlap } from "../src/room_layout";

const executable =
  process.env.IOTFORGE_SIMULATOR ??
  ["build-release", "build"]
    .map((folder) =>
      resolve(
        "../simulator",
        folder,
        process.platform === "win32" ? "iot_simulator.exe" : "iot_simulator",
      ),
    )
    .find(existsSync);
const options = {
  skip: !executable && "Build C++ first or set IOTFORGE_SIMULATOR.",
};
function simulate(layout: Layout): Result {
  const run = spawnSync(executable!, [], {
    input: JSON.stringify(layout),
    encoding: "utf8",
    timeout: 20000,
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout) as Result;
  assert.equal(result.status, "ok");
  assert.ok(result.summary);
  for (const link of result.geometry.links) {
    const sensor = layout.devices.find((item) => item.id === link.source)!;
    const gateway = layout.gateways.find(
      (item) => item.id === link.destination,
    )!;
    assert.ok(sensor && gateway);
    assert.ok(
      Math.abs(
        link.distance - Math.hypot(sensor.x - gateway.x, sensor.y - gateway.y),
      ) < 1e-8,
    );
  }
  return result;
}
function initial() {
  const original = structuredClone(hotel) as Layout;
  const bindings = bindGateways(original),
    receptionId = bindReception(original);
  return {
    layout: prepareLayout(original, bindings, receptionId),
    bindings,
    receptionId,
  };
}
function noOverlaps(layout: Layout) {
  for (const [index, room] of layout.rooms.entries())
    for (const other of layout.rooms.slice(index + 1))
      assert.equal(roomsOverlap(room, other), false);
}
test(
  "real C++ receives moved room contents and calculates changed geometry",
  options,
  () => {
    const { layout, bindings, receptionId } = initial();
    const before = simulate(layout);
    moveRoom(layout, "room_101", { x: 250, y: 50 }, bindings, receptionId);
    noOverlaps(layout);
    const after = simulate(layout);
    const link = (result: Result) =>
      result.geometry.links.find(
        (item) =>
          item.source === "temp_101" && item.destination === "gateway_1",
      )!;
    assert.notEqual(link(before).distance, link(after).distance);
    assert.deepEqual(
      simulate(layout),
      after,
      "fixed-seed results remain repeatable after room reflow",
    );
  },
);
test(
  "real C++ accepts rearranged lobby/gateway and reception coordinates",
  options,
  () => {
    const { layout, bindings, receptionId } = initial();
    const lobby = layout.rooms.find((room) => room.id === "lobby")!;
    const gateway = layout.gateways[0],
      originalGateway = { ...gateway };
    moveRoom(layout, lobby.id, { x: 600, y: 250 }, bindings, receptionId);
    noOverlaps(layout);
    assert.notDeepEqual(layout.gateways[0], originalGateway);
    const response = simulate(layout);
    assert.equal(
      response.geometry.links.length,
      layout.devices.length * layout.gateways.length,
    );
    assert.equal(response.summary!.total_devices, layout.devices.length);
  },
);
test(
  "real C++ accepts deleting the reception area with safe singleton relocation",
  options,
  () => {
    const { layout, bindings, receptionId } = initial();
    const replacement = removeArea(
      layout,
      "reception_room",
      bindings,
      receptionId,
    );
    assert.ok(layout.rooms.some((room) => room.id === replacement));
    assert.equal(layout.reception.id, "reception");
    assert.equal(simulate(layout).status, "ok");
  },
);
