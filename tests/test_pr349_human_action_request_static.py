from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pr349_reuses_existing_task_model_without_schema_or_migration():
    schema = read("prisma/schema.prisma")
    service = read("lib/flip-ai/human-action-request.ts")
    assert "model Task {" in schema
    assert "db.task.create" in service
    assert "FlipAiHumanActionRequest" not in schema
    for forbidden in ["ALTER TABLE", "CREATE TABLE", "DROP TABLE"]:
        assert forbidden not in service


def test_pr349_creates_request_only_from_confirmed_ready_availability_and_linked_web_lead():
    service = read("lib/flip-ai/human-action-request.ts")
    assert "availability?.status !== 'ready_for_handoff'" in service
    assert "provider: 'flip_ai'" in service
    assert "channel: 'web'" in service
    assert "conversation?.leadId !== lead.id" in service
    assert "tenant?.plan?.canUseTasks === false" in service


def test_pr349_request_is_idempotent_and_provenance_checked():
    policy = read("lib/flip-ai/human-action-request-policy.ts")
    service = read("lib/flip-ai/human-action-request.ts")
    assert "createHash('sha256')" in policy
    assert "in-person-confirmation" in policy
    assert "pg_advisory_xact_lock(hashtext" in service
    assert "flip_ai.action_request.created" in service
    assert "!sourceAudit" in service
    assert "FLIP_AI_ACTION_REQUEST_CONTEXT_CONFLICT" in service


def test_pr349_never_assigns_or_moves_the_lead():
    service = read("lib/flip-ai/human-action-request.ts")
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "assignedTo = activeAssignee?.userId || null" in service
    assert "createdBy: null" in service
    assert "syncFlipAiHumanActionRequest" in route
    for forbidden in [
        "prisma.lead.update",
        "db.lead.update",
        "moveLead(",
        "stageId:",
        "pipelineId:",
    ]:
        assert forbidden not in service


def test_pr349_public_reply_completes_before_internal_request_sync_and_sync_is_non_blocking():
    route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "await completePublicChatTurn(" in route
    assert "await trySyncHumanActionRequest({" in route
    assert route.index("await completePublicChatTurn(") < route.rindex("await trySyncHumanActionRequest({")
    assert "Internal human-action task creation never invalidates a confirmed customer reply." in route
    assert "catch {" in route


def test_pr349_human_resolution_uses_existing_task_rbac_and_audit():
    api = read("app/api/leads/[id]/flip-ai/action-request/route.ts")
    service = read("lib/flip-ai/human-action-request.ts")
    assert "assertCanAccessLead(session, lead)" in api
    assert "canCompleteTask(session.role" in api
    assert "flip_ai.action_request.confirmed" in service
    assert "flip_ai.action_request.declined" in service
    assert "flip_ai.action_request.reopened" in service
    assert "FLIP_AI_ACTION_REQUEST_ALREADY_RESOLVED" in service


def test_pr349_confirmation_is_internal_only_and_creates_no_calendar_commitment():
    service = read("lib/flip-ai/human-action-request.ts")
    policy = read("lib/flip-ai/human-action-request-policy.ts")
    modal = read("components/lead-detail-modal.tsx")
    assert "Nenhum horário foi reservado ou confirmado" in policy
    assert "Confirmar atendimento" in modal
    assert "Não confirmar" in modal
    assert "Reabrir solicitação" in modal
    assert "não cria evento" in modal
    assert "não cria agenda" in modal
    combined = "\n".join([service, policy, modal]).lower()
    for forbidden in [
        "createappointment(",
        "calendar.create",
        "prisma.appointment.create",
        "prisma.event.create",
        "google calendar",
    ]:
        assert forbidden not in combined


def test_pr349_lead_api_exposes_request_after_existing_rbac_guard():
    api = read("app/api/leads/[id]/route.ts")
    assert "getFlipAiHumanActionRequest" in api
    assert "flipAiHumanActionRequest" in api
    assert api.index("assertCanAccessLead(session, lead)") < api.index("getFlipAiHumanActionRequest({")
    assert "canResolve: canCompleteTask" in api


def test_pr349_remains_chat_web_only_and_does_not_touch_whatsapp_runtime():
    service = read("lib/flip-ai/human-action-request.ts").lower()
    policy = read("lib/flip-ai/human-action-request-policy.ts").lower()
    public_route = read("app/api/flip-ai/public/[slug]/messages/route.ts")
    assert "provider: 'flip_ai'" in service
    assert "channel: 'web'" in service
    assert "whatsapp" not in service
    assert "whatsapp" not in policy
    assert "syncFlipAiHumanActionRequest" in public_route
