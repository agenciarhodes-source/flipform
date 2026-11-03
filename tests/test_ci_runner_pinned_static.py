from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_every_job_runs_on_a_fixed_ubuntu_version():
    # ubuntu-latest moved to Ubuntu 26 in October 2026 and the browser and database setup broke;
    # a fixed version only changes when we change it here.
    for workflow in sorted((ROOT / ".github/workflows").glob("*.yml")):
        text = workflow.read_text(encoding="utf-8")
        assert "ubuntu-latest" not in text, workflow.name
        for line in text.splitlines():
            if "runs-on:" in line:
                assert line.strip() == "runs-on: ubuntu-24.04", (workflow.name, line)
