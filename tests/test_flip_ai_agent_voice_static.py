from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SETTING = "lib/flip-ai/agent-speech-setting.ts"
MIGRATION = "prisma/migrations/20261011120000_agent_speech_settings/migration.sql"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_voice_is_chosen_only_for_an_attendant_of_the_callers_company():
    setting = read(SETTING)
    owned = setting.split("async function ownedAgent")[1].split("export async function readAgentSpeechVoice")[0]
    assert "await requireFlipAiAccess(db, session);" in owned
    assert "where: { id: agentId, tenantId }" in owned
    save = setting.split("export async function saveAgentSpeechVoice")[1]
    assert "FLIP_AI_SPEECH_VOICES.find((candidate) => candidate === rawVoice)" in save
    assert save.index("await ownedAgent(session, agentId);") < save.index("prisma.agentSpeechSetting.upsert(")


def test_attendant_without_a_choice_or_without_the_table_uses_the_default_voice():
    setting = read(SETTING)
    get = setting.split("export async function getAgentSpeechVoice")[1].split("async function ownedAgent")[0]
    assert "return FLIP_AI_DEFAULT_SPEECH_VOICE;" in get and "throw" not in get
    route = read("app/api/flip-ai/public/[slug]/speech/route.ts")
    assert "getAgentSpeechVoice({ tenantId: runtimeContext.tenantId, agentId: runtimeContext.id })" in route


def test_sample_is_a_fixed_sentence_for_signed_in_managers_and_is_rate_limited():
    sample = read("app/api/flip-ai/voices/sample/route.ts")
    assert "requireFlipAiAccess(db, session)" in sample
    assert "synthesizeReplySpeech({ text: SAMPLE_TEXT, voice })" in sample
    assert "flip-ai:voice-sample:user:" in sample
    # The sentence spoken is never taken from the request.
    assert "body as { voice?: unknown }" in sample and "text?:" not in sample


def test_setting_lives_in_its_own_table_and_the_picker_is_in_the_attendant_card():
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = chr(10).join(lines).upper()
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT ", "ALTER TABLE"]:
        assert forbidden not in sql, forbidden
    assert sql.count("CREATE TABLE") == 1
    assert "flip_ai" not in Path(MIGRATION).parent.name
    assert '@@map("agent_speech_settings")' in read("prisma/schema.prisma")
    assert "<AgentVoicePicker agentId={agent.id} />" in read("components/flip-ai/agent-draft-manager.tsx")
