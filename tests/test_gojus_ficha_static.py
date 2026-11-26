from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def test_gojus_map_is_unverified_until_annex_is_supplied():
    rules=(ROOT/"lib/gojus/ficha-rules.ts").read_text(encoding="utf-8")
    assert "version:'pending-annex-1',verified:false,fields:[]" in rules
    assert "if(!validation.ready)return {ready:false,fields:[]" in rules
    assert "tests/gojus-ficha-rules.test.ts" in (ROOT/".github/workflows/ci.yml").read_text(encoding="utf-8")
    assert "prisma" not in rules
    assert "server-only" not in rules
