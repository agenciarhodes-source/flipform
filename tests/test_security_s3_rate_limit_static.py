import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_rate_limit_is_shared_in_the_database():
    source = (ROOT / "lib/rate-limit.ts").read_text(encoding="utf-8")
    assert "export async function rateLimit(input: RateLimitInput): Promise<RateLimitResult>" in source
    assert "INSERT INTO rate_limit_buckets" in source
    assert "return memoryRateLimit(input);" in source
    assert "process.env.TRUST_CLOUDFLARE_IP === '1'" in source


def test_every_call_waits_for_the_shared_count():
    for path in list((ROOT / "app").rglob("*.ts")) + list((ROOT / "lib").rglob("*.ts")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        assert not re.search(r"=\s*rateLimit\(", text), path


def test_migration_is_additive():
    sql = (ROOT / "prisma/migrations/20261102120000_rate_limit_buckets/migration.sql").read_text(encoding="utf-8")
    assert 'CREATE TABLE IF NOT EXISTS "rate_limit_buckets"' in sql
    assert "DROP " not in sql and "ALTER TABLE" not in sql
