"""Signed contracts: authenticated webhook, state fetched again, file kept, AI check, customer told, Gojus task."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_webhook_is_authenticated_and_does_not_trust_the_payload():
    route = read("app/api/webhooks/zapsign/[tenantId]/route.ts")
    assert "zapSignWebhookAuthorized(req.headers.get('authorization'), secret)" in route
    lib = read("lib/contracts/zapsign-signed.ts")
    assert "`${ZAPSIGN_API_BASE}/docs/${encodeURIComponent(docToken)}/`" in lib
    assert "WHERE id = ${contract.id} AND status = 'sent'" in lib


def test_signed_file_is_a_pdf_kept_with_the_lead():
    lib = read("lib/contracts/zapsign-signed.ts")
    assert "toString('latin1') !== '%PDF-'" in lib
    assert "CONTRACT_RETENTION_DAYS = 365 * 5" in lib
    assert "clientMessageId: `contract:${contract.id}`" in lib


def test_problems_go_to_the_customer_and_a_new_link_follows():
    lib = read("lib/contracts/zapsign-signed.ts")
    assert "contractFixMessage(firstName, check.problems)" in lib
    assert "sendContractIfReady({ tenantId, conversationId: contract.conversation_id, agent: null })" in lib
    # If WhatsApp does not allow telling the customer, the team gets a task.
    assert "contractIssueTask(" in lib


def test_complete_contract_creates_the_one_hour_gojus_task():
    lib = read("lib/contracts/zapsign-signed.ts")
    assert "gojusTask({" in lib and "dueInMinutes: 60" in lib
    assert "signedThanksMessage(firstName)" in lib


def test_reminder_runs_with_the_ai_jobs_and_webhook_is_registered_on_new_token():
    assert "sweepUnsignedContracts()" in read("app/api/internal/jobs/whatsapp-ai/route.ts")
    assert "registerZapSignWebhook(session.tenantId, parsed.data.apiToken)" in read("app/api/contracts/zapsign/route.ts")
    assert "tests/zapsign-signed-rules.test.ts" in read(".github/workflows/ci.yml")


def test_plain_route_handlers_take_params_as_a_promise():
    # Next.js 15: a route handler that is not wrapped receives `params` as a Promise; the build fails otherwise.
    import re
    api = ROOT / "app" / "api"
    wrong = []
    for path in api.rglob("route.ts"):
        text = path.read_text(encoding="utf-8")
        if re.search(r"export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*params: \{", text):
            wrong.append(str(path.relative_to(api)))
    assert not wrong, wrong
