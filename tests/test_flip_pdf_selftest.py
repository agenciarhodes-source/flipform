from pathlib import Path
import importlib.util
import sys

root = Path(__file__).resolve().parents[1] / "workers/gojus"
sys.path.insert(0, str(root))
spec = importlib.util.spec_from_file_location("flip_pdf_selftest", root / "api/selftest.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def test_selftest_converts_png_and_rasterizes_pdf():
    result = module.run_selftest()
    assert result["ok"] is True
    assert result["synthetic"] is True
    assert result["pages"] == 2
    assert 100 < result["bytes"] < 1024 * 1024

def test_selftest_disabled_by_default_and_with_real_storage():
    assert not module.enabled({})
    assert module.enabled({"FLIP_PDF_SELFTEST_ENABLED": "1"})
    assert not module.enabled({"FLIP_PDF_SELFTEST_ENABLED": "1", "GOJUS_PDF_R2_LIFECYCLE_VERIFIED": "1"})
