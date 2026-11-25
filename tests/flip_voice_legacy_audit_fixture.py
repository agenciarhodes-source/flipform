"""Historical fixture for PR00/PR01-only security audit regressions.

PR00 auditor intentionally recognizes 92 baseline + 10 PR01 models. These
regression tests MUST use the historical candidate, not the current 108-model
schema. Real Flip Voice schema and migration are independently verified by
tests/test_flip_voice_schema_static.py and require separate release approval.

This projection is deliberately strict: any unexpected schema expansion,
missing approved model, altered map or inverse relation fails, rather than
silently hiding a newly added table from the legacy auditors.
"""
import re

VOICE_MODELS = {
    "FlipVoiceSettings": "flip_voice_settings",
    "FlipVoiceProfile": "flip_voice_profiles",
    "FlipVoiceConsent": "flip_voice_consents",
    "FlipVoiceBudget": "flip_voice_budgets",
    "FlipVoiceCall": "flip_voice_calls",
    "FlipVoiceEvent": "flip_voice_events",
    "FlipVoiceLine": "flip_voice_lines",
    "FlipVoiceContactPermission": "flip_voice_contact_permissions",
}
TENANT_INVERSE = {
    "flipVoiceSettings FlipVoiceSettings?",
    "flipVoiceProfiles FlipVoiceProfile[]",
    "flipVoiceConsents FlipVoiceConsent[]",
    "flipVoiceBudgets FlipVoiceBudget[]",
    "flipVoiceCalls FlipVoiceCall[]",
    "flipVoiceEvents FlipVoiceEvent[]",
    "flipVoiceLines FlipVoiceLine[]",
    "flipVoiceContactPermissions FlipVoiceContactPermission[]",
}
AGENT_INVERSE = {"flipVoiceProfiles FlipVoiceProfile[]"}
DEVELOPER_MODELS = {"DeveloperTenantGrant": "developer_tenant_grants"}
DEVELOPER_INVERSE = {
    "Tenant": {"developerGrants DeveloperTenantGrant[]"},
    "User": {
        'developerGrants DeveloperTenantGrant[] @relation("DeveloperGrantUser")',
        'developerGrantsIssued DeveloperTenantGrant[] @relation("DeveloperGrantIssuer")',
    },
}
POST_VOICE_MODELS = {"LeadPersonalDocument": "lead_personal_documents"}
UNIVERSAL_MODELS = {"UniversalConnection": "universal_connections", "UniversalConnectionCredential": "universal_connection_credentials", "UniversalConnectionAudit": "universal_connection_audits"}
CURRENT_MODEL_COUNT = 111 + len(UNIVERSAL_MODELS) + len(POST_VOICE_MODELS)
PROFILE_INVERSE = {"lines FlipVoiceLine[]"}
CALL_INVERSE = {"line FlipVoiceLine?", "contactPermission FlipVoiceContactPermission?"}


def historical_pr01_candidate(current_schema: str) -> str:
    """Return only the approved historical 102-model candidate for PR01 tests."""
    model_names = re.findall(r"(?m)^model\s+(\w+)\s*\{", current_schema)
    if len(model_names) != CURRENT_MODEL_COUNT or len(set(model_names)) != CURRENT_MODEL_COUNT:
        raise ValueError(f"Expected {CURRENT_MODEL_COUNT} explicitly approved models")
    projected = current_schema
    for model, table in {**POST_VOICE_MODELS, **UNIVERSAL_MODELS}.items():
        pattern = rf"(?ms)^model\s+{re.escape(model)}\s*\{{(.*?)^\}}\n?"
        match = re.search(pattern, projected)
        if not match or match.group(1).count(f'@@map("{table}")') != 1:
            raise ValueError(f"Missing or unapproved later model mapping: {model}")
        if model in POST_VOICE_MODELS and "@relation" in match.group(1):
            raise ValueError(f"Unexpected relation: {model}")
        projected, count = re.subn(pattern, "", projected, count=1)
        if count != 1:
            raise ValueError(f"Could not isolate exactly one {model}")
    projected, count = re.subn(r"(?m)^\s+universalConnections UniversalConnection\[\]\s*\n", "", projected)
    if count != 1:
        raise ValueError("Missing or duplicate UniversalConnection inverse")
    for model, table in VOICE_MODELS.items():
        pattern = rf"(?ms)^model\s+{re.escape(model)}\s*\{{(.*?)^\}}\n?"
        match = re.search(pattern, projected)
        if not match or match.group(1).count(f'@@map("{table}")') != 1:
            raise ValueError(f"Missing or unapproved Flip Voice model mapping: {model}")
        projected, count = re.subn(pattern, "", projected, count=1)
        if count != 1:
            raise ValueError(f"Could not isolate exactly one {model}")

    # New developer grant is independently reviewed with its own additive migration.
    for model, table in DEVELOPER_MODELS.items():
        pattern = rf"(?ms)^model\s+{re.escape(model)}\s*\{{(.*?)^\}}\n?"
        match = re.search(pattern, projected)
        if not match or match.group(1).count(f'@@map("{table}")') != 1:
            raise ValueError(f"Missing or unapproved developer model mapping: {model}")
        projected, count = re.subn(pattern, "", projected, count=1)
        if count != 1:
            raise ValueError(f"Could not isolate exactly one {model}")
    for model, fields in DEVELOPER_INVERSE.items():
        pattern = rf"(?ms)(^model\s+{model}\s*\{{)(.*?)(^\}})"
        match = re.search(pattern, projected)
        if not match:
            raise ValueError(f"Missing model for developer inverse: {model}")
        body = match.group(2)
        for field in fields:
            field_pattern = re.escape(field).replace(r"\ ", r"\s+")
            exact = rf"(?m)^\s+{field_pattern}\s*\n"
            if len(re.findall(exact, body)) != 1:
                raise ValueError(f"Missing/duplicate developer inverse: {model}.{field}")
            body = re.sub(exact, "", body, count=1)
        projected = projected[:match.start(2)] + body + projected[match.end(2):]

    # These fields create no columns: only the relations referencing the six
    # new models may be stripped from a historical 102-model test fixture.
    for model, lines in (("Tenant", TENANT_INVERSE), ("FlipAiAgent", AGENT_INVERSE)):
        pat = rf"(?ms)(^model\s+{model}\s*\{{)(.*?)(^\}})"
        match = re.search(pat, projected)
        if not match:
            raise ValueError(f"Missing existing Prisma model: {model}")
        body = match.group(2)
        for field in sorted(lines):
            exact = rf"(?m)^\s+{re.escape(field)}\s*\n"
            if len(re.findall(exact, body)) != 1:
                raise ValueError(f"Missing/duplicated Flip Voice inverse relation: {model}.{field}")
            body = re.sub(exact, "", body, count=1)
        projected = projected[:match.start(2)] + body + projected[match.end(2):]

    names = re.findall(r"(?m)^model\s+(\w+)\s*\{", projected)
    if len(names) != 102 or any(name in names for name in VOICE_MODELS):
        raise ValueError("Historical PR01 projection must contain exactly 102 models")
    return projected
