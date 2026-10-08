/** Offline React event tests. Network responses below are explicit unit-test
 * doubles; actual C++/Ollama acceptance is exercised separately by verify_final.py.
 * Pointer capture is emulated by jsdom; these are not browser visual tests. */
import { test, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { readFileSync } from "node:fs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://unit.test/",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "SVGElement",
  "Element",
  "Node",
  "NodeFilter",
  "Event",
  "MouseEvent",
  "MutationObserver",
  "CustomEvent",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as any)[key],
  });
}
for (const key of Object.getOwnPropertyNames(dom.window).filter((key) =>
  /^(HTML|SVG).+Element$/.test(key),
))
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: (dom.window as any)[key],
  });
class TestPointerEvent extends dom.window.MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, values: any = {}) {
    super(type, values);
    this.pointerId = values.pointerId ?? 1;
    this.pointerType = values.pointerType ?? "mouse";
  }
}
Object.defineProperty(dom.window, "PointerEvent", { value: TestPointerEvent });
Object.defineProperty(globalThis, "PointerEvent", { value: TestPointerEvent });
Object.defineProperty(globalThis, "getComputedStyle", {
  value: dom.window.getComputedStyle.bind(dom.window),
  configurable: true,
});
for (const key of ["requestAnimationFrame", "cancelAnimationFrame"] as const)
  Object.defineProperty(globalThis, key, {
    value: dom.window[key].bind(dom.window),
    configurable: true,
  });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
});
const captures = new WeakMap<Element, Set<number>>();
dom.window.Element.prototype.setPointerCapture = function (id: number) {
  captures.set(this, new Set([id]));
};
dom.window.Element.prototype.hasPointerCapture = function (id: number) {
  return captures.get(this)?.has(id) ?? false;
};
dom.window.Element.prototype.releasePointerCapture = function (id: number) {
  captures.get(this)?.delete(id);
};
let render: any,
  screen: any,
  fireEvent: any,
  cleanup: any,
  act: any,
  within: any;
let App: React.ComponentType;
before(async () => {
  ({ render, screen, fireEvent, cleanup, act, within } = await import(
    "@testing-library/react"
  ));
  App = (await import("../src/App")).default;
});
let canvas: SVGSVGElement;
let requests: { url: string; body: any }[] = [];
const fetchBefore = globalThis.fetch;
const unitResult = {
  schema_version: "1.0",
  status: "ok",
  geometry: { links: [] },
  summary: {
    coverage: 0,
    reliability: 0,
    total_devices: 0,
    reachable_devices: 0,
    generated_messages: 0,
    delivered_messages: 0,
    lost_messages: 0,
    worst_latency_ms: null,
    average_latency_ms: null,
  },
  devices: [],
  requirements_evaluation: {
    pass: false,
    checks: { coverage: false },
    diagnostics: [],
  },
  model: { sensitivity_dbm: -72 },
};
beforeEach(async () => {
  requests = [];
  globalThis.fetch = async (url: any, init?: any) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body) : null,
    });
    const data = String(url).endsWith("/ai/health")
      ? { available: false, model: "unit-test" }
      : String(url).endsWith("/health")
        ? { simulator_available: true }
        : unitResult;
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await act(async () => {
      render(React.createElement(App));
    });
  } catch (cause) {
    throw cause instanceof AggregateError ? cause.errors[0] : cause;
  }
  canvas = screen.getByTestId("floor-plan") as unknown as SVGSVGElement;
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1000,
    height: 600,
    right: 1000,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  });
});
afterEach(() => {
  cleanup();
  globalThis.fetch = fetchBefore;
});
after(() => dom.window.close());
const area = (id: string) => screen.getByTestId("room-" + id);
const marker = (id: string) =>
  document.querySelector(`[data-device-id="${id}"]`)!;
const point = (element: Element) => ({
  x: Number(element.getAttribute("data-x")),
  y: Number(element.getAttribute("data-y")),
});
function drag(
  element: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  pointerId = 1,
) {
  fireEvent.pointerDown(element, {
    pointerId,
    button: 0,
    buttons: 1,
    clientX: from.x,
    clientY: from.y,
  });
  assert.ok(
    canvas.hasPointerCapture(pointerId),
    "the stable SVG root captures the pointer",
  );
  fireEvent.pointerMove(canvas, {
    pointerId,
    buttons: 1,
    clientX: to.x,
    clientY: to.y,
  });
  fireEvent.pointerUp(canvas, {
    pointerId,
    button: 0,
    buttons: 0,
    clientX: to.x,
    clientY: to.y,
  });
  assert.ok(!canvas.hasPointerCapture(pointerId));
}
function assertAllContained() {
  for (const item of document.querySelectorAll("[data-device-id]")) {
    const target = area(item.getAttribute("data-room-id")!),
      p = point(item),
      r = point(target);
    assert.ok(
      p.x >= r.x &&
        p.y >= r.y &&
        p.x <= r.x + Number(target.getAttribute("data-width")) + 1e-7 &&
        p.y <= r.y + Number(target.getAttribute("data-height")) + 1e-7,
      `${item.getAttribute("data-device-id")} escaped`,
    );
  }
}

