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


def test_lead_modal_opens_internal_whatsapp_inbox_only_for_authorized_lead_with_phone():
    modal = read('components/lead-detail-modal.tsx')
    assert 'const openWhatsAppConversation = async () => {' in modal
    assert 'fetch(`/api/inbox/leads/${encodeURIComponent(leadId)}/whatsapp-conversation`' in modal
    assert 'window.location.assign(`/inbox?conversationId=${encodeURIComponent(data.conversationId)}`);' in modal
    assert '{lead.canContactWhatsApp && lead.phone && (' in modal
    assert 'title="Abrir conversa no WhatsApp"' in modal
    assert 'aria-label={`Abrir conversa do WhatsApp de ${lead.name}`}' in modal
    assert "import { buildWhatsAppUrl } from '@/lib/whatsapp-link';" not in modal
    assert 'href={whatsappUrl}' not in modal
    assert 'target="_blank"' not in modal
    assert '<Phone className="w-3 h-3" />{lead.phone}' in modal
    assert '{lead.canDelete && <Button' in modal
    assert 'flex flex-wrap items-start justify-between' in modal


def test_internal_whatsapp_conversation_resolution_is_tenant_scoped():
    route = read('app/api/inbox/leads/[id]/whatsapp-conversation/route.ts')
    assert "withPermission('INBOX_VIEW'" in route
    assert 'tenantId: session.tenantId' in route
    assert "...(session.role === 'agent' ? { assignedTo: session.userId } : {})" in route
    assert 'findOrLinkWhatsAppConversationForLead({' in route
    assert 'findAccessibleInboxConversation(session, resolved.conversationId)' in route


def test_whatsapp_lead_phone_matching_accepts_brazilian_mobile_alias_with_or_without_ninth_digit():
    leads = read('lib/leads.ts')
    linking = read('lib/conversations/whatsapp-lead-linking.ts')
    route = read('app/api/leads/route.ts')

    assert 'export function getBrazilianPhoneAliases' in leads
    assert "normalized.length === 13 && normalized[4] === '9'" in leads
    assert "normalized.length === 12 && /^[6-9]$/.test(normalized[4])" in leads
    assert 'export function normalizeBrazilianLeadPhone' in leads
    assert 'return getBrazilianPhoneAliases(phone);' in linking
    assert 'normalizeBrazilianLeadPhone(parsed.data.phone)' in route
    assert "phone: { in: getBrazilianPhoneAliases(phone).filter(candidate => candidate.startsWith('55')) }" in route
