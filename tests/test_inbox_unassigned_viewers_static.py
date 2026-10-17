from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_chosen_attendants_also_see_conversations_nobody_has():
    access = read("lib/inbox/access.ts")
    assert "...(session.seesUnassigned ? [UNASSIGNED_CONVERSATION_WHERE] : [])," in access
    assert "{ assignedTo: session.userId }," in access  # each attendant still sees her own
    viewers = read("lib/inbox/unassigned-viewers.ts")
    assert "if (session.role !== 'agent') return true;" in viewers
    assert "return [];" in viewers  # nobody chosen means the behavior from before
    migration = read("prisma/migrations/20261017120000_whatsapp_unassigned_viewers/migration.sql")
    assert "ADD COLUMN IF NOT EXISTS" in migration and "DROP" not in migration.upper()


def test_only_chosen_attendants_take_free_conversations_and_only_free_ones():
    claim = read("app/api/inbox/conversations/[id]/claim/route.ts")
    assert "if (!(await seesUnassignedConversations(session))) {" in claim
    ownership = read("lib/inbox/ownership.ts")
    assert "where: { id: conversation.id, tenantId: input.tenantId, assignedTo: null }," in ownership
    outbound = read("lib/meta/whatsapp-outbound.ts")
    assert "const mayClaim = await seesUnassignedConversations(" in outbound


def test_integrations_lets_the_company_choose_the_attendants():
    route = read("app/api/inbox/whatsapp-settings/route.ts")
    assert "where: { tenantId, role: 'agent', status: 'active' }," in route
    assert "viewers = Array.from(new Set(parsed.data.unassignedViewerUserIds)).filter((id) => allowed.has(id));" in route
    ui = read("app/(app)/integrations/integrations-client.tsx")
    assert "Conversas sem responsável no WhatsApp" in ui
    inbox = read("app/(app)/inbox/inbox-client.tsx")
    assert "<OwnerBadge owner={conversationOwner(conversation, currentUserId)} />" in inbox
    assert "{claiming ? 'Assumindo...' : 'Assumir'}" in inbox
