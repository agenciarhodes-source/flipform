#!/usr/bin/env python3
"""PR01 Phase 8: DDL rehearsal ONLY on CI runner's disposable local Postgres.

This module refuses any other DB. Production/Neon migrations and rollback are
not implemented. This rehearsal verifies the SQL, inserts harmless fixtures,
proves RESTRICT preserves audit and attempts, then drops ONLY empty PR01 tables in local CI.
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
FIXTURE_TENANT_ID = "986d31cc-785d-455c-95fa-7a3915e66fc2"
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
    delta_text = Path(delta_sql).read_text(encoding="utf-8")
    sql_report = audit(baseline_schema, candidate_schema, delta_text)
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
    restrict_count = scalar(
        "SELECT COUNT(*) FROM pg_constraint c "
        "JOIN pg_class t ON c.conrelid=t.oid "
        "JOIN pg_namespace n ON t.relnamespace=n.oid "
        f"WHERE n.nspname='public' AND t.relname IN ({added_list}) "
        "AND c.contype='f' AND c.confdeltype='r';"
    )
    if restrict_count != 10:
        raise ValueError("Expected ten RESTRICT FKs in additive PR01 schema")

    # Only fake records on isolated loopback PostgreSQL, never production.
    # Both the tenant->audit and outbox->attempt deletion MUST fail.
    psql(f"""INSERT INTO tenants (id, name, slug, updated_at)
             VALUES ('{FIXTURE_TENANT_ID}', 'PR01 restricted deletion fixture',
                     'pr01-rehearsal-restrict', NOW());""")
    psql(f"""INSERT INTO api_v1_integrations
             (id, tenant_id, display_name, status, updated_at)
             VALUES ('{INTEGRATION_ID}', '{FIXTURE_TENANT_ID}',
                     'synthetic retention guard', 'disabled', NOW());""")
    psql(f"""INSERT INTO api_v1_credential_audits
             (id, tenant_id, integration_id, credential_id, actor_user_id, action)
             VALUES ('a7804b77-4149-4f0e-88df-2f6ea847ff13',
                     '{FIXTURE_TENANT_ID}', '{INTEGRATION_ID}', 'synthetic-credential',
                     'synthetic-actor', 'issued');""")
    idem_id = "51d89f18-b8fa-48b5-88ed-aa70a2d93413"
    inbox_id = "3c221347-96a2-4314-a9b2-778d917ee148"
    outbox_id = "bf4b51c5-b07d-4e3c-8c42-14eaed763d0a"
    attempt_id = "44a805e4-6d0a-4966-b298-219e6b1a0a30"
    psql(f"""INSERT INTO api_v1_idempotency_records
             (id, tenant_id, integration_id, operation, key_hash, fingerprint)
             VALUES ('{idem_id}', '{FIXTURE_TENANT_ID}', '{INTEGRATION_ID}',
                     'diagnostic.ping', repeat('a', 64), repeat('b', 64));""")
    psql(f"""INSERT INTO api_v1_inbox_events
             (id, tenant_id, integration_id, idempotency_record_id, event_type, payload_hash)
             VALUES ('{inbox_id}', '{FIXTURE_TENANT_ID}', '{INTEGRATION_ID}',
                     '{idem_id}', 'diagnostic.ping', repeat('c', 64));""")
    psql(f"""INSERT INTO api_v1_outbox_events
             (id, tenant_id, integration_id, inbox_event_id, event_type, updated_at)
             VALUES ('{outbox_id}', '{FIXTURE_TENANT_ID}', '{INTEGRATION_ID}',
                     '{inbox_id}', 'diagnostic.ping', NOW());""")
    psql(f"""INSERT INTO api_v1_delivery_attempts
             (id, tenant_id, integration_id, outbox_event_id, attempt_no)
             VALUES ('{attempt_id}', '{FIXTURE_TENANT_ID}', '{INTEGRATION_ID}',
                     '{outbox_id}', 1);""")
    def assert_restricted_delete(table, identifier):
        # A PostgreSQL FK violation is the ONLY accepted reason for denial.
        psql(f"""DO $restricted$
        BEGIN
          BEGIN
            DELETE FROM "{table}" WHERE id = '{identifier}';
            RAISE EXCEPTION 'PR01_UNEXPECTED_DELETE_ALLOWED';
          EXCEPTION WHEN foreign_key_violation THEN
            NULL;
          END;
        END $restricted$;""")

    assert_restricted_delete("tenants", FIXTURE_TENANT_ID)
    assert_restricted_delete("api_v1_outbox_events", outbox_id)
    audit_preserved = scalar(
        f"SELECT COUNT(*) FROM api_v1_credential_audits WHERE tenant_id='{FIXTURE_TENANT_ID}'"
    ) == 1
    attempts_preserved = scalar(
        f"SELECT COUNT(*) FROM api_v1_delivery_attempts WHERE outbox_event_id='{outbox_id}'"
    ) == 1
    if not audit_preserved or not attempts_preserved:
        raise ValueError("PR01 protected history was silently deleted")
    if scalar(f"SELECT COUNT(*) FROM tenants WHERE id='{FIXTURE_TENANT_ID}'") != 1:
        raise ValueError("Parent deleted despite RESTRICT")

    # CI-only explicit cleanup of fake rows, in dependent-to-parent order.
    # No hard-delete code path is added to the running application.
    psql(f"""BEGIN;
             DELETE FROM api_v1_delivery_attempts WHERE tenant_id='{FIXTURE_TENANT_ID}';
             DELETE FROM api_v1_outbox_events WHERE tenant_id='{FIXTURE_TENANT_ID}';
             DELETE FROM api_v1_inbox_events WHERE tenant_id='{FIXTURE_TENANT_ID}';
             DELETE FROM api_v1_idempotency_records WHERE tenant_id='{FIXTURE_TENANT_ID}';
             DELETE FROM api_v1_credential_audits WHERE tenant_id='{FIXTURE_TENANT_ID}';
             DELETE FROM api_v1_integrations WHERE tenant_id='{FIXTURE_TENANT_ID}';
             DELETE FROM tenants WHERE id='{FIXTURE_TENANT_ID}';
             COMMIT;""")
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
        "restrict_foreign_keys": restrict_count,
        "tenant_delete_rejected_by_fk": True,
        "outbox_delete_rejected_by_fk": True,
        "audit_preserved": audit_preserved,
        "delivery_attempts_preserved": attempts_preserved,
        "retention_policy_still_pending": True,
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
        args.delta_sql,
    )
    Path(args.report).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PR01 LOCAL migration+rollback rehearsal succeeded; production remains BLOCKED")


if __name__ == "__main__":
    main()
