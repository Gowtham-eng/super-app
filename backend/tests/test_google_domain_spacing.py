"""Spaces after commas in the Google domain box must not become part of the domain."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes.google_oauth import _normalize_domains


def test_space_after_comma_is_not_part_of_the_domain():
    raw = ["refex.co.in, 3imedtech.com, noventiq.com, kissflow.com, modepro.com, omegahires.com"]
    assert _normalize_domains(raw) == [
        "refex.co.in",
        "3imedtech.com",
        "noventiq.com",
        "kissflow.com",
        "modepro.com",
        "omegahires.com",
    ]
    assert "omegahires.com" in _normalize_domains(["refex.co.in", " omegahires.com"])
    assert "omegehires.com" not in _normalize_domains(["omegahires.com"])
