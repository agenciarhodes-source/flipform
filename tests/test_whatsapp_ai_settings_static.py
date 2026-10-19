from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_whatsapp_ai_settings_table_is_additive_and_starts_switched_off():
    migration = read("prisma/migrations/20261020120000_whatsapp_ai_settings/migration.sql")
    assert 'CREATE TABLE IF NOT EXISTS "tenant_whatsapp_ai_settings"' in migration
    assert '"enabled" BOOLEAN NOT NULL DEFAULT false' in migration
    statements = migration.replace("ON DELETE", "").replace("ON UPDATE", "")
    for forbidden in ("DROP ", "ALTER TABLE", "DELETE ", "UPDATE "):
        assert forbidden not in statements
    assert "model TenantWhatsAppAiSettings {" in read("prisma/schema.prisma")
    # The Flip AI tables have an audited structure; this table must not add links to them.
    assert "flip_ai_" not in migration.split("CREATE INDEX")[0].split("CONSTRAINT", 1)[1]


def test_only_owners_and_admins_with_flip_ai_configure_it_for_their_own_numbers():
    route = read("app/api/whatsapp-ai/settings/route.ts")
    assert route.count("withPermission('FLIP_AI_MANAGE'") == 2
    lib = read("lib/whatsapp-ai/settings.ts")
    assert "await requireFlipAiAccess(prisma, session);" in lib
    assert "where: { id: input.connectionId, tenantId: access.tenantId }," in lib
    assert "where: { id: input.agentId, tenantId: access.tenantId, status: 'published' }," in lib
    assert "action: 'whatsapp_ai.settings_updated'," in lib
    # Saving settings never answers anyone by itself: there is no sending here.
    assert "whatsapp-outbound" not in lib


def test_menu_shows_atendimento_whatsapp_to_flip_ai_managers():
    shell = read("components/app-shell.tsx")
    assert '{ href: "/whatsapp-ai", label: "Atendimento WhatsApp", icon: MessageCircle, permission: "FLIP_AI_MANAGE" },' in shell
    ui = read("components/whatsapp-ai/settings-manager.tsx")
    assert "a IA começará a responder no WhatsApp quando o atendimento automático for liberado" in ui
