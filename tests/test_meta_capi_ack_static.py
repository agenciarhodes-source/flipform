from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_meta_capi_success_requires_provider_ack_when_count_is_explicit():
    source = read('lib/tracking/meta-capi.ts')

    assert 'export function parseMetaCapiSuccess' in source
    assert 'payload.events_received' in source
    assert 'eventsReceived === 0' in source
    assert "ok: false" in source
    assert 'Meta CAPI não confirmou o recebimento do evento' in source
    assert 'return parseMetaCapiSuccess(responseData)' in source


def test_meta_capi_ack_keeps_trace_for_diagnostics_without_exposing_credentials():
    source = read('lib/tracking/meta-capi.ts')

    assert 'payload.fbtrace_id' in source
    assert 'traceId' in source
    assert 'eventsReceived' in source
    result_type = source.split('export type MetaCapiSendResult', 1)[1].split('};', 1)[0]
    assert 'accessToken' not in result_type
    assert 'pixelId' not in result_type


def test_http_error_path_still_uses_structured_meta_error_formatter():
    source = read('lib/tracking/meta-capi.ts')

    assert 'if (!res.ok)' in source
    assert 'formatMetaCapiError(responseData' in source
    assert 'Meta CAPI HTTP ${res.status}' in source
