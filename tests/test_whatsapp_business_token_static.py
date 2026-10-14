from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_every_call_on_the_customer_account_prefers_its_own_business_token():
    for path in [
        "lib/meta/whatsapp-outbound.ts",
        "lib/meta/whatsapp-sendable-templates.ts",
        "app/api/integrations/whatsapp/templates/route.ts",
        "app/api/integrations/whatsapp/registration/route.ts",
        "lib/meta/whatsapp-connection-health.ts",
    ]:
        source = read(path)
        assert "connectionAccessToken(connection.accessTokenEncrypted)" in source, path


def test_the_business_token_never_reaches_the_browser():
    for path in [
        "app/api/integrations/whatsapp/connection/route.ts",
        "app/api/inbox/whatsapp-templates/route.ts",
    ]:
        assert "accessToken" not in read(path), path
    complete = read("app/api/integrations/whatsapp/embedded-signup/complete/route.ts")
    response = complete.split("return clearSignupState(NextResponse.json({\n      connection: {", 1)[-1].split("}));", 1)[0]
    assert "accessToken" not in response
