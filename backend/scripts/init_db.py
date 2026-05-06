#!/usr/bin/env python3
"""Initialize the database tables."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.db import Base, engine

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Database initialized successfully.")
