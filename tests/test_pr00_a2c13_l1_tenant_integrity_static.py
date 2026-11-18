"""PR00 A2-C.13: offline static L1 tenant integrity regression checks."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BRANCH = "security/pr00-a2c13-l1-crm-tenant-integrity-20261117"

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def test_l1_sql_only_is_lab_locked_and_never_a_prod_migration():
    sql = read("docs/security/pr00-a2c13-l1-lab-only.sql")
    assert "NEVER RUN IN PRODUCTION" in sql
    assert "br-blue-dawn-bckyng6d" in sql
    assert "holy-fog-36254823" in sql
    assert "A2C13 STOP" in sql
    assert sql.count("ADD CONSTRAINT a2c13_") == 8
    assert sql.count("VALIDATE CONSTRAINT a2c13_") == 5
    assert "DROP TABLE" not in sql and "DELETE FROM" not in sql and "TRUNCATE " not in sql
    assert "ON DELETE CASCADE" in sql and "ON DELETE RESTRICT" in sql

def test_l1_known_api_writers_scope_tenant_and_pipeline():
    lead = read("app/api/leads/route.ts")
    move = read("app/api/leads/[id]/move/route.ts")
    form = read("app/api/forms/route.ts")
    form_update = read("app/api/forms/[id]/route.ts")
    tasks = read("app/api/leads/[id]/tasks/route.ts")
    edit = read("app/api/leads/[id]/tasks/[taskId]/route.ts")
    helper = read("lib/tasks/team-task.ts")
    assert "tenantId: session.tenantId" in lead
    assert "pipelineId: parsed.data.pipelineId" in lead
    assert "pipelineId: lead.pipelineId" in move
    assert "tenantId: session.tenantId" in move
    assert "validatePipelineAndStage(session.tenantId" in form
    assert "validatePipelineAndStage(session.tenantId" in form_update
    assert tasks.count("canAccessLeadTasks(session, lead)") == 2
    assert edit.count("canAccessLeadTasks(session, task.lead)") == 2
    assert "where: { id: input.leadId, tenantId: input.tenantId }" in helper

def test_l1_vercel_preview_disabled_and_gate_blocked():
    rules = json.loads(read("vercel.json"))["git"]["deploymentEnabled"]
    assert rules[BRANCH] is False
    assert rules["security/pr00-a2c5-tenant-task-stage-20261117"] is False
    assert rules["audit/pr00-a2s-isolation"] is False
    note = read("docs/security/pr00-a2c13-l1-validation.md")
    assert "NÃO HOMOLOGADO PARA PRODUÇÃO" in note
    assert "PR 01 continua bloqueado" in note or "PR 01 continua bloqueado" in note.replace("PR 01", "PR 01")
