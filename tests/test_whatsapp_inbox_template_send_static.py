from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_only_approved_text_templates_without_variables_can_be_sent():
    templates = read("lib/meta/whatsapp-templates.ts")
    block = templates.split("export function toSendableWhatsAppTemplate", 1)[1].split("export async function listSendableWhatsAppTemplates", 1)[0]
    assert "!== 'APPROVED') return null;" in block
    assert "if (JSON.stringify(components).includes('{{')) return null;" in block
    assert "!== 'TEXT') return null;" in block


def test_template_text_and_approval_come_from_meta_never_from_the_browser():
    route = read("app/api/conversations/[id]/messages/whatsapp-template/route.ts")
    assert "withPermission('LEADS_CONTACT_WHATSAPP'" in route
    assert "await loadSendableWhatsAppTemplates(session.tenantId)" in route
    assert "text: template.body," in route
    assert "template: { name: template.name, language: template.language }," in route
    schema = route.split("const bodySchema = z.object({", 1)[1].split("}).strict();", 1)[0]
    assert "body" not in schema and "text" not in schema
    assert route.index("const template = templates.find(") < route.index("await enqueueAndDispatchWhatsAppTextMessage({")


def test_outbound_queue_sends_the_template_and_keeps_free_text_unchanged():
    outbound = read("lib/meta/whatsapp-outbound.ts")
    assert "? { type: 'template', template: { name: input.template.name, language: { code: input.template.language } } }" in outbound
    assert ": { type: 'text', text: { preview_url: false, body: input.text } };" in outbound
    assert "template: begun.metadata.template," in outbound
    # A template goes out exactly as approved: no attendant signature is added.
    assert "...(signature.signature && !template ? { agentSignature: signature.signature } : {})," in outbound
