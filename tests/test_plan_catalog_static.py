from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_demo_seed_never_runs_in_production_and_uses_the_catalog():
    seed = read("prisma/seed.ts")
    assert "assertSeedAllowed();" in seed
    assert seed.index("assertSeedAllowed();") < seed.index("deleteMany()")
    assert "process.env.ALLOW_DESTRUCTIVE_SEED !== 'true'" in seed
    assert "[...PLAN_CATALOG, ...PLAN_CATALOG_UNSOLD]" in seed
    for old in ("price: '97'", "price: '157'", "price: '397'"):
        assert old not in seed


def test_repair_script_only_creates_missing_plans_from_the_catalog():
    repair = read("scripts/repair-admin-access-billing.ts")
    assert "catalogPlan(slug)" in repair
    assert "update: {}," in repair
    for old in ("'Starter', 99", "'Growth', 199", "'Pro', 399"):
        assert old not in repair
