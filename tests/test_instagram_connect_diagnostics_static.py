from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_callback_reports_where_it_stopped_without_secrets():
    route = (ROOT / "app/api/integrations/instagram/callback/route.ts").read_text(encoding="utf-8")
    for stage in ["'state'", "'rate_limit'", "'no_code'", "'not_ready'", "'authorization_code_exchange'",
                  "'long_lived_token_exchange'", "'profile_validation'", "'webhook_subscription'", "'save'"]:
        assert stage in route, stage
    assert "url.searchParams.set('stage', stage)" in route
    assert "url.searchParams.set('code', code)" in route
    assert "safeProviderCode(" in route
    # Nothing from Meta but the numeric code is passed on.
    assert "error.message)" not in route.split("function redirect")[1].split("export const GET")[0]


def test_card_shows_the_stage_message_and_cleans_the_address():
    card = (ROOT / "app/(app)/integrations/instagram-business-login-card.tsx").read_text(encoding="utf-8")
    assert "instagramConnectStageMessage(stage, safeProviderCode(code))" in card
    assert "url.searchParams.delete('stage');" in card and "url.searchParams.delete('code');" in card


def test_account_match_has_its_own_stage_and_big_ids_stay_exact():
    route = (ROOT / "app/api/integrations/instagram/callback/route.ts").read_text(encoding="utf-8")
    assert "stage = 'account_match';" in route
    stages = (ROOT / "lib/meta/instagram-connect-stages.ts").read_text(encoding="utf-8")
    assert "case 'account_match':" in stages
    helper = (ROOT / "lib/meta/instagram.ts").read_text(encoding="utf-8")
    assert "payload = parseMetaJson(text)" in helper