test("clicking a room shows its contents and supports add/remove without switching tabs", () => {
  fireEvent.click(area("room_102"));
  const panel = screen.getByRole("region", { name: "Contents of Room 102" });
  assert.ok(within(panel).getByRole("button", { name: "Inspect temp_102" }));
  assert.equal(
    within(panel).queryByRole("button", { name: "Inspect temp_101" }),
    null,
  );
  fireEvent.click(within(panel).getByRole("button", { name: "Temperature" }));
  const added = [...document.querySelectorAll("[data-device-id]")].find(
    (node) =>
      node.getAttribute("data-device-id")!.startsWith("temp_") &&
      !/^temp_10[1-5]$/.test(node.getAttribute("data-device-id")!),
  )!;
  assert.equal(added.getAttribute("data-room-id"), "room_102");
  assertAllContained();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Remove " + added.getAttribute("data-device-id"),
    }),
  );
  assert.equal(
    document.querySelector(
      `[data-device-id="${added.getAttribute("data-device-id")}"]`,
    ),
    null,
  );
});
test("dragging the room body moves it and its sensor, with neighbour reflow", () => {
  drag(area("room_101"), { x: 80, y: 80 }, { x: 280, y: 80 });
  assert.deepEqual(point(area("room_101")), { x: 250, y: 50 });
  assert.deepEqual(point(marker("temp_101")), { x: 320, y: 120 });
  assert.notDeepEqual(point(area("room_102")), { x: 250, y: 50 });
  assertAllContained();
});
test("locked sensor drag moves its room and cannot detach the sensor", () => {
  assert.equal(
    screen
      .getByRole("switch", { name: "Unlock individual placement" })
      .getAttribute("aria-checked"),
    "false",
  );
  drag(marker("temp_101"), { x: 120, y: 120 }, { x: 180, y: 150 });
  assert.deepEqual(point(area("room_101")), { x: 110, y: 80 });
  assert.deepEqual(point(marker("temp_101")), { x: 180, y: 150 });
  assertAllContained();
});
test("unlocked sensor drag stays in its room while the room remains still", () => {
  fireEvent.click(
    screen.getByRole("switch", { name: "Unlock individual placement" }),
  );
  drag(marker("temp_101"), { x: 120, y: 120 }, { x: 999, y: 599 });
  assert.deepEqual(point(area("room_101")), { x: 50, y: 50 });
  assert.deepEqual(point(marker("temp_101")), { x: 206, y: 166 });
  assert.equal(marker("temp_101").getAttribute("data-room-id"), "room_101");
  assertAllContained();
});
test("locked gateway and reception drags move their areas with all contents", () => {
  for (const id of ["gateway_1", "reception"]) {
    const item = marker(id),
      old = point(item),
      owner = item.getAttribute("data-room-id")!,
      oldArea = point(area(owner));
    drag(item, old, { x: old.x + 25, y: old.y + 30 });
    assert.deepEqual(point(area(owner)), {
      x: oldArea.x + 25,
      y: oldArea.y + 30,
    });
    assert.deepEqual(point(marker(id)), { x: old.x + 25, y: old.y + 30 });
    assertAllContained();
  }
});
test("gateway and reception unlocked coordinates cannot escape their assigned areas", () => {
  for (const id of ["gateway_1", "reception"]) {
    fireEvent.click(marker(id));
    const toggle = screen.getByRole("switch", {
      name: "Unlock individual placement",
    });
    if (toggle.getAttribute("aria-checked") !== "true") fireEvent.click(toggle);
    const oldArea = point(area(marker(id).getAttribute("data-room-id")!));
    fireEvent.change(screen.getByLabelText("Content x"), {
      target: { value: "9999" },
    });
    fireEvent.change(screen.getByLabelText("Content y"), {
      target: { value: "-9999" },
    });
    assert.deepEqual(
      point(area(marker(id).getAttribute("data-room-id")!)),
      oldArea,
    );
    assertAllContained();
  }
});
test("room selection locks contents again; explicit reassignment moves the selected sensor", () => {
  fireEvent.click(marker("temp_101"));
  assert.equal(
    (screen.getByLabelText("Content x") as HTMLInputElement).disabled,
    true,
  );
  fireEvent.click(
    screen.getByRole("switch", { name: "Unlock individual placement" }),
  );
  fireEvent.change(screen.getByLabelText("Content assigned room"), {
    target: { value: "room_103" },
  });
  assert.equal(marker("temp_101").getAttribute("data-room-id"), "room_103");
  assert.ok(screen.getByRole("region", { name: "Contents of Room 103" }));
  assert.equal(
    screen
      .getByRole("switch", { name: "Unlock individual placement" })
      .getAttribute("aria-checked"),
    "false",
  );
  assertAllContained();
});
test("Escape, pointer cancellation and lost capture restore the whole drag transaction", () => {
  for (const cancel of ["escape", "pointer", "capture", "blur"]) {
    const oldRoom = point(area("room_101")),
      oldNeighbour = point(area("room_102")),
      oldSensor = point(marker("temp_101"));
    fireEvent.pointerDown(area("room_101"), {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 80,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      buttons: 1,
      clientX: 280,
      clientY: 80,
    });
    if (cancel === "escape") fireEvent.keyDown(window, { key: "Escape" });
    else if (cancel === "pointer")
      fireEvent.pointerCancel(canvas, { pointerId: 1 });
    else if (cancel === "capture")
      fireEvent.lostPointerCapture(canvas, { pointerId: 1 });
    else fireEvent.blur(window);
    assert.deepEqual(point(area("room_101")), oldRoom);
    assert.deepEqual(point(area("room_102")), oldNeighbour);
    assert.deepEqual(point(marker("temp_101")), oldSensor);
    assert.equal(canvas.hasPointerCapture(1), false);
  }
});
test("another pointer cannot hijack an active drag and the next drag starts cleanly", () => {
  fireEvent.pointerDown(area("room_101"), {
    pointerId: 1,
    button: 0,
    buttons: 1,
    clientX: 80,
    clientY: 80,
  });
  fireEvent.pointerMove(canvas, {
    pointerId: 2,
    buttons: 1,
    clientX: 900,
    clientY: 500,
  });
  assert.deepEqual(point(area("room_101")), { x: 50, y: 50 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 80, clientY: 80 });
  drag(area("room_101"), { x: 80, y: 80 }, { x: 90, y: 90 }, 3);
  assert.deepEqual(point(area("room_101")), { x: 60, y: 60 });
});
test("removing the reception area relocates its required reception to a surviving room", () => {
  fireEvent.click(area("reception_room"));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove area & its devices" }),
  );
  assert.equal(screen.queryByTestId("room-reception_room"), null);
  assert.ok(marker("reception"));
  assertAllContained();
});
test("new gateways are room contents and the two-gateway limit is visible", () => {
  fireEvent.click(area("room_101"));
  const panel = screen.getByRole("region", { name: "Contents of Room 101" });
  fireEvent.click(
    within(panel).getByRole("button", { name: "Gateway", exact: true }),
  );
  const added = [...document.querySelectorAll("[data-device-id]")].find(
    (item) =>
      item.getAttribute("data-device-id")!.startsWith("gateway_") &&
      item.getAttribute("data-device-id") !== "gateway_1",
  )!;
  assert.equal(added.getAttribute("data-room-id"), "room_101");
  assertAllContained();
  assert.equal(
    (
      within(panel).getByRole("button", {
        name: "Gateway",
        exact: true,
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Remove " + added.getAttribute("data-device-id"),
    }),
  );
  assert.equal(
    (
      within(panel).getByRole("button", {
        name: "Gateway",
        exact: true,
      }) as HTMLButtonElement
    ).disabled,
    false,
  );
});
test("layout changes clear previous results and simulator requests use the edited positions", async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Simulate network" }));
  });
  assert.equal(
    document.querySelectorAll(".metric strong")[0].textContent,
    "0.0%",
  );
  drag(area("room_101"), { x: 80, y: 80 }, { x: 90, y: 90 });
  assert.equal(document.querySelectorAll(".metric strong")[0].textContent, "—");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Simulate network" }));
  });
  const body = requests
    .filter((item) => item.url.endsWith("/simulate"))
    .at(-1)!.body;
  assert.equal(body.rooms[0].x, 60);
  assert.equal(body.devices[0].x, 130);
});

