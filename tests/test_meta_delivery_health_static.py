from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_meta_health_warns_and_resends_with_the_original_time():
    capi = read("lib/tracking/meta-capi.ts")
    assert "event_time: Math.floor((payload.eventTime ? payload.eventTime.getTime() : Date.now()) / 1000)," in capi
    tracking = read("lib/tracking.ts")
    assert "eventTime: context.eventTime || null," in tracking
    assert "if (!canReplayMetaEvent(log, now)) { summary.tooOld += 1; continue; }" in tracking
    assert "metaLeadEventId: log.source === 'public_form' ? log.eventId : null," in tracking
    health = read("app/api/integrations/meta-delivery/health/route.ts")
    assert "withPermission('INTEGRATIONS_VIEW'" in health
    assert "metaAccessTokenEncrypted: true" in health and "hasPermanentToken" in health
    # The token itself is never returned.
    assert "accessToken:" not in health
    replay = read("app/api/integrations/meta-delivery/replay/route.ts")
    assert "withPermission('INTEGRATIONS_EDIT'" in replay
    assert "<MetaDeliveryHealth />" in read("app/(app)/integrations/integrations-client.tsx")
