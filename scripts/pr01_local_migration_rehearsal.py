#!/usr/bin/env python3
"""PR01 Phase 8: DDL rehearsal ONLY on CI runner's disposable local Postgres.

This module refuses any other DB. Production/Neon migrations and rollback are
not implemented. This rehearsal verifies the SQL, inserts harmless fixtures,
demonstrates audit cascade risk, and drops ONLY empty PR01 tables in local CI.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse, parse_qs

from pr01_offline_sql_diff_audit import audit
from pr00_a2c2_audit_sql import PR01_ADDITIVE_MODELS

DATABASE = "pr01_rehearsal"
BASELINE_TABLES = 92
NEW_TABLES = tuple(PR01_ADDITIVE_MODELS.values())
# Explicit reverse topological order. DROP never includes CASCADE or IF EXISTS.
DROP_ORDER = (
    "api_v1_delivery_attempts",
    "api_v1_outbox_events",
    "api_v1_inbox_events",
    "api_v1_idempotency_records",
    "api_v1_webhook_replays",
    "api_v1_quota_buckets",
    "api_v1_credential_audits",
    "api_v1_credentials",
    "tenant_entitlement_grants",
    "api_v1_integrations",
)
SENTINEL_ID = "7196e855-f764-4f56-a951-63ba13d97472"
CASCADE_ID = "986d31cc-785d-455c-95fa-7a3915e66fc2"
INTEGRATION_ID = "8328b79c-67f3-4a4d-88a3-685ae411b79a"


def guard(env):
    if env.get("CI") != "true" or env.get("GITHUB_ACTIONS") != "true" \
       or env.get("PR01_LOCAL_REHEARSAL") != "true":
        raise ValueError("Requires CI/GitHub Actions and explicit local rehearsal gate")
    raw = env.get("DATABASE_URL", "")
    try:
        u = urlparse(raw)
        valid = (u.scheme in ("postgresql", "postgres")
                 and u.hostname == "127.0.0.1" and u.port == 5432
                 and u.username == "postgres" and u.password == "postgres"
                 and u.path == f"/{DATABASE}"
                 and parse_qs(u.query) in ({}, {"schema": ["public"]}))
    except ValueError:
        valid = False
    if not valid or (env.get("DIRECT_URL") and env["DIRECT_URL"] != raw):
        raise ValueError("Refusing non-disposable or remote database")


def psql(query=None, sql_file=None):
    # Force loopback role/database in the argv, independent of PG* env settings.
    env = os.environ.copy()
    env.update({
        "PGHOST": "127.0.0.1", "PGPORT": "5432",
        "PGUSER": "postgres", "PGDATABASE": DATABASE,
        "PGPASSWORD": "postgres",
    })
    cmd = ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-q", "-A", "-t",
           "-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", DATABASE]
    cmd += ["-f", str(sql_file)] if sql_file else ["-c", query]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True,
                                text=True, env=env)
    except subprocess.CalledProcessError:
        raise ValueError("Disposable PostgreSQL validation failed; see CI details") from None
    return result.stdout.strip()


def scalar(query):
    return int(psql(query))


def table_count():
    return scalar("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';")


def assert_table_set(should_exist):
    tables = set(psql("SELECT tablename FROM pg_tables WHERE schemaname='public'").splitlines())
    for name in NEW_TABLES:
        if (name in tables) != should_exist:
            raise ValueError("PR01 table presence did not match expected migration state")


def assert_sentinel():
    if scalar(f"SELECT COUNT(*) FROM tenants WHERE id='{SENTINEL_ID}'") != 1:
        raise ValueError("Baseline sentinel tenant missing (data safety gate)")


def rehearsal(baseline_schema, candidate_schema, baseline_sql, delta_sql):
    # Validate every generated statement against the already-reviewed schemas
    # BEFORE touching the disposable database.
    sql_report = audit(baseline_schema, candidate_schema, delta_sql)
    if len(NEW_TABLES) != 10 or set(DROP_ORDER) != set(NEW_TABLES):
        raise ValueError("Rollback table inventory mismatch")
    if table_count() != 0:
        raise ValueError("Disposable DB must be empty before rehearsal")

    baseline_path = Path(baseline_sql)
    psql(sql_file=baseline_path)
    if table_count() != BASELINE_TABLES:
        raise ValueError("Baseline database did not create exactly 92 tables")
    assert_table_set(False)

    # Synthetic baseline record to prove the additive DDL and rollback preserve
    # pre-existing table data. Never use any real customer or tenant.
    psql(f"""INSERT INTO tenants (id, name, slug, updated_at)
             VALUES ('{SENTINEL_ID}', 'PR01 synthetic baseline sentinel',
                     'pr01-rehearsal-sentinel', NOW());""")
    assert_sentinel()

    # APPLY: local CI postgres only. No migration journal or production DDL.
    delta_path = Path(delta_sql)
    psql(sql_file=delta_path)
    if table_count() != BASELINE_TABLES + len(NEW_TABLES):
        raise ValueError("Expected exactly 102 tables after additive DDL")
    assert_table_set(True)
    assert_sentinel()
    added_list = ", ".join("'" + t + "'" for t in NEW_TABLES)
    cascade_count = scalar(
        "SELECT COUNT(*) FROM pg_constraint c "
        "JOIN pg_class t ON c.conrelid=t.oid "
        "JOIN pg_namespace n ON t.relnamespace=n.oid "
        f"WHERE n.nspname='public' AND t.relname IN ({added_list}) "
        "AND c.contype='f' AND c.confdeltype='c';"
    )
    if cascade_count != 10:
        raise ValueError("Cascade FK count differs from reviewed PR01 schema")

    # Demonstrate high-priority risk, WITHOUT touching any existing customer:
    # deleting a tenant removes their credential audit via ON DELETE CASCADE.
    psql(f"""INSERT INTO tenants (id, name, slug, updated_at)
             VALUES ('{CASCADE_ID}', 'PR01 synthetic cascade risk',
                     'pr01-rehearsal-cascade', NOW());""")
    psql(f"""INSERT INTO api_v1_integrations
             (id, tenant_id, display_name, status, updated_at)
             VALUES ('{INTEGRATION_ID}', '{CASCADE_ID}',
                     'synthetic cascade review', 'disabled', NOW());""")
    psql(f"""INSERT INTO api_v1_credential_audits
             (id, tenant_id, integration_id, credential_id, actor_user_id, action)
             VALUES ('a7804b77-4149-4f0e-88df-2f6ea847ff13',
                     '{CASCADE_ID}', '{INTEGRATION_ID}', 'synthetic-credential',
                     'synthetic-actor', 'issued');""")
    if scalar(f"SELECT COUNT(*) FROM api_v1_credential_audits WHERE tenant_id='{CASCADE_ID}'") != 1:
        raise ValueError("Audit fixture was not persisted")
    psql(f"DELETE FROM tenants WHERE id='{CASCADE_ID}';")
    audit_lost = scalar(
        f"SELECT COUNT(*) FROM api_v1_credential_audits WHERE tenant_id='{CASCADE_ID}'"
    ) == 0
    if not audit_lost:
        raise ValueError("Expected synthetic audit cascade risk not reproduced")
    assert_sentinel()

    # ROLLBACK REHEARSAL: NEVER used in production, never DROP with CASCADE.
    # Refuse to drop any table with data. No automatic customer rollback exists.
    for name in NEW_TABLES:
        if scalar(f'SELECT COUNT(*) FROM "{name}"') != 0:
            raise ValueError("Rollback refused: PR01 table is not empty")
    psql("BEGIN;\n" + "\n".join(
        f'DROP TABLE "{name}";' for name in DROP_ORDER) + "\nCOMMIT;")
    if table_count() != BASELINE_TABLES:
        raise ValueError("Local rollback did not return to 92 baseline tables")
    assert_table_set(False)
    assert_sentinel()
    return {
        "rehearsal_local_disposable_only": True,
        "production_migration_authorized": False,
        "baseline_tables": BASELINE_TABLES,
        "applied_tables": BASELINE_TABLES + len(NEW_TABLES),
        "rollback_tables": BASELINE_TABLES,
        "baseline_sentinel_preserved": True,
        "cascade_foreign_keys": cascade_count,
        "audit_deleted_on_synthetic_tenant_delete": audit_lost,
        "audit_cascade_requires_policy_decision": True,
        "local_sql_audit": sql_report,
        "production_rollback_not_implemented": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-schema", required=True)
    parser.add_argument("--candidate-schema", required=True)
    parser.add_argument("--baseline-sql", required=True)
    parser.add_argument("--delta-sql", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    guard(os.environ)
    result = rehearsal(
        Path(args.baseline_schema).read_text(encoding="utf-8"),
        Path(args.candidate_schema).read_text(encoding="utf-8"),
        args.baseline_sql,
        Path(args.delta_sql).read_text(encoding="utf-8"),
    )
    Path(args.report).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PR01 LOCAL migration+rollback rehearsal succeeded; production remains BLOCKED")


if __name__ == "__main__":
    main()