test("drag coordinates respect a scaled and letterboxed SVG", () => {
  canvas.getBoundingClientRect = () => ({
    left: 20,
    top: 40,
    width: 500,
    height: 400,
    right: 520,
    bottom: 440,
    x: 20,
    y: 40,
    toJSON() {
      return {};
    },
  });
  // 0.5 scale, with 50 pixels of vertical letterboxing.
  drag(area("room_101"), { x: 60, y: 130 }, { x: 110, y: 155 });
  assert.deepEqual(point(area("room_101")), { x: 150, y: 100 });
  assert.deepEqual(point(marker("temp_101")), { x: 220, y: 170 });
  assertAllContained();
});

test("keyboard moves rooms and locked contents together; unlocked keys stay contained", () => {
  fireEvent.keyDown(area("room_101"), { key: "ArrowRight", shiftKey: true });
  assert.deepEqual(point(area("room_101")), { x: 60, y: 50 });
  assert.deepEqual(point(marker("temp_101")), { x: 130, y: 120 });
  fireEvent.keyDown(marker("temp_101"), { key: "ArrowDown", shiftKey: true });
  assert.deepEqual(point(area("room_101")), { x: 60, y: 60 });
  fireEvent.click(
    screen.getByRole("switch", { name: "Unlock individual placement" }),
  );
  for (let i = 0; i < 25; i++)
    fireEvent.keyDown(marker("temp_101"), { key: "ArrowLeft", shiftKey: true });
  assert.deepEqual(point(area("room_101")), { x: 60, y: 60 });
  assert.equal(point(marker("temp_101")).x, 84);
  assertAllContained();
});

