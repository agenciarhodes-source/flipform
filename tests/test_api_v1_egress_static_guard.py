"""Negative tests for the narrow, offline API v1 direct-egress safeguard."""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from api_v1_egress_static_guard import inspect, ROUTES, READERS

class ApiV1DirectEgressTests(unittest.TestCase):
    def test_current_scoped_routes_and_readers(self):
        result = inspect()
        self.assertEqual(result["surfaces"], 15)
        self.assertFalse(result["production_egress_attested"])
        self.assertFalse(result["release_authorized"])

    def copy_surfaces(self, root):
        for relative in ROUTES + READERS:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text((ROOT / relative).read_text(encoding="utf-8"))

    def test_direct_fetch_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.copy_surfaces(root)
            p = root / READERS[0]
            p.write_text(p.read_text() + "\nconst outbound = fetch('https://example.invalid');\n")
            with self.assertRaisesRegex(ValueError, "Direct outbound network"):
                inspect(root)

    def test_direct_http_request_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.copy_surfaces(root)
            p = root / ROUTES[0]
            p.write_text(p.read_text() + "\nconst outbound = https.request('https://example.invalid');\n")
            with self.assertRaisesRegex(ValueError, "Direct outbound network"):
                inspect(root)

    def test_route_missing_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.copy_surfaces(root)
            (root / ROUTES[3]).unlink()
            with self.assertRaisesRegex(ValueError, "Missing reviewed"):
                inspect(root)

if __name__ == "__main__":
    unittest.main()
