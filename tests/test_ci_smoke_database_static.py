from pathlib import Path

CI = (Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml").read_text(encoding="utf-8")
SMOKE = CI.split("  smoke:")[1]


def test_smoke_database_does_not_depend_on_pulling_a_container_image():
    assert "services:" not in SMOKE
    assert "image:" not in SMOKE
    assert "sudo systemctl start postgresql.service" in SMOKE
    assert 'postgresql-${PG_MAJOR}-pgvector' in SMOKE
    assert "createdb flipform_ci" in SMOKE


def test_database_is_ready_before_the_schema_is_pushed():
    assert SMOKE.index("Start PostgreSQL with pgvector") < SMOKE.index("CREATE EXTENSION IF NOT EXISTS vector") < SMOKE.index("prisma db push")
    assert "postgresql://postgres:postgres@127.0.0.1:5432/flipform_ci" in SMOKE
