from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_npm_waits_seven_days_before_accepting_a_new_version():
    lines = [line.strip() for line in (ROOT / ".npmrc").read_text(encoding="utf-8").splitlines()]
    assert "min-release-age=7" in lines
    assert "registry=https://registry.npmjs.org/" in lines


def test_lockfile_sync_runs_on_an_npm_that_honours_the_wait():
    # lts/* ships npm 11, which applies min-release-age; npm 10 would ignore it.
    workflow = (ROOT / ".github/workflows/sync-lockfile.yml").read_text(encoding="utf-8")
    assert "node-version: lts/*" in workflow
