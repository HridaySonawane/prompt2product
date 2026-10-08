import copy
import json
import math
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.config import PROJECT_ROOT, SHARED_ROOT, Settings
from backend.contract import INPUT_VALIDATOR, OUTPUT_VALIDATOR, error_response, load_json
from backend.main import create_app
from backend.simulator import SimulatorError, SimulatorRunner


def fixture(name="basic-hotel"):
    return load_json((SHARED_ROOT / "fixtures" / f"{name}.json").read_text(encoding="utf-8"))


class RealSimulatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.settings = Settings.from_env()
        if not cls.settings.simulator_path.is_file():
            raise RuntimeError("Build the real C++ simulator before running integration tests")

    def setUp(self):
        self.client = TestClient(create_app(self.settings))
        self.addCleanup(self.client.close)

    def assert_response(self, response, status=200):
        self.assertEqual(response.status_code, status, response.text)
        OUTPUT_VALIDATOR.validate(response.json())
        return response.json()

    def test_health(self):
        data = self.client.get("/api/health").json()
        self.assertEqual(data["schema_version"], "1.0")
        self.assertEqual(data["status"], "ok")
        self.assertTrue(data["simulator_available"])

    def test_all_shared_fixtures_match_real_cli(self):
        for path in sorted((SHARED_ROOT / "fixtures").glob("*.json")):
            with self.subTest(fixture=path.name):
                request = load_json(path.read_text(encoding="utf-8"))
                INPUT_VALIDATOR.validate(request)
                direct = subprocess.run([str(self.settings.simulator_path), str(path)],
                    capture_output=True, text=True, encoding="utf-8", timeout=10, check=True)
                self.assertEqual(direct.stderr, "")
                actual = self.assert_response(self.client.post("/api/simulate", json=request))
                self.assertEqual(actual, load_json(direct.stdout))

    def test_hotel_expected_links_twice_consecutively(self):
        request = fixture()
        expected = [math.hypot(220, 200), math.hypot(20, 200), math.hypot(180, 200),
                    220.0, 180.0, math.hypot(220, 180)]
        previous = None
        for _ in range(2):
            data = self.assert_response(self.client.post("/api/simulate", json=request))
            links = data["geometry"]["links"]
            self.assertEqual(len(links), 6)
            for device, link, distance in zip(request["devices"], links, expected):
                self.assertEqual(link["source"], device["id"])
                self.assertEqual(link["destination"], "gateway_1")
                self.assertAlmostEqual(link["distance"], distance, places=8)
                self.assertEqual(link["walls_crossed"], 0)
                self.assertEqual(link["wall_attenuation_db"], 0)
            if previous is not None:
                self.assertEqual(data, previous)
            previous = data

    def test_existing_simulator_fixtures_match_shared_schemas(self):
        for path in sorted((PROJECT_ROOT / "simulator" / "tests").glob("*.json")):
            with self.subTest(fixture=path.name):
                request = load_json(path.read_text(encoding="utf-8-sig"))
                INPUT_VALIDATOR.validate(request)
                self.assert_response(self.client.post("/api/simulate", json=request))

    def test_sensor_movement_changes_real_distance(self):
        request = fixture("wall-obstruction")
        before = self.assert_response(self.client.post("/api/simulate", json=request))["geometry"]["links"][0]
        request["devices"][0]["x"] = 140
        after = self.assert_response(self.client.post("/api/simulate", json=request))["geometry"]["links"][0]
        self.assertEqual(before["distance"], 220)
        self.assertEqual(after["distance"], 200)

    def test_intersecting_and_non_intersecting_wall(self):
        request = fixture("wall-obstruction")
        clear = copy.deepcopy(request)
        clear["walls"] = []
        before = self.assert_response(self.client.post("/api/simulate", json=clear))["geometry"]["links"][0]
        crossed = self.assert_response(self.client.post("/api/simulate", json=request))["geometry"]["links"][0]
        request["walls"][0]["y1"] = 400
        request["walls"][0]["y2"] = 550
        missed = self.assert_response(self.client.post("/api/simulate", json=request))["geometry"]["links"][0]
        self.assertEqual((before["walls_crossed"], before["wall_attenuation_db"]), (0, 0))
        self.assertEqual((crossed["walls_crossed"], crossed["wall_attenuation_db"]), (1, 12))
        self.assertEqual(missed, before)

    def test_two_gateways_including_inactive_geometry(self):
        request = fixture()
        request["gateways"].append({"id": "gateway_2", "x": 120, "y": 120, "active": False})
        links = self.assert_response(self.client.post("/api/simulate", json=request))["geometry"]["links"]
        self.assertEqual(len(links), 12)
        self.assertEqual(links[1]["destination"], "gateway_2")
        self.assertEqual(links[1]["distance"], 0)

    def test_duplicate_wall_ids_rejected_by_cpp(self):
        request = fixture("wall-obstruction")
        request["walls"].append(copy.deepcopy(request["walls"][0]))
        response = self.assert_response(self.client.post("/api/simulate", json=request), 422)
        self.assertEqual(response["error"]["code"], "INVALID_INPUT")
        self.assertIn("duplicate ID", response["error"]["message"])

    def test_unknown_room_rejected_by_cpp(self):
        request = fixture()
        request["devices"][0]["room_id"] = "missing"
        data = self.assert_response(self.client.post("/api/simulate", json=request), 422)
        self.assertIn("unknown room_id", data["error"]["message"])


class RequestValidationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app(Settings(PROJECT_ROOT / "missing-simulator.exe")))
        self.addCleanup(self.client.close)

    def test_invalid_fields_never_start_simulator(self):
        changes = [(["schema_version"], "2.0"), (["floor", "width"], 0),
                   (["devices", 0, "type"], "temperature"), (["gateways", 0, "active"], 1),
                   (["rooms", 0, "width"], -1), (["gateways"], {}),
                   (["requirements", "min_reliability"], 1.1)]
        with patch("backend.simulator.subprocess.run") as process:
            for path, value in changes:
                with self.subTest(path=path):
                    request = fixture()
                    target = request
                    for key in path[:-1]:
                        target = target[key]
                    target[path[-1]] = value
                    response = self.client.post("/api/simulate", json=request)
                    self.assertEqual(response.status_code, 422)
                    OUTPUT_VALIDATOR.validate(response.json())
                    self.assertEqual(response.json()["error"]["code"], "INVALID_INPUT")
            process.assert_not_called()

    def test_missing_field(self):
        response = self.client.post("/api/simulate", json={"schema_version": "1.0"})
        self.assertEqual(response.status_code, 422)
        self.assertIn("required property", response.json()["error"]["message"])

    def test_malformed_nonfinite_and_trailing_json(self):
        for text in ["{", "", "{} {}", '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}']:
            with self.subTest(text=text):
                response = self.client.post("/api/simulate", content=text,
                                            headers={"Content-Type": "application/json"})
                self.assertEqual(response.status_code, 400)
                OUTPUT_VALIDATOR.validate(response.json())

    def test_nonobject_json(self):
        for value in [[], None, 10, "hello"]:
            response = self.client.post("/api/simulate", content=json.dumps(value),
                                        headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, 422)

    def test_content_type(self):
        response = self.client.post("/api/simulate", content="{}", headers={"Content-Type": "text/plain"})
        self.assertEqual(response.status_code, 415)
        OUTPUT_VALIDATOR.validate(response.json())

    def test_missing_executable(self):
        response = self.client.post("/api/simulate", json=fixture())
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "SIMULATOR_UNAVAILABLE")

    def test_cors_current_and_planned_frontend(self):
        for origin in ["http://localhost:3000", "http://127.0.0.1:5173"]:
            response = self.client.options("/api/simulate", headers={
                "Origin": origin, "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["access-control-allow-origin"], origin)


class ProcessFailureTests(unittest.TestCase):
    """Fault injection only; successful integration tests above always use real C++."""
    def setUp(self):
        self.settings = Settings(Path("test-only-executable"), timeout_seconds=0.1)
        self.runner = SimulatorRunner(self.settings)

    def test_timeout(self):
        with patch("backend.simulator.subprocess.run", side_effect=subprocess.TimeoutExpired("test", 0.1)):
            with self.assertRaises(SimulatorError) as caught:
                self.runner.run(fixture())
        self.assertEqual(caught.exception.http_status, 504)
        self.assertEqual(caught.exception.response["error"]["code"], "SIMULATOR_TIMEOUT")

    def test_timeout_configuration_rejects_invalid_numbers(self):
        for timeout in [0, -1, math.inf, math.nan]:
            with self.subTest(timeout=timeout), self.assertRaises(ValueError):
                Settings(Path("test"), timeout_seconds=timeout)

    def test_invalid_output_or_exit_code(self):
        success = {"schema_version": "1.0", "status": "ok", "geometry": {"links": []}}
        cases = [(0, "log\n" + json.dumps(success)), (0, "{}"), (0, ""),
                 (1, json.dumps(success)), (0, json.dumps(error_response("INVALID_INPUT", "bad"))),
                 (0, json.dumps(success) + " {}"),
                 (0, '{"schema_version":"1.0","status":"ok","geometry":{"links":[{"source":"a","destination":"b","distance":NaN,"walls_crossed":0,"wall_attenuation_db":0}]}}')]
        for code, output in cases:
            with self.subTest(code=code, output=output):
                result = subprocess.CompletedProcess(["test"], code, output, "")
                with patch("backend.simulator.subprocess.run", return_value=result):
                    with self.assertRaises(SimulatorError) as caught:
                        self.runner.run(fixture())
                self.assertEqual(caught.exception.http_status, 502)

    def test_spawn_uses_stdin_no_shell_and_keeps_stderr_separate(self):
        output = {"schema_version": "1.0", "status": "ok", "geometry": {"links": []}}
        result = subprocess.CompletedProcess(["test"], 0, json.dumps(output), "test diagnostic\n")
        with patch("backend.simulator.subprocess.run", return_value=result) as process:
            status, response = self.runner.run(fixture())
        self.assertEqual((status, response), (200, output))
        kwargs = process.call_args.kwargs
        self.assertFalse(kwargs["shell"])
        self.assertEqual(load_json(kwargs["input"]), fixture())
        self.assertEqual(kwargs["timeout"], 0.1)


if __name__ == "__main__":
    unittest.main()
