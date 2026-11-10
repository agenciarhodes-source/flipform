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
    assert "? reactivationKey(conversation.id, conversation.lastInboundAt!)" in sweep
    assert ": earlyReactivationKey(conversation.id, conversation.lastInboundAt!);" in sweep
    assert "idempotencyKey: requestKey," in sweep
    assert "aiSender: { agentId: agent.id, agentName: agent.name }," in sweep
    assert "isTestPhoneNumber(number.testPhoneNumbers" in sweep


def test_reminders_use_documents_jev_moment_and_memory():
    sweep = (ROOT / "lib/whatsapp-ai/reactivation.ts").read_text(encoding="utf-8")
    assert "conversationDocumentContext(number.tenantId, conversation.id)" in sweep
    assert "loadLatestConversationMemory(" in sweep
    assert "metadata?.decisionSnapshot" in sweep
    assert "earlyReactivationDue(candidate, now)" in sweep


def test_never_forward_to_an_attendant_wording():
    voice = (ROOT / "lib/flip-ai/team-voice.ts").read_text(encoding="utf-8")
    assert "PROIBIDO dizer \"vou encaminhar\"" in voice
    assert "TEAM_VOICE_RULE" in (ROOT / "lib/instagram-ai/rules.ts").read_text(encoding="utf-8")