test("clicking fractional positions does not move the room or its contents", () => {
  fireEvent.change(screen.getByLabelText("Room x"), {
    target: { value: "50.5" },
  });
  const originalRoom = point(area("room_101")),
    originalSensor = point(marker("temp_101"));
  drag(area("room_101"), { x: 80, y: 80 }, { x: 80, y: 80 });
  assert.deepEqual(point(area("room_101")), originalRoom);
  assert.deepEqual(point(marker("temp_101")), originalSensor);
});

test("numeric room resizing reflows neighbours and carries contents", () => {
  fireEvent.change(screen.getByLabelText("Room width"), {
    target: { value: "380" },
  });
  assert.equal(area("room_101").getAttribute("data-width"), "380");
  assert.notDeepEqual(point(area("room_102")), { x: 250, y: 50 });
  assertAllContained();
});

test("the last area and required reception cannot be deleted", () => {
  while (document.querySelectorAll('[data-testid^="room-"]').length > 1) {
    fireEvent.click(document.querySelector('[data-testid^="room-"]'));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove area & its devices" }),
    );
  }
  fireEvent.click(document.querySelector('[data-testid^="room-"]'));
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Remove area & its devices",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Remove reception" }),
    null,
  );
  assert.ok(marker("reception"));
  assertAllContained();
});

test("Generate design displays the returned smaller building and keeps its result", async () => {
  // Explicit API double: source/response assertions are covered by backend and
  // live Ollama tests. Here we verify actual React request and rendering behavior.
  const layout = JSON.parse(readFileSync(new URL("../../shared/fixtures/network-hotel.json", import.meta.url), "utf8"));
  layout.rooms = [layout.rooms[0], layout.rooms[1], layout.rooms.find((r: any) => r.type === "bathroom"), layout.rooms.find((r: any) => r.type === "lobby")];
  const ids = new Set(layout.rooms.map((r: any) => r.id));
  layout.devices = layout.devices.filter((d: any) => ids.has(d.room_id));
  const lobby = layout.rooms.find((r: any) => r.type === "lobby");
  layout.reception.x = lobby.x + lobby.width * .75;
  layout.reception.y = lobby.y + lobby.height / 2;
  globalThis.fetch = async (url: any, init?: any) => {
    requests.push({url: String(url), body: JSON.parse(init.body)});
    return new Response(JSON.stringify({status: "ok", layout, simulation: unitResult,
      planner: {source: "deterministic_fallback", reasoning: "Explicit unit-test response"},
      design_request: {mode: "new_layout", matched: true}}), {status: 200});
  };
  fireEvent.click(screen.getByRole("button", {name: "Plan deployment"}));
  fireEvent.change(screen.getByLabelText("Layout and monitoring requirements"), {
    target: {value: "2 rooms, 1 bathroom, 1 lobby, 1 gateway"},
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", {name: "Generate design"}));
  });
  assert.equal(document.querySelectorAll('[data-testid^="room-"]').length, 4);
  assert.equal(document.querySelectorAll('[data-device-id^="temp_"]').length, 2);
  assert.equal(document.querySelectorAll('[data-device-id^="leak_"]').length, 1);
  assert.equal(requests.at(-1)!.body.prompt, "2 rooms, 1 bathroom, 1 lobby, 1 gateway");
  assert.ok(screen.getByText("Requested area counts matched · network simulated by C++."));
  assertAllContained();
});

test("failed design retains current building and shows the backend count error", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({status: "error",
    error: {code: "INVALID_INPUT", message: "This single-floor MVP supports one or two gateways"}}), {status: 422});
  fireEvent.click(screen.getByRole("button", {name: "Plan deployment"}));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", {name: "Generate design"}));
  });
  assert.equal(document.querySelectorAll('[data-testid^="room-"]').length, 8);
  assert.ok(screen.getAllByText("This single-floor MVP supports one or two gateways").length);
  assert.ok(screen.getByText("Request failed · previous deployment retained."));
});
