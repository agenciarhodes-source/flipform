"""PR00 A2-C.10: Prisma 5.22 offline compatibility probe (no DB access)."""
import json
import os
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT / "tests" / "fixtures" / "pr00_a2c10"
BRANCH = "security/pr00-a2c10-prisma-compat-probes-20261117"


def prisma(*args):
    cli = ROOT / "node_modules" / ".bin" / "prisma"
    assert cli.exists(), "CI must install pinned Prisma 5.22 first"
    env = dict(os.environ)
    # Invalid local socket: any unintended connection fails.
    env["DATABASE_URL"] = "postgresql://invalid:invalid@127.0.0.1:1/pr00_a2c10_offline?schema=public"
    return subprocess.run([str(cli), *map(str, args)], cwd=ROOT, env=env,
                          capture_output=True, text=True, timeout=90, check=False)


def output(proc):
    return (proc.stdout or "") + "\n" + (proc.stderr or "")


def schema_diff(schema_file):
    return prisma("migrate", "diff", "--from-empty",
                  "--to-schema-datamodel", schema_file, "--script")


def test_prisma_exact_version():
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    assert pkg["dependencies"]["prisma"] == "5.22.0"
    assert pkg["dependencies"]["@prisma/client"] == "5.22.0"
    probe = prisma("--version")
    assert probe.returncode == 0, output(probe)[-2000:]
    assert re.search(r"(?m)^prisma\s*:\s*5\.22\.0\b", output(probe)), output(probe)[-1600:]


def test_restrict_composite_fk_offline_validation_and_sql_generation():
    source = FIX / "optional-composite-restrict.prisma"
    validated = prisma("validate", "--schema", source)
    assert validated.returncode == 0, output(validated)[-4000:]
    diff = schema_diff(source)
    assert diff.returncode == 0, output(diff)[-4000:]
    sql = diff.stdout
    assert "a2c10_child" in sql and "a2c10_parent" in sql
    assert re.search(r"FOREIGN KEY\s*\([^)]*parent_id[^)]*tenant_id[^)]*\)", sql, flags=re.I), sql[-2500:]
    assert "ON DELETE RESTRICT" in sql, sql[-2500:]


def test_setnull_probe_never_silently_approves_clearing_tenant():
    source = FIX / "optional-composite-set-null.prisma"
    validated = prisma("validate", "--schema", source)
    if validated.returncode != 0:
        msg = output(validated)[-3000:]
        assert any(x.lower() in msg.lower() for x in ["SetNull", "onDelete", "referential"]), msg
        pytest.xfail("A2-C.10 BLOCKED: Prisma 5.22 rejected composite optional SetNull")

    diff = schema_diff(source)
    if diff.returncode != 0:
        msg = output(diff)[-3000:]
        assert any(x.lower() in msg.lower() for x in ["SetNull", "onDelete", "referential"]), msg
        pytest.xfail("A2-C.10 BLOCKED: Prisma 5.22 could not generate SetNull SQL safely")
    sql = diff.stdout
    assert "ON DELETE SET NULL" in sql and "a2c10_child" in sql, sql[-3000:]
    if not re.search(r'ON DELETE SET NULL\s*\(\s*"?parent_id"?\s*\)', sql, flags=re.I):
        pytest.xfail("A2-C.10 BLOCKED: SQL does not limit SET NULL to parent_id; tenant_id at risk")
    # Even this success would not validate Prisma db pull / client disconnect / drift.


def test_prisma_lab_is_deployment_disabled_and_gate_explicit():
    rules = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))["git"]["deploymentEnabled"]
    assert rules[BRANCH] is False
    assert rules["security/pr00-a2c5-tenant-task-stage-20261117"] is False
    doc = (ROOT / "docs/security/pr00-a2c10-compatibility.md").read_text(encoding="utf-8")
    assert "GATE BLOQUEADO" in doc
    assert "ON DELETE SET NULL (parent_id)" in doc
