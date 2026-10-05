from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr348_availability_is_part_of_existing_structured_turn_without_second_ai_call():
    chat = read("lib/flip-ai/public-chat.ts")
    policy = read("lib/flip-ai/availability-policy.ts")
    loader = read("lib/flip-ai/availability.ts")
    assert "availabilityPatch: flipAiAvailabilityPatchSchema" in chat
    assert "required: ['reply', 'identity', 'qualification', 'memoryPatch', 'availabilityPatch']" in chat
    for content in [policy, loader]:
        for forbidden in ["executeFlipAiConversationResponse", "streamOpenAiText", "runJevConversationDecision", "fetch("]:
            assert forbidden not in content


def test_pr348_backend_permission_is_the_hard_gate_for_availability():
    policy = read("lib/flip-ai/availability-policy.ts")
    chat = read("lib/flip-ai/public-chat.ts")
    assert "if (!input.permission.mayCollectAvailability) return input.previous || null" in policy
    assert "availabilityPatchInstructions(actionPermission)" in chat
    assert "Não extraia data, período ou horário para agenda quando o backend não autorizou" in policy


def test_pr348_modalities_are_derived_from_eligibility_not_model_output():
    policy = read("lib/flip-ai/availability-policy.ts")
    chat = read("lib/flip-ai/public-chat.ts")
    assert "deriveAvailabilityModalities" in policy
    assert "eligibility.visitRequested" in policy
    assert "eligibility.productDemoRequested" in policy
    assert "required: ['preferredDate', 'preferredPeriod', 'preferredTime']" in chat
    assert "modalities: z.array" in policy


def test_pr348_relative_dates_are_preserved_not_normalized_to_iso():
    policy = read("lib/flip-ai/availability-policy.ts")
    assert 'como "sexta-feira", "amanhã", "dia 12" ou "qualquer dia"' in policy
    assert "não converta datas relativas para ISO" in policy
    assert "preferredTime use HH:MM apenas quando a pessoa disser um horário explícito" in policy


def test_pr348_progressive_collection_uses_existing_state_and_does_not_repeat_questions():
    policy = read("lib/flip-ai/availability-policy.ts")
    chat = read("lib/flip-ai/public-chat.ts")
    assert "ready_for_handoff" in policy
    assert "Não pergunte novamente dia, período ou horário" in policy
    assert "pergunte somente o período ou horário preferido" in policy
    assert "Pergunte somente o dia ou data preferida" in policy
    assert "DISPONIBILIDADE JÁ COLETADA" in chat


def test_pr348_availability_is_persisted_only_in_confirmed_chat_metadata():
    loader = read("lib/flip-ai/availability.ts")
    chat = read("lib/flip-ai/public-chat.ts")
    assert "tenantId: input.tenantId" in loader
    assert "conversationId: input.conversationId" in loader
    assert "operation: 'chat_response'" in loader
    assert "status: 'confirmed'" in loader
    assert "availabilityVersion: FLIP_AI_AVAILABILITY_VERSION" in chat
    assert "availabilitySnapshot" in chat
    assert "recoverConfirmedOutbound" in chat


def test_pr348_handoff_exposes_availability_without_claiming_booking():
    handoff = read("lib/flip-ai/human-handoff-policy.ts")
    server = read("lib/flip-ai/human-handoff.ts")
    modal = read("components/lead-detail-modal.tsx")
    assert "loadLatestConversationAvailability" in server
    assert "availability: FlipAiAvailabilitySnapshot | null" in handoff
    assert "Confirmar disponibilidade e combinar o atendimento presencial com a pessoa." in handoff
    assert "Preferência para atendimento presencial" in modal
    assert "Nenhum horário foi reservado ou confirmado." in modal


def test_pr348_does_not_create_calendar_event_or_new_schema():
    files = [
        read("lib/flip-ai/availability-policy.ts"),
        read("lib/flip-ai/availability.ts"),
        read("lib/flip-ai/public-chat.ts"),
        read("lib/flip-ai/human-handoff-policy.ts"),
    ]
    combined = "\n".join(files)
    for forbidden in [
        "createAppointment(", "calendar.create", "prisma.appointment.create",
        "prisma.event.create", "Google Calendar", "ALTER TABLE", "CREATE TABLE",
    ]:
        assert forbidden not in combined


def test_pr348_remains_chat_web_only():
    availability = read("lib/flip-ai/availability.ts").lower()
    policy = read("lib/flip-ai/availability-policy.ts").lower()
    chat = read("lib/flip-ai/public-chat.ts")
    assert "provider: 'flip_ai'" in chat
    assert "channel: 'web'" in chat
    assert "whatsapp" not in availability
    assert "whatsapp" not in policy
