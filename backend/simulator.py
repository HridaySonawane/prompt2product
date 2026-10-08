"""One request -> one real process -> one validated JSON response. No shell."""

import json
import logging
import subprocess

from jsonschema import ValidationError

from .contract import OUTPUT_VALIDATOR, error_response, load_json

logger = logging.getLogger(__name__)


class SimulatorError(Exception):
    def __init__(self, http_status, code, message):
        super().__init__(message)
        self.http_status = http_status
        self.response = error_response(code, message)


class SimulatorRunner:
    def __init__(self, settings):
        self.settings = settings

    def run(self, request):
        try:
            result = subprocess.run(
                [str(self.settings.simulator_path)],
                input=json.dumps(request, allow_nan=False, ensure_ascii=False),
                capture_output=True, text=True, encoding="utf-8", errors="strict",
                timeout=self.settings.timeout_seconds, shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            # subprocess.run kills and waits for the child before raising.
            raise SimulatorError(504, "SIMULATOR_TIMEOUT", "Simulator exceeded its configured time limit") from exc
        except OSError as exc:
            logger.error("Simulator launch failed: %s", exc)
            raise SimulatorError(503, "SIMULATOR_UNAVAILABLE", "Simulator could not be started; check its build and configured path") from exc
        except UnicodeError as exc:
            raise SimulatorError(502, "SIMULATOR_PROTOCOL_ERROR", "Simulator output must be UTF-8") from exc

        if result.stderr:
            logger.warning("Simulator stderr: %s", result.stderr.rstrip())
        try:
            response = load_json(result.stdout)
            OUTPUT_VALIDATOR.validate(response)
        except (ValueError, ValidationError, RecursionError) as exc:
            logger.error("Simulator returned invalid contract JSON")
            raise SimulatorError(502, "SIMULATOR_PROTOCOL_ERROR", "Simulator returned an invalid JSON response") from exc

        if response["status"] == "ok":
            if result.returncode != 0:
                raise SimulatorError(502, "SIMULATOR_PROTOCOL_ERROR", "Simulator success response conflicts with its exit code")
            return 200, response
        if result.returncode == 0:
            raise SimulatorError(502, "SIMULATOR_PROTOCOL_ERROR", "Simulator error response conflicts with its exit code")
        status = 422 if response["error"]["code"] == "INVALID_INPUT" else 502
        return status, response
