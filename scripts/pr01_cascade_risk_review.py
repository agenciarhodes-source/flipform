#!/usr/bin/env python3
"""Read-only PR01 foreign-key cascade inventory; NEVER approves migration."""
import argparse
import json
import re
from pathlib import Path

from pr00_a2c2_audit_sql import PR01_ADDITIVE_MODELS, split_statements

FK = re.compile(
    r'^ALTER\s+TABLE\s+(?:"public"\.)?"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"'
    r'\s+FOREIGN\s+KEY\s*\(([^)]*)\)\s+REFERENCES\s+(?:"public"\.)?"([^"]+)"'
    r'\s*\(([^)]*)\)\s+ON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|NO\s+ACTION|SET\s+DEFAULT)',
    re.I | re.S,
)

def assess(sql):
    names = set(PR01_ADDITIVE_MODELS.values())
    fk_rows = []
    for statement in split_statements(sql):
        if not re.match(r'^ALTER\s+TABLE\b', statement, re.I):
            continue
        found = FK.match(statement)
        if not found:
            raise ValueError("Unknown FK syntax: manual review required")
        child, constraint, columns, parent, ref_columns, on_delete = found.groups()
        if child not in names:
            raise ValueError("FK modifies an existing/non-PR01 table")
        if on_delete.upper() != "CASCADE":
            raise ValueError("FK action changed from the currently reviewed baseline")
        fk_rows.append({
            "child_table": child,
            "parent_table": parent,
            "constraint": constraint,
            "child_columns": [x.strip() for x in columns.split(",")],
            "parent_columns": [x.strip() for x in ref_columns.split(",")],
            "on_delete": on_delete.upper(),
        })
    if len(fk_rows) != 10:
        raise ValueError("Expected exactly 10 PR01 foreign keys")
    return {
        "inventory_complete": True,
        "production_migration_authorized": False,
        "fk_count": len(fk_rows),
        "fk_cascades": fk_rows,
        "release_blockers": [
            "Deleting tenant cascades into api_v1_credential_audits; audit history would be lost",
            "Deleting an integration cascades into credential, quota, event, and attempt history",
            "Deleting parent inbox/outbox or idempotency record may delete related attempt history",
            "Establish retention/legal-hold and tenant-deletion policy before accepting cascade behavior",
            "Confirm baseline schema and target database identity independently; disposable CI is not staging",
            "Review snapshot/backup, restore and forward-only rollback; no automatic production DROP TABLE",
        ],
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sql", required=True)
    ap.add_argument("--report", required=True)
    args = ap.parse_args()
    try:
        report = assess(Path(args.sql).read_text(encoding="utf-8"))
    except ValueError as exc:
        raise SystemExit(f"CASCADE REVIEW BLOCKED: {exc}") from None
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("PR01 CASCADE inventory complete: 10 FKs; production release remains BLOCKED")

if __name__ == "__main__":
    main()
