"""Pytest config: put the gateway/ dir on sys.path so tests can import
modules the same way `main.py` does (e.g. `from verify_data import ...`)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
