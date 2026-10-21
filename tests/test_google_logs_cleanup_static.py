from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_no_more_fake_google_lead_and_real_funnel_in_logs():
    tracking = read("lib/tracking.ts")
    assert "syntheticMappings.push({ provider: 'google_ads'" not in tracking
    logs = read("lib/tracking/logs.ts")
    assert "if (log.status === 'not_dispatched') continue;" in logs
    route = read("app/api/integrations/event-logs/route.ts")
    assert "status: { not: 'not_dispatched' }" in route
    assert "googleEvents.map(googleFunnelLogRow)" in route
    assert "NO_IDENTIFIER" in read("lib/tracking/google-funnel-log.ts")
