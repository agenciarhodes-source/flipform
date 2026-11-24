"""PR 00 A2-C.5 — security regression guards for tenant/agent task scope and stage coherence."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_agent_task_list_and_create_are_scoped_to_own_tenant_lead():
    src = read("app/api/leads/[id]/tasks/route.ts")
    assert src.count("canAccessLeadTasks(session, lead)") == 2
    assert src.count("where: { id: ctx.params.id, tenantId: session.tenantId }") == 2
    assert "assignsToSelfOrNone" not in src
    assert "where: { tenantId: session.tenantId, leadId: lead.id }" in src
    assert "where: { tenantId: session.tenantId, userId: data.assignedTo, status: 'active' }" in src


def test_task_update_and_delete_check_tenant_link_and_agent_lead_ownership():
    src = read("app/api/leads/[id]/tasks/[taskId]/route.ts")
    assert src.count("canAccessLeadTasks(session, task.lead)") == 2
    assert src.count("lead: { tenantId: session.tenantId }") == 2
    assert src.count("tenantId: session.tenantId, leadId: ctx.params.id") == 2
    assert "canEditTask(" in src and "canCompleteTask(" in src and "canDeleteTask(" in src


def test_task_statistics_apply_role_permission_and_agent_scope():
    src = read("app/api/tasks/stats/route.ts")
    assert "withPermission('TASKS_VIEW'" in src
    assert "getTaskScopeForRole(session)" in src
    assert src.count("tenantId: session.tenantId, ...taskScope") == 5


def test_manual_stage_movement_requires_original_pipeline_and_tenant():
    src = read("app/api/leads/[id]/move/route.ts")
    assert "where: { id: ctx.params.id, tenantId: session.tenantId }" in src
    assert "where: { id: stageId, pipelineId: lead.pipelineId, pipeline: { tenantId: session.tenantId } }" in src
    assert "canMoveLead(session.role, lead, session.userId)" in src
    assert "pipelineId: lead.pipelineId" in read("lib/leads/move-stage.ts")


def test_automation_does_not_accept_foreign_tenant_lead():
    src = read("lib/tasks/team-task.ts")
    assert "where: { id: input.leadId, tenantId: input.tenantId }" in src
    assert "if (!ownLead) return 0" in src


def test_only_this_branch_opted_out_of_vercel_without_removing_existing_blocks():
    config = json.loads(read("vercel.json"))
    rules = config["git"]["deploymentEnabled"]
    assert rules["security/pr00-a2c5-tenant-task-stage-20261117"] is False
    assert rules["audit/pr00-a2s-isolation"] is False
    assert rules["audit/pr00-a2c2-prisma-sql-offline-20261117"] is False
