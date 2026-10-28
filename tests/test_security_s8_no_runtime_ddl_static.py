import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DDL = re.compile(r"\b(ALTER\s+TABLE|DROP\s+(INDEX|TABLE|CONSTRAINT)|CREATE\s+(UNIQUE\s+)?(INDEX|TABLE))\b", re.I)
# SQL that actually runs: Prisma raw templates (`$executeRaw`...``, `$queryRaw`...``, Prisma.sql`...`).
RUNS = re.compile(r"(?:\$executeRaw|\$queryRaw|Prisma\.sql)(?:<[^>]*>)?\s*`([^`]*)`", re.S)


def test_the_app_never_changes_the_database_structure_at_runtime():
    # Structure changes go through reviewed migrations; scripts/ stays for manual operations.
    for folder in ("app", "lib"):
        for path in (ROOT / folder).rglob("*.ts"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            assert "$executeRawUnsafe" not in text, path
            assert "$queryRawUnsafe" not in text, path
            for sql in RUNS.findall(text):
                assert not DDL.search(sql), (path, sql[:120])


def test_admin_schema_check_only_reads():
    source = (ROOT / "lib/admin/assert-admin-schema-ready.ts").read_text(encoding="utf-8")
    assert "ADMIN_SCHEMA_RUNTIME_REPAIR" not in source
    assert "repairAllowedUsersTableForLegacyDatabases" not in source
    assert (ROOT / "prisma/migrations/202605240000_ensure_allowed_users_table/migration.sql").exists()
