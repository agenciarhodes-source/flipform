from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = "prisma/migrations/20261011150000_agent_audio_mode/migration.sql"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_company_setting_limits_audio_and_the_attendant_is_told():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "getAgentAudioMode({ tenantId: runtimeContext.tenantId, agentId: runtimeContext.id })" in route
    assert "mode: audioMode," in route
    assert "const modeNote = audioModeNote(audioMode);" in route
    rules = read("lib/flip-ai/audio-reply.ts")
    assert "if (mode === 'never' || !input.reply.trim()) return false;" in rules
    assert "return mode === 'auto' && input.reply.trim().length > FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS;" in rules


def test_missing_setting_or_column_means_automatic_mode_and_never_an_error():
    setting = read("lib/flip-ai/agent-speech-setting.ts")
    get = setting.split("export async function getAgentAudioMode")[1].split("async function ownedAgent")[0]
    assert "return FLIP_AI_DEFAULT_AUDIO_MODE;" in get and "throw" not in get
    save = setting.split("export async function saveAgentAudioMode")[1]
    assert save.index("await ownedAgent(session, agentId);") < save.index("prisma.agentSpeechSetting.upsert(")


def test_migration_only_adds_one_column_with_a_default():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = chr(10).join(lines).upper()
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT ", "CREATE TABLE"]:
        assert forbidden not in sql, forbidden
    assert sql.count("ADD COLUMN") == 1
    assert "DEFAULT 'AUTO'" in sql
    assert "flip_ai" not in Path(MIGRATION).parent.name
    assert 'aria-label="Quando responder em áudio"' in read("components/flip-ai/agent-voice-picker.tsx")


def test_audio_only_on_request_is_the_default_for_every_attendant():
    rules = read("lib/flip-ai/audio-reply.ts")
    assert "FLIP_AI_DEFAULT_AUDIO_MODE: FlipAiAudioMode = 'on_request';" in rules
    setting = read("lib/flip-ai/agent-speech-setting.ts")
    assert "create: { agentId, tenantId, voice, audioMode: FLIP_AI_DEFAULT_AUDIO_MODE, updatedById: userId }," in setting
    assert "(recomendado)" in read("components/flip-ai/agent-voice-picker.tsx")
