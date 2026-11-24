#!/usr/bin/env python3
"""Narrow offline regression: API v1 GET route/read modules do not initiate direct egress.

This is deliberately NOT full-application egress attestation; calls through
indirect dependencies, background jobs, instrumentation and runtime infrastructure
are not inspected. Never enable an API or release based only on this check.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = (
    "app/api/v1/status/route.ts",
    "app/api/v1/capabilities/route.ts",
    "app/api/v1/forms/route.ts",
    "app/api/v1/forms/[formId]/fields/route.ts",
    "app/api/v1/leads/route.ts",
    "app/api/v1/leads/[leadId]/route.ts",
    "app/api/v1/pipelines/route.ts",
    "app/api/v1/pipelines/[pipelineId]/metrics/route.ts",
)
READERS = (
    "lib/api-v1/form-fields-read.ts",
    "lib/api-v1/forms-read.ts",
    "lib/api-v1/leads-metadata-read.ts",
    "lib/api-v1/pipeline-metrics-read.ts",
    "lib/api-v1/pipelines-read.ts",
    "lib/api-v1/prisma-credential-repository.ts",
    "lib/api-v1/identity.ts",
)
# Conservative direct network indicators only, not proof of indirect isolation.
DANGEROUS = re.compile(
    r"\bfetch\s*\(|\baxios\s*(?:\.|\()|\bhttps?\s*\.\s*(?:get|request)\s*\("
    r"|\bXMLHttpRequest\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(",
)
def inspect(root: Path = ROOT) -> dict:
    paths = ROUTES + READERS
    for relative in paths:
        path = root / relative
        if not path.is_file():
            raise ValueError("Missing reviewed direct-egress surface: " + relative)
        contents = path.read_text(encoding="utf-8")
        if DANGEROUS.search(contents):
            raise ValueError("Direct outbound network call introduced: " + relative)
    # A real response on the controlled preview established only the OFF gate.
    status = (root / "app/api/v1/status/route.ts").read_text(encoding="utf-8")
    if "apiV1Enabled(process.env)" not in status:
        raise ValueError("API status endpoint must remain OFF by default")
    return {"offline_direct_egress_guard": "PASS", "surfaces": len(paths),
            "scope": "API v1 route/read modules only", "production_egress_attested": False,
            "release_authorized": False}

if __name__ == "__main__":
    result = inspect()
    print(f"API v1 offline egress guard PASS: {result['surfaces']} direct surfaces, "
          "general egress NOT ATTESTED; release NO_GO.")
