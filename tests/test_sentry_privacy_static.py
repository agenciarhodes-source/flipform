import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_sentry_is_on_11_with_opentelemetry_alerts_fixed():
    package = json.loads(read("package.json"))
    assert package["dependencies"]["@sentry/nextjs"] == "11.8.0"
    lock = json.loads(read("package-lock.json"))["packages"]
    assert lock["node_modules/@sentry/nextjs"]["version"] == "11.8.0"


def test_every_personal_data_category_is_off():
    privacy = read("sentry.privacy.ts")
    for line in [
        "userInfo: false",
        "cookies: false",
        "httpHeaders: false",
        "httpBodies: []",
        "urlQueryParams: false",
        "graphQL: { document: false, variables: false }",
        "genAI: { inputs: false, outputs: false }",
        "databaseQueryData: false",
        "queues: false",
        "stackFrameVariables: false",
    ]:
        assert line in privacy, line
    for field in ["headers", "cookies", "data", "query_string"]:
        assert f"delete event.request.{field};" in privacy
    assert "event.user = event.user?.id ? { id: event.user.id } : undefined;" in privacy


def test_every_runtime_uses_the_privacy_settings():
    for name in ["sentry.client.config.ts", "sentry.server.config.ts", "sentry.edge.config.ts"]:
        config = read(name)
        assert "dataCollection: sentryDataCollection" in config, name
        assert "beforeSend: stripPersonalData" in config, name
        assert "sendDefaultPii" not in config, name
        assert "tracesSampleRate: 0" in config, name
