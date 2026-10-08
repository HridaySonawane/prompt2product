"""Repeatable live HTTP -> FastAPI -> C++ verification. Start Uvicorn first."""

import argparse
import copy
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .config import SHARED_ROOT
from .contract import OUTPUT_VALIDATOR, load_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    def send(path, payload=None, expected_status=200, raw=None):
        body = raw if raw is not None else (json.dumps(payload).encode("utf-8") if payload is not None else None)
        request = Request(base_url + path, data=body, headers={"Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=15) as response:
                status, text = response.status, response.read()
        except HTTPError as error:
            status, text = error.code, error.read()
        if status != expected_status:
            raise AssertionError(f"Expected HTTP {expected_status}, received {status}: {text!r}")
        data = load_json(text)
        if path == "/api/simulate":
            OUTPUT_VALIDATOR.validate(data)
        return data

    health = send("/api/health")
    assert health["status"] == "ok" and health["simulator_available"]
    print("PASS health and executable readiness")
    hotel = load_json((SHARED_ROOT / "fixtures" / "basic-hotel.json").read_text(encoding="utf-8"))
    first = send("/api/simulate", hotel)
    assert len(first["geometry"]["links"]) == 6
    print("PASS six real hotel geometry links")
    assert send("/api/simulate", hotel) == first
    print("PASS second consecutive request without restart")
    wall = load_json((SHARED_ROOT / "fixtures" / "wall-obstruction.json").read_text(encoding="utf-8"))
    blocked = send("/api/simulate", wall)["geometry"]["links"][0]
    assert (blocked["distance"], blocked["walls_crossed"], blocked["wall_attenuation_db"]) == (220, 1, 12)
    print("PASS concrete wall: distance 220, one crossing, 12 dB")
    moved = copy.deepcopy(wall)
    moved["devices"][0]["x"] = 140
    assert send("/api/simulate", moved)["geometry"]["links"][0]["distance"] == 200
    print("PASS moving sensor changes distance to 200")
    wall["walls"][0].update(y1=400, y2=550)
    clear = send("/api/simulate", wall)["geometry"]["links"][0]
    assert (clear["walls_crossed"], clear["wall_attenuation_db"]) == (0, 0)
    print("PASS non-intersecting wall contributes zero attenuation")
    assert send("/api/simulate", raw=b"{", expected_status=400)["error"]["code"] == "INVALID_INPUT"
    print("PASS malformed JSON returns structured HTTP 400")
    hotel["schema_version"] = "2.0"
    assert send("/api/simulate", hotel, expected_status=422)["error"]["code"] == "INVALID_INPUT"
    print("PASS unsupported schema returns structured HTTP 422")
    print("8 live HTTP checks passed")
    print(json.dumps({"health": health, "wall_result": blocked}, indent=2))


if __name__ == "__main__":
    main()
