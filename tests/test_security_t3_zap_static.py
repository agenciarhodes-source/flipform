from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/zap.yml").read_text(encoding="utf-8")


def test_weekly_and_on_demand():
    assert "cron: '0 10 * * 1'" in WORKFLOW
    assert "workflow_dispatch:" in WORKFLOW


def test_baseline_only_against_staging_never_production():
    assert "zap-baseline.py" in WORKFLOW
    for forbidden in ["zap-full-scan.py", "zap-api-scan.py", "app.flipform.com.br", "admin.flipform.com.br"]:
        assert forbidden not in WORKFLOW, forbidden
    assert "TARGET: https://flipform-staging.vercel.app" in WORKFLOW


def test_pinned_read_only_and_without_secrets():
    assert "ZAP_IMAGE: ghcr.io/zaproxy/zaproxy:2.17.0" in WORKFLOW
    assert "permissions:\n  contents: read" in WORKFLOW
    assert "secrets." not in WORKFLOW


def test_security_headers_and_cookies_must_hold():
    rules = (ROOT / ".zap/rules.tsv").read_text(encoding="utf-8")
    for rule in ["10020\tFAIL", "10021\tFAIL", "10035\tFAIL", "10038\tFAIL", "10010\tFAIL", "10011\tFAIL"]:
        assert rule in rules, rule
