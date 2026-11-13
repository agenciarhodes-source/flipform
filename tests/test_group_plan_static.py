"""Plano Grupo: the stores follow the paying store's payments, the group page applies it when stores
change, a deleted group ends it first, and the paying store cannot change its own plan."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_stripe_events_sync_the_group_stores():
    source = read("lib/stripe/subscription-webhook.ts")
    assert "await syncGroupPlansForPayer(tenantId)" in source


def test_group_page_applies_and_ends_the_plan():
    source = read("app/api/admin/business-groups/[id]/route.ts")
    assert "const groupPlan = await refreshGroupPlan(ctx.params.id);" in source
    assert "UPDATE business_group_plans SET status = 'ended'" in source


def test_paying_store_plan_is_managed_by_the_platform():
    source = read("app/api/billing/change-plan/route.ts")
    assert "if (await isActiveGroupPayer(session.tenantId))" in source


def test_migration_is_additive():
    sql = read("prisma/migrations/20261118120000_business_group_plans/migration.sql").upper()
    assert "CREATE TABLE IF NOT EXISTS" in sql
    statements = [line.strip() for line in sql.splitlines() if line.strip() and not line.strip().startswith("--")]
    for word in ("DROP ", "ALTER TABLE", "DELETE ", "UPDATE ", "TRUNCATE"):
        assert not any(line.startswith(word) for line in statements), word
