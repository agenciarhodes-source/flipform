#!/usr/bin/env python3
"""Offline, fail-closed auditor: accepts only expected additive Prisma 5.22 DDL."""
import argparse
import hashlib
import json
import re
from pathlib import Path

def split_statements(content):
    if "/*" in content or "*/" in content:
        raise ValueError("Block comments are not permitted")
    # Prisma migrate diff emits standalone -- comments (e.g. -- CreateTable).
    content = re.sub(r"(?m)^\s*--[^\n]*(?:\n|$)", "\n", content)
    if re.search(r"(?m)^[^\n]*\s--\s", content):
        raise ValueError("Inline comments need manual review")
    statements, parts, quote = [], [], None
    index = 0
    while index < len(content):
        char = content[index]
        next_char = content[index + 1] if index + 1 < len(content) else ""
        if quote is not None:
            parts.append(char)
            if char == quote and next_char == quote:
                parts.append(next_char)
                index += 2
                continue
            if char == quote:
                quote = None
        elif char in ("'", '"'):
            quote = char
            parts.append(char)
        elif char == ";":
            statement = "".join(parts).strip()
            if statement:
                statements.append(statement)
            parts.clear()
        else:
            parts.append(char)
        index += 1
    if quote:
        raise ValueError("Unterminated SQL quote")
    if "".join(parts).strip():
        raise ValueError("SQL statement lacks final semicolon")
    if not statements:
        raise ValueError("Empty SQL output")
    return statements

def parse_expected_tables(schema):
    blocks = re.findall(r"(?ms)^model\s+\w+\s*\{(.*?)^\}", schema)
    if len(blocks) != 92:
        raise ValueError("Expected 92 Prisma models")
    names = []
    for block in blocks:
        match = re.search(r'@@map\("([^"]+)"\)', block)
        if not match:
            raise ValueError("Prisma model without explicit @@map")
        names.append(match.group(1))
    if len(set(names)) != 92:
        raise ValueError("Duplicate Prisma physical table names")
    if len(re.findall(r"(?m)^enum\s+\w+\s*\{", schema)) != 10:
        raise ValueError("Expected 10 Prisma enums")
    return set(names)

def audit_sql(sql, schema):
    expected = parse_expected_tables(schema)
    parsed = split_statements(sql)
    kinds = {"CREATE TYPE": 0, "CREATE TABLE": 0, "CREATE INDEX": 0, "ALTER TABLE ADD FOREIGN KEY": 0}
    tables = []
    denied = re.compile(
        r"\b(?:DROP|TRUNCATE|RENAME|GRANT|REVOKE|COPY|EXECUTE|"
        r"DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|"
        r"CREATE\s+(?:FUNCTION|TRIGGER|PROCEDURE|DATABASE))\b", re.I
    )
    table_pattern = re.compile(r'^CREATE\s+TABLE\s+(?:"public"\.)?"([^"]+)"\s*\(', re.I | re.S)
    foreign_key_pattern = re.compile(
        r'^ALTER\s+TABLE\s+(?:"public"\.)?"[^"]+"\s+ADD\s+CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\b',
        re.I | re.S,
    )
    for idx, statement in enumerate(parsed, 1):
        if denied.search(statement):
            raise ValueError(f"Statement {idx}: destructive or unauthorized SQL")
        if re.match(r"^CREATE\s+TYPE\b", statement, re.I):
            if not re.match(r'^CREATE\s+TYPE\s+"[^"]+"\s+AS\s+ENUM\s*\(', statement, re.I):
                raise ValueError(f"Statement {idx}: unsupported CREATE TYPE")
            kinds["CREATE TYPE"] += 1
        elif re.match(r"^CREATE\s+TABLE\b", statement, re.I):
            match = table_pattern.match(statement)
            if not match:
                raise ValueError(f"Statement {idx}: unsupported CREATE TABLE")
            tables.append(match.group(1))
            kinds["CREATE TABLE"] += 1
        elif re.match(r"^CREATE\s+(?:UNIQUE\s+)?INDEX\b", statement, re.I):
            kinds["CREATE INDEX"] += 1
        elif re.match(r"^ALTER\s+TABLE\b", statement, re.I):
            if not foreign_key_pattern.match(statement):
                raise ValueError(f"Statement {idx}: only ADD FOREIGN KEY constraints are permitted")
            kinds["ALTER TABLE ADD FOREIGN KEY"] += 1
        else:
            raise ValueError(f"Statement {idx}: operation outside additive allowlist")
    if len(tables) != 92 or len(set(tables)) != 92 or set(tables) != expected:
        raise ValueError("Generated CREATE TABLE names do not match all 92 Prisma models")
    if kinds["CREATE TYPE"] != 10:
        raise ValueError("Generated enum count does not match 10 Prisma enums")
    if not kinds["CREATE INDEX"] or not kinds["ALTER TABLE ADD FOREIGN KEY"]:
        raise ValueError("Generated SQL unexpectedly lacks indexes or foreign keys")
    return {
        "pass_additive_sql_review": True,
        "NOT_AUTHORIZED_FOR_EXECUTION": True,
        "source": "prisma migrate diff --from-empty --to-schema-datamodel",
        "tables": len(tables),
        "enums": kinds["CREATE TYPE"],
        "statements": len(parsed),
        "statement_types": kinds,
        "table_names": sorted(tables),
        "schema_sha256": hashlib.sha256(schema.encode()).hexdigest(),
        "sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
        "manual_gates": [
            "Review all statements and 56 schema onDelete: Cascade relationships",
            "Confirm vector(1536) and pgvector extension in isolated staging",
            "Confirm target empty branch and take a new snapshot",
            "Obtain separate specific approval before any SQL execution",
        ],
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--sql", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    schema = Path(args.schema).read_text(encoding="utf-8")
    sql = Path(args.sql).read_text(encoding="utf-8")
    try:
        result = audit_sql(sql, schema)
    except ValueError as error:
        Path(args.report).write_text(
            json.dumps({"pass_additive_sql_review": False, "error": str(error)}, indent=2) + "\n",
            encoding="utf-8",
        )
        raise SystemExit("STOP: offline SQL audit blocked: " + str(error)) from None
    Path(args.report).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("Offline SQL audit passed: additive statements only. Manual review required.")

if __name__ == "__main__":
    main()
