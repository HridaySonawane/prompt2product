"""Use the same checked-in schemas for HTTP input and simulator output."""

import json
import math

from jsonschema import Draft202012Validator

from .config import SHARED_ROOT


def reject_constant(value):
    raise ValueError(f"Non-finite JSON number '{value}' is not supported")


def ensure_finite(value):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("All JSON numbers must be finite")
    if isinstance(value, dict):
        for item in value.values():
            ensure_finite(item)
    elif isinstance(value, list):
        for item in value:
            ensure_finite(item)


def load_json(text):
    value = json.loads(text, parse_constant=reject_constant)
    ensure_finite(value)
    return value


def read_schema(name):
    schema = load_json((SHARED_ROOT / name).read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return schema


INPUT_SCHEMA = read_schema("input.schema.json")
OUTPUT_SCHEMA = read_schema("output.schema.json")
INPUT_VALIDATOR = Draft202012Validator(INPUT_SCHEMA)
OUTPUT_VALIDATOR = Draft202012Validator(OUTPUT_SCHEMA)


def validation_message(error):
    path = "$"
    for part in error.absolute_path:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return f"{path}: {error.message}"


def error_response(code, message):
    return {"schema_version": "1.0", "status": "error", "error": {"code": code, "message": message}}
