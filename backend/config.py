"""Paths are resolved from this checkout, never from the caller's working directory."""

import math
import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SHARED_ROOT = PROJECT_ROOT / "shared"
DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
)


@dataclass(frozen=True)
class Settings:
    simulator_path: Path
    timeout_seconds: float = 10.0
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS

    def __post_init__(self):
        if not math.isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("IOTFORGE_SIMULATOR_TIMEOUT must be a positive finite number")

    @classmethod
    def from_env(cls):
        filename = "iot_simulator.exe" if os.name == "nt" else "iot_simulator"
        path = Path(os.environ.get("IOTFORGE_SIMULATOR_PATH", str(PROJECT_ROOT / "simulator" / "build" / filename)))
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        origins = os.environ.get("IOTFORGE_CORS_ORIGINS")
        return cls(
            simulator_path=path.resolve(),
            timeout_seconds=float(os.environ.get("IOTFORGE_SIMULATOR_TIMEOUT", "10")),
            cors_origins=tuple(item.strip() for item in origins.split(",") if item.strip())
            if origins is not None else DEFAULT_CORS_ORIGINS,
        )
