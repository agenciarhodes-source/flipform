#!/usr/bin/env python3
"""PR01: offline, read-only Prisma schema delta and additive SQL review.

Runs on two local schema files and a generated SQL text file; it never opens a
database connection, performs migrations or accesses secrets. Review is not
permission to execute SQL in Neon, staging, or production.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from pr00_a2c2_audit_sql import PR01_ADDITIVE_MODELS, split_statements

MODEL = re.compile(r"(?ms)^model\s+(\w+)\s*\{(.*?)^\}")
ENUM = re.compile(r"(?ms)^enum\s+(\w+)\s*\{(.*?)^\}")
TABLE = re.compile(r'^CREATE\s+TABLE\s+(?:"public"\.)?"([^"]+)"\s*\(', re.I | re.S)
INDEX = re.compile(r'^CREATE\s+(?:UNIQUE\s+)?INDEX\s+"[^"]+"\s+ON\s+(?:"public"\.)?"([^"]+)"\b', re.I | re.S)
FK = re.compile(
    r'^ALTER\s+TABLE\s+(?:"public"\.)?"([^"]+)"\s+ADD\s+CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\b',
    re.I | re.S,
)

# Only these relation-only fields are expected in the pre-existing Tenant
# model. They do not create columns; anything else requires manual rejection.
ALLOWED_INVERSE_RELATIONS = {
    "Tenant": {
        "apiV1Integrations ApiIntegration[]",
        "apiV1EntitlementGrants TenantEntitlementGrant[]",
        "apiV1CredentialAudits ApiCredentialAudit[]",
    }
}

def sha(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def parse_models(schema):
    blocks = MODEL.findall(schema)
    names = [name for name, _ in blocks]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate model identifiers")
    return dict(blocks)

def normalized_model(model_name, body):
    inverse = ALLOWED_INVERSE_RELATIONS.get(model_name, set())
    return [
        line.strip() for line in body.splitlines()
        if line.strip() and not line.strip().startswith(("///", "//"))
        and line.strip() not in inverse
    ]

def check_schema_delta(base, candidate):
    before, after = parse_models(base), parse_models(candidate)
    required = set(PR01_ADDITIVE_MODELS)
    if len(before) != 92 or len(after) != 102:
        raise ValueError("Expected 92 baseline and 102 candidate models")
    if set(after) != set(before) | required or set(before) & required:
        raise ValueError("Unexpected model added/removed; only ten PR01 models permitted")
    for name, body in before.items():
        if normalized_model(name, body) != normalized_model(name, after[name]):
            raise ValueError(f"Existing Prisma model changed: {name}")
    if ENUM.findall(base) != ENUM.findall(candidate):
        raise ValueError("Existing enums changed")
    physical = []
    for name in required:
        match = re.search(r'@@map\("([^"]+)"\)', after[name])
        if not match or match.group(1) != PR01_ADDITIVE_MODELS[name]:
            raise ValueError("Unexpected physical PR01 table")
        physical.append(match.group(1))
    if len(set(physical)) != len(required):
        raise ValueError("Duplicate physical PR01 table names")
    return set(physical)

def check_sql(sql, expected):
    parsed = split_statements(sql)
    found, indexes, constraints = [], 0, 0
    for idx, statement in enumerate(parsed, 1):
        match = TABLE.match(statement)
        if match:
            if match.group(1) not in expected:
                raise ValueError(f"Statement {idx}: CREATE TABLE outside PR01 allowlist")
            found.append(match.group(1))
            continue
        match = INDEX.match(statement)
        if match:
            if match.group(1) not in expected:
                raise ValueError(f"Statement {idx}: CREATE INDEX touches baseline table")
            indexes += 1
            continue
        match = FK.match(statement)
        if match:
            if match.group(1) not in expected:
                raise ValueError(f"Statement {idx}: ALTER TABLE touches baseline table")
            constraints += 1
            continue
        # Reject INSERT/UPDATE/DELETE, DROP, ALTER COLUMN, CREATE TYPE, views,
        # extensions, data changes and every other unreviewed SQL construct.
        raise ValueError(f"Statement {idx}: SQL outside additive PR01 allowlist")
    if set(found) != expected or len(found) != len(expected):
        raise ValueError("Generated SQL must create exactly ten PR01 tables once")
    if not indexes or not constraints:
        raise ValueError("Expected PR01 index and foreign-key statements missing")
    return {
        "pass_offline_sql_delta": True,
        "NOT_AUTHORIZED_FOR_EXECUTION": True,
        "tables_added": len(found),
        "indexes_added": indexes,
        "foreign_keys_added": constraints,
        "statements": len(parsed),
        "table_names": sorted(found),
    }

def audit(base, candidate, sql):
    expected = check_schema_delta(base, candidate)
    result = check_sql(sql, expected)
    result.update({
        "source": "prisma migrate diff --from-schema-datamodel --to-schema-datamodel",
        "baseline_sha256": sha(base),
        "candidate_sha256": sha(candidate),
        "sql_sha256": sha(sql),
        "manual_gates": [
            "Review all generated SQL/foreign keys and cascade effects",
            "Confirm baseline matches exact target database, not merely main",
            "Test additive migration and rollback in isolated disposable environment",
            "Obtain independent authorization for ANY Neon or production DDL",
        ],
    })
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--sql", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    result_path = Path(args.report)
    try:
        result = audit(
            Path(args.baseline).read_text(encoding="utf-8"),
            Path(args.candidate).read_text(encoding="utf-8"),
            Path(args.sql).read_text(encoding="utf-8"),
        )
    except ValueError as exc:
        result_path.write_text(json.dumps({
            "pass_offline_sql_delta": False, "NOT_AUTHORIZED_FOR_EXECUTION": True,
            "error": str(exc),
        }, indent=2) + "\n", encoding="utf-8")
        raise SystemExit("BLOCKED: " + str(exc)) from None
    result_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PR01 offline schema SQL diff passes allowlist; NOT approved for execution")

if __name__ == "__main__":
    main()
