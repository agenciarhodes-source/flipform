import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_next_is_on_a_patched_release():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    # Next.js 14 no longer gets security fixes; 15.5.28 closes the known advisories (S1c).
    assert package["dependencies"]["next"] == "15.5.28"
    assert lock["packages"]["node_modules/next"]["version"] == "15.5.28"
    assert lock["packages"]["node_modules/@next/env"]["version"] == "15.5.28"
    major, minor, patch = (int(part) for part in lock["packages"]["node_modules/next"]["version"].split("."))
    assert (major, minor, patch) >= (15, 5, 28)


def test_ci_checks_dependencies_on_every_pr():
    ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    assert "name: Next.js security floor" in ci
    assert "npm audit --omit=dev --audit-level=high" in ci
