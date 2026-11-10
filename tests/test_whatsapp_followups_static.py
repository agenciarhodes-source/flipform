"""Sequência de retomada: additive tables, starts off, one template per step and silence, call task, runs every minute."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_migration_is_additive_and_starts_off():
    sql = read("prisma/migrations/20261111120000_whatsapp_followups/migration.sql")
    statements = re.sub(r"ON (DELETE|UPDATE) (CASCADE|SET NULL)", "", sql.upper())
    for word in ["DROP ", "ALTER TABLE", "DELETE ", "UPDATE ", "TRUNCATE"]:
        assert word not in statements
    assert '"enabled" BOOLEAN NOT NULL DEFAULT false' in sql
    assert 'UNIQUE ("conversation_id", "cycle_at", "step")' in sql


def test_sweep_locks_each_step_and_respects_opt_outs():
    lib = read("lib/whatsapp-ai/followups.ts")
    assert "ON CONFLICT DO NOTHING" in lib
    assert "optOuts.has(optOutPhone(conversation.wa_id))" in lib
    assert "FOLLOWUP_MAX_PER_COMPANY_PER_RUN" in lib
    assert "systemSender: { label: 'Retomada' }" in lib
    assert "step === settings.call_after_step" in lib and "createUrgentTeamTask(" in lib


def test_runs_with_the_ai_jobs_and_has_a_screen():
    assert "sweepWhatsAppFollowups()" in read("app/api/internal/jobs/whatsapp-ai/route.ts")
    assert "withPermission('INTEGRATIONS_MANAGE'" in read("app/api/whatsapp-ai/followups/route.ts")
    assert "<FollowupManager />" in read("app/(app)/whatsapp-ai/page.tsx")
    assert "tests/whatsapp-followup-rules.test.ts" in read(".github/workflows/ci.yml")
