"""Smoke test so CI has something to run before Phase D."""

from bot import __version__


def test_version_present() -> None:
    assert __version__ == "0.1.0"
