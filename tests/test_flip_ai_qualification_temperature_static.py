from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = (ROOT / "lib/flip-ai/qualification.ts").read_text(encoding="utf-8")
BLOCK = ENGINE.split("The attendant's verdict sets the lead temperature when the qualification is created or revised")[1].split("return qualification;")[0]


def test_temperature_is_applied_inside_the_qualification_transaction():
    assert "summarizeFlipAiQualificationScore(parsed.data).temperature" in BLOCK
    assert "await db.lead.updateMany({" in BLOCK
    assert "prisma.lead" not in BLOCK
    # A replay of an already settled verdict returns before any temperature change.
    assert ENGINE.index("if (existing && !revising) return existing;") < ENGINE.index(
        "The attendant's verdict sets the lead temperature when the qualification is created or revised")


def test_only_flip_ai_leads_of_the_same_company_that_nobody_edited_are_changed():
    for guard in ["id: leadId,", "tenantId: input.runtime.tenantId,", "source: 'flip_ai',",
                  "temperature: { in: replaceable, not: temperature },"]:
        assert guard in BLOCK, guard
    assert ": [FLIP_AI_CAPTURE_DEFAULT_TEMPERATURE];" in BLOCK
    assert "action: 'lead.updated'," in BLOCK and "userId: { not: null }," in BLOCK
    assert "existing && editedByPerson === 0" in BLOCK
    assert "FLIP_AI_CAPTURE_DEFAULT_TEMPERATURE = 'warm' as const;" in ENGINE


def test_only_the_temperature_changes_and_it_is_audited():
    assert "data: { temperature }," in BLOCK
    for forbidden in ["stageId", "pipelineId", "assignedTo", "delete", "leadStageHistory"]:
        assert forbidden not in BLOCK, forbidden
    assert "action: 'lead.flip_ai_temperature_applied'," in BLOCK
    assert "applied.count === 1" in BLOCK


def test_a_verdict_is_only_ever_upgraded_never_downgraded_or_rewritten():
    rule = ENGINE.split("const revising = Boolean(existing)")[1].split("if (existing && !revising) return existing;")[0]
    assert "existing?.classification === 'disqualified' || existing?.classification === 'insufficient'" in rule
    assert "parsed.data.classification === 'qualified' || parsed.data.classification === 'nurture'" in rule
    assert "await db.flipAiQualification.update({ where: { id: existing.id }, data: verdict })" in ENGINE
    assert "'flip_ai.qualification.revised'" in ENGINE
    assert "previousClassification: existing.classification" in ENGINE
    # A qualified verdict still needs a validated Lead, on creation and on revision alike.
    assert ENGINE.index("parsed.data.classification === 'qualified' && !leadId") < ENGINE.index("const verdict = {")


def test_attendant_is_told_it_may_reassess_a_recovered_conversation():
    chat = (ROOT / "lib/flip-ai/public-chat.ts").read_text(encoding="utf-8")
    assert "reavalie: finalize qualification outra vez com a nova classificação" in chat
