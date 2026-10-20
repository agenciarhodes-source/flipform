from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_ai_shows_typing_while_preparing_the_answer():
    typing = read("lib/meta/whatsapp-typing.ts")
    assert "typing_indicator: { type: 'text' }" in typing
    assert "status: 'read'" in typing
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "void showWhatsAppTyping({ phoneNumberId, accessToken: typingToken, messageId: latestInbound.externalMessageId });" in reply


def test_ai_introduces_itself_with_the_companys_text_and_no_name():
    reply = read("lib/whatsapp-ai/reply.ts")
    assert "return text || `assistente de ${companyName}`;" in reply
    assert "apresente-se apenas como ${input.introduction}, sem dizer nome próprio." in reply
    assert "Nunca diga que é uma pessoa." in reply
    assert "assistente virtual de ${input.companyName}" not in reply
    assert "introduction: z.string().trim().max(120).nullable().optional().default(null)," in read("lib/whatsapp-ai/settings.ts")
    assert 'introduction     String?  @map("introduction")' in read("prisma/schema.prisma")
    migration = read("prisma/migrations/20261024120000_whatsapp_ai_introduction/migration.sql")
    assert 'ADD COLUMN IF NOT EXISTS "introduction" TEXT' in migration
    assert "Como a IA se apresenta" in read("components/whatsapp-ai/settings-manager.tsx")
