#!/usr/bin/env python3
"""Initialize the database tables (V1 schema)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.db import init_schema

if __name__ == "__main__":
    init_schema()
    print("Database initialized successfully.")
