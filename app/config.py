"""Settings read from the environment (see .env.example).

Other modules read these as `config.NAME` at call time, so tests can monkeypatch them.
"""

import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT_DIR / "data"))
STATIC_DIR = ROOT_DIR / "static"  # built frontend (frontend/dist), copied in by Docker

ADMIN_USER = os.getenv("ADMIN_USER", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
AUTH_DISABLED = os.getenv("AUTH_DISABLED", "").lower() in ("true", "1", "yes")
BASE_URL = os.getenv("BASE_URL", "")

ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:8008").split(",")
    if o.strip()
]

SSE_HEARTBEAT_SECONDS = 20
