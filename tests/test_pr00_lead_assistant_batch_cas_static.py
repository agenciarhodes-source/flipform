"""PR00 P0: assistant bulk stage moves/undo only emit history after committed CAS."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / "lib/lead-assistant/service.ts").read_text(encoding="utf-8")


def test_stage_apply_uses_per_lead_cas_not_group_write():
    apply = SRC.split("export async function applyLeadPlan", 1)[1].split("if (plan.action === 'tag')", 1)[0]
    assert "pipelineByLead = new Map(moves.leads.map" in apply
    assert "tx.pipelineStage.findFirst({" in apply
    assert "isArchived: false, pipeline: { tenantId: session.tenantId, isArchived: false }" in apply
    assert "id: change.leadId" in apply
    assert "pipelineId," in apply
    assert "stageId: change.fromStageId" in apply
    assert "status: change.fromStatus as 'open' | 'lost'" in apply
    assert "if (updated.count !== 1) throw new LeadAssistantError(409, STALE_PREVIEW);" in apply
    assert apply.index("if (updated.count !== 1)") < apply.index("await tx.leadStageHistory.createMany")
    assert "const groups = new Map<string, string[]>()" not in apply


def test_stage_undo_only_histories_actual_restores_and_skips_archived_stages():
    undo = SRC.split("export async function undoLeadBatch", 1)[1]
    stage = undo.split("if (kind === 'stage')", 1)[1].split("} else if (kind === 'tag')", 1)[0]
    assert "select: { id: true, pipelineId: true, stageId: true, status: true }" in stage
    assert "id: change.fs, pipelineId: lead.pipelineId, isArchived: false" in stage
    assert "stageId: change.ts" in stage
    assert "status: change.tst as 'open' | 'lost'" in stage
    assert "if (updated.count === 1) restore.push(change)" in stage
    assert stage.index("if (updated.count === 1) restore.push(change)") < stage.index("await tx.leadStageHistory.createMany")
    assert "if (restore.length)" in stage


def test_stage_transactions_are_serializable_and_http_race_is_409():
    assert SRC.count("isolationLevel: Prisma.TransactionIsolationLevel.Serializable") == 2
    for path in ["app/api/leads/assistant/apply/route.ts", "app/api/leads/assistant/undo/route.ts"]:
        text = (ROOT / path).read_text(encoding="utf-8")
        assert "PrismaClientKnownRequestError" in text
        assert "error.code === 'P2034'" in text
        assert "status: 409" in text


def test_batch_stage_does_not_emit_conversions():
    assert "dispatchKanbanStageTracking" not in SRC
    assert "enqueueGoogleConversionEvents" not in SRC
    assert "scheduleGoogleConversionDelivery" not in SRC


def test_assignment_batch_and_undo_have_cas_and_real_audit_count():
    apply = SRC.split("export async function applyLeadPlan", 1)[1].split("type AssignChange", 1)[0]
    assert "const observed = new Map(distribution.leads.map" in apply
    assert "assignedTo: change.from" in apply
    assert "data: { assignedTo: change.to }" in apply
    assert "if (updated.count !== 1) throw new LeadAssistantError(409, STALE_PREVIEW)" in apply
    undo = SRC.split("export async function undoLeadBatch", 1)[1]
    assign = undo.split("} else {", 1)[-1]
    assert "status: 'open', assignedTo: change.t" in assign
    assert "if (updated.count === 1) confirmed.push(change)" in assign
    assert "restored = confirmed.length" in assign


def test_tag_batch_cas_enforces_previous_array_state_and_audits_only_updated():
    helper = SRC.split("async function writeTags", 1)[1].split("/** Applies a confirmed plan.", 1)[0]
    assert "RETURNING l.id" in helper
    assert 'l.tags = ARRAY(SELECT jsonb_array_elements_text(v."previousTags"))' in helper
    assert "WHERE l.id = v.id AND l.tenant_id = ${tenantId}" in helper
    apply = SRC.split("export async function applyLeadPlan", 1)[1].split("type AssignChange", 1)[0]
    assert "if (updatedTags.length !== tagged.changes.length) throw new LeadAssistantError(409, STALE_PREVIEW)" in apply
    undo = SRC.split("export async function undoLeadBatch", 1)[1]
    assert "const restoredIds = new Set(await writeTags(" in undo
    assert "const confirmed = restore.filter((change) => restoredIds.has(change.l))" in undo
    assert "restored = confirmed.length" in undo
