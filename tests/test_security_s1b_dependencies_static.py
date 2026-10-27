import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def test_unused_axios_is_gone_and_mail_library_is_patched():
    package = load("package.json")
    assert "axios" not in package["dependencies"]
    assert package["dependencies"]["nodemailer"] == "^10.2.1"
    assert package["dependencies"]["uuid"] == "^11.1.1"


def test_vulnerable_transitive_packages_are_pinned_to_fixed_versions():
    overrides = load("package.json")["overrides"]
    assert overrides["fast-uri@3"] == "3.1.9"
    assert overrides["follow-redirects"] == "1.16.2"
    assert overrides["form-data"] == "4.0.6"
    assert overrides["postcss"] == "$postcss"
    lock = load("package-lock.json")["packages"]
    assert lock["node_modules/nodemailer"]["version"] == "10.2.1"
    assert lock["node_modules/postcss"]["version"] == "8.5.32"
    assert "node_modules/axios" not in lock
