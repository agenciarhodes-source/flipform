from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = (ROOT / "lib/flip-ai/qualification.ts").read_text(encoding="utf-8")
BLOCK = ENGINE.split("The attendant's verdict sets the lead temperature once")[1].split("return qualification;")[0]


def test_temperature_is_applied_once_inside_the_qualification_transaction():
    assert "summarizeFlipAiQualificationScore(parsed.data).temperature" in BLOCK
    assert "await db.lead.updateMany({" in BLOCK
    assert "prisma.lead" not in BLOCK
    # Runs only on the branch that creates the qualification, never on a replay.
    assert ENGINE.index("if (existing) return existing;") < ENGINE.index("The attendant's verdict sets the lead temperature once")


def test_only_untouched_flip_ai_leads_of_the_same_company_are_changed():
    for guard in ["id: leadId,", "tenantId: input.runtime.tenantId,", "source: 'flip_ai',",
                  "temperature: FLIP_AI_CAPTURE_DEFAULT_TEMPERATURE,"]:
        assert guard in BLOCK, guard
    assert "FLIP_AI_CAPTURE_DEFAULT_TEMPERATURE = 'warm' as const;" in ENGINE


def test_only_the_temperature_changes_and_it_is_audited():
    assert "data: { temperature }," in BLOCK
    for forbidden in ["stageId", "pipelineId", "assignedTo", "delete", "leadStageHistory"]:
        assert forbidden not in BLOCK, forbidden
    assert "action: 'lead.flip_ai_temperature_applied'," in BLOCK
    assert "applied.count === 1" in BLOCK
