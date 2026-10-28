"""Security protocol T2: a company never reaches another company's records.

Company routes read a record with the company in the query (findFirst with tenantId) and then work
on the id they got back. An id that comes straight from the request is never used alone in a
findUnique/update/delete, which would reach any company's record. Super Admin routes (admin/) work
across companies by design and are guarded by withPlatformAdmin.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "app/api"

REQUEST_ID = r"(ctx\.params\.\w+|params\.\w+|\(await ctx\.params\)\.\w+|parsed\.data\.\w+!?|body\.\w+)"
ID_ONLY_FROM_REQUEST = re.compile(r"where: \{ id: " + REQUEST_ID + r" \}")
LOOKUP = re.compile(r"\.(findFirst|findFirstOrThrow|findMany|count|updateMany|deleteMany)\(\{\s*where: \{ id: " + REQUEST_ID + r" \}")


def company_routes():
    for route in sorted(API.rglob("*.ts")):
        path = route.relative_to(API).as_posix()
        if path.startswith("admin/"):
            continue
        yield path, route.read_text(encoding="utf-8")


def test_no_company_route_uses_a_request_id_alone():
    offenders = [path for path, text in company_routes() if ID_ONLY_FROM_REQUEST.search(text) or LOOKUP.search(text)]
    assert not offenders, offenders


def test_record_routes_look_up_by_id_and_company_together():
    # The main records of a company, opened by the id in the address.
    for path, model in [
        ("leads/[id]/route.ts", "lead"),
        ("forms/[id]/route.ts", "form"),
        ("pipelines/[id]/route.ts", "pipeline"),
        ("invites/[id]/route.ts", "invite"),
        ("domains/[id]/route.ts", "customFormDomain"),
        ("integrations/events/[id]/route.ts", "kanbanStageTrackingEvent"),
    ]:
        text = (API / path).read_text(encoding="utf-8")
        compact = re.sub(r"\s+", " ", text)
        assert re.search(rf"prisma\.{model}\.findFirst\(\{{ where: \{{ id: [^}}]*tenantId: session\.tenantId", compact), path


def test_agents_only_reach_their_own_leads():
    rbac = (ROOT / "lib/rbac.ts").read_text(encoding="utf-8")
    assert "return session.role === 'agent' ? { assignedTo: session.userId } : {};" in rbac
    assert "if (session.role === 'agent' && lead.assignedTo !== session.userId) throw new Error('FORBIDDEN');" in rbac


def test_this_suite_runs_in_ci():
    ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    assert "tests/security-t2-rbac.test.ts" in ci
