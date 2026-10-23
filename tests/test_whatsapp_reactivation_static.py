from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_reactivation_is_an_option_off_by_default():
    migration = read("prisma/migrations/20261029120000_whatsapp_ai_reactivation/migration.sql")
    assert 'ADD COLUMN IF NOT EXISTS "reactivation_enabled" BOOLEAN NOT NULL DEFAULT false' in migration
    assert "DROP" not in migration
    settings = read("lib/whatsapp-ai/settings.ts")
    assert "reactivationEnabled: z.boolean().optional().default(false)," in settings
    ui = read("components/whatsapp-ai/settings-manager.tsx")
    assert "Mensagem de reativação (23h)" in ui


def test_reactivation_runs_with_the_scheduler_once_per_silence_and_as_the_ai():
    job = read("app/api/internal/jobs/whatsapp-ai/route.ts")
    assert "sweepWhatsAppReactivations()" in job
    sweep = read("lib/whatsapp-ai/reactivation.ts")
    assert "reactivationEnabled: true" in sweep
    assert "const requestKey = reactivationKey(conversation.id, conversation.lastInboundAt!);" in sweep
    assert "idempotencyKey: requestKey," in sweep
    assert "aiSender: { agentId: agent.id, agentName: agent.name }," in sweep
    assert "isTestPhoneNumber(number.testPhoneNumbers" in sweep
