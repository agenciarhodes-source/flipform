from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github/workflows/security.yml").read_text(encoding="utf-8")


def test_every_push_and_a_weekly_full_scan():
    assert "push:\n    branches: ['**']" in WORKFLOW
    assert "cron: '0 9 * * 1'" in WORKFLOW


def test_workflow_is_read_only_and_uses_no_secrets():
    assert "permissions:\n  contents: read" in WORKFLOW
    assert "secrets." not in WORKFLOW
    for forbidden in ["DATABASE_URL", "vercel", "prisma"]:
        assert forbidden not in WORKFLOW, forbidden


def test_gitleaks_is_pinned_verified_and_redacted():
    assert "GITLEAKS_VERSION: 8.24.0" in WORKFLOW
    assert "sha256sum -c -" in WORKFLOW
    assert "--redact" in WORKFLOW
    assert '--log-opts="origin/main..HEAD"' in WORKFLOW
    config = (ROOT / ".gitleaks.toml").read_text(encoding="utf-8")
    assert "useDefault = true" in config


def test_semgrep_is_pinned_and_blocks_only_new_high_findings_on_branches():
    assert "SEMGREP_VERSION: 1.180.0" in WORKFLOW
    assert "--metrics=off" in WORKFLOW
    assert '--severity ERROR --error --baseline-commit "$(git merge-base origin/main HEAD)"' in WORKFLOW
    assert "p/owasp-top-ten" in WORKFLOW
