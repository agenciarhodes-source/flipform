from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_whatsapp_permission_is_limited_to_lead_roles_that_can_contact():
    rbac = read('lib/rbac.ts')
    assert "LEADS_CONTACT_WHATSAPP: ['owner', 'admin', 'manager', 'agent']" in rbac
    assert "LEADS_CONTACT_WHATSAPP: ['owner', 'admin', 'manager', 'agent', 'viewer']" not in rbac


def test_lead_detail_calculates_contact_permission_after_scoped_access():
    route = read('app/api/leads/[id]/route.ts')
    assert "import { can } from '@/lib/rbac';" in route
    assert 'assertCanAccessLead(session, lead)' in route
    assert route.index('assertCanAccessLead(session, lead)') < route.index("can(session.role, 'LEADS_CONTACT_WHATSAPP')")
    assert "canContactWhatsApp: can(session.role, 'LEADS_CONTACT_WHATSAPP')" in route
    assert 'tenantId: session.tenantId' in route


def test_lead_modal_renders_safe_whatsapp_link_only_for_authorized_valid_phone():
    modal = read('components/lead-detail-modal.tsx')
    assert "import { buildWhatsAppUrl } from '@/lib/whatsapp-link';" in modal
    assert 'const whatsappUrl = buildWhatsAppUrl(lead.phone);' in modal
    assert '{lead.canContactWhatsApp && whatsappUrl && (' in modal
    assert 'href={whatsappUrl}' in modal
    assert 'target="_blank"' in modal
    assert 'rel="noopener noreferrer"' in modal
    assert 'title="Conversar pelo WhatsApp"' in modal
    assert 'aria-label={`Conversar com ${lead.name} pelo WhatsApp`}' in modal
    assert '<Phone className="w-3 h-3" />{lead.phone}' in modal
    assert '{lead.canDelete && <Button' in modal
    assert 'flex flex-wrap items-start justify-between' in modal
