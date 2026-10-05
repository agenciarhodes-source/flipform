from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr346_action_eligibility_is_deterministic_and_separate_from_score():
    policy = read("lib/flip-ai/action-eligibility.ts")
    score = read("lib/flip-ai/lead-intelligence-policy.ts")
    assert "FLIP_AI_ACTION_ELIGIBILITY_VERSION" in policy
    assert "EXPLICIT_THRESHOLD = 0.72" in policy
    assert "score" not in policy.lower()
    assert "classification" not in policy.lower()
    assert "resolveFlipAiActionEligibility" in score


def test_pr346_human_request_does_not_imply_in_person_or_agenda():
    policy = read("lib/flip-ai/action-eligibility.ts")
    assert "humanHandoffRequested" in policy
    assert "inPersonRequested" in policy
    assert "schedulingRequested" in policy
    assert "Há interesse ou necessidade de atendimento humano, sem evidência de que isso seja presencial." in policy
    assert "Um pedido para falar com uma pessoa não significa pedido de atendimento presencial." in policy


def test_pr346_jev_collects_action_signals_in_same_decision_call():
    jev = read("lib/flip-ai/jev-decision-engine.ts")
    for signal in [
        "human_handoff_interest",
        "in_person_interest",
        "visit_interest",
        "product_demo_interest",
        "scheduling_interest",
    ]:
        assert f"{signal}: noulAnswerSchema" in jev
        assert f"{signal}:" in jev
    assert "questions:" in jev
    assert "resolveFlipAiActionEligibility" in jev


def test_pr346_schedule_is_only_effective_after_in_person_and_scheduling_intent():
    policy = read("lib/flip-ai/action-eligibility.ts")
    assert "schedulingRequested && inPersonRequested" in policy
    assert "schedulingStatus = 'collect_availability'" in policy
    assert "input.rawNextAction === 'schedule' && !mayCollectAvailability" in policy
    assert "effectiveNextAction = 'ask_one_question'" in policy
    assert "effectiveNextAction = 'handoff'" in policy
    assert "effectiveNextAction = 'answer_directly'" in policy


def test_pr346_web_chat_receives_backend_action_policy_but_executes_nothing():
    chat = read("lib/flip-ai/public-chat.ts")
    assert "PERMISSÃO DE AÇÃO PRESENCIAL (regra determinística do backend)" in chat
    assert "actionPermissionPrompt(actionPermission)" in chat
    assert "A permissão acima é a autoridade sobre o que este agente pode oferecer" in chat
    assert "actionEligibility" in chat
    assert "actionPermission" in chat
    for forbidden in ["createAppointment(", "calendar.create", "prisma.appointment.create", "prisma.event.create"]:
        assert forbidden not in chat


def test_pr346_handoff_uses_effective_action_not_free_form_schedule_text():
    handoff = read("lib/flip-ai/human-handoff-policy.ts")
    assert "input.availability?.status === 'ready_for_handoff'" in handoff
    assert ": input.intelligence" in handoff
    assert "NEXT_ACTION_LABELS[input.intelligence.nextAction]" in handoff
    assert "intelligence.actionPermission.mayCollectAvailability" in handoff
    assert "input.intelligence?.actionEligibility.inPersonRequested" in handoff
    assert "Coletar preferência de disponibilidade para atendimento presencial, sem confirmar compromisso." in handoff


def test_pr346_lead_ui_explains_agenda_is_independent_from_score():
    modal = read("components/lead-detail-modal.tsx")
    assert "Agenda não indicada" in modal
    assert "Interesse presencial — confirmar se deseja marcar" in modal
    assert "Pode coletar preferência de dia/horário" in modal
    assert "Agenda é independente do score" in modal
    assert "não cria agenda" in modal


def test_pr346_has_no_schema_migration_or_business_action_execution():
    files = [
        read("lib/flip-ai/action-eligibility.ts"),
        read("lib/flip-ai/decision-engine.ts"),
        read("lib/flip-ai/jev-decision-engine.ts"),
        read("lib/flip-ai/human-handoff-policy.ts"),
    ]
    for content in files:
        for forbidden in [
            "ALTER TABLE", "CREATE TABLE", "DROP TABLE",
            "createAppointment(", "moveLead(", "prisma.lead.update(",
            "prisma.pipeline", "prisma.stage",
        ]:
            assert forbidden not in content


def test_pr346_remains_chat_web_only_and_does_not_touch_whatsapp_runtime():
    policy = read("lib/flip-ai/action-eligibility.ts").lower()
    chat = read("lib/flip-ai/public-chat.ts")
    assert "provider: 'flip_ai'" in chat
    assert "channel: 'web'" in chat
    assert "whatsapp" not in policy
