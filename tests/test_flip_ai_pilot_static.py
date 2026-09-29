from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pilot_access_is_server_side_exact_and_migration_free():
    pilot = read("lib/flip-ai/pilot-access.ts")
    access = read("lib/flip-ai/access.ts")
    public_agent = read("lib/flip-ai/public-agent.ts")
    manager = read("components/flip-ai/agent-draft-manager.tsx")

    assert "process.env.FLIP_AI_PILOT_TENANT_IDS" in pilot
    assert "MAX_PILOT_TENANTS = 10" in pilot
    assert "UUID.test" in pilot
    assert "tenantIds.has" in pilot
    assert "session.tenantId" in access
    assert "owner', 'admin" in access
    assert "isFlipAiPilotTenant(endpoint.agent.tenantId)" in public_agent
    assert "Modo piloto controlado" in manager
    assert "FLIP_AI_PILOT_TENANT_IDS" not in manager
    assert "tenantId" not in manager


def test_pilot_change_does_not_touch_business_data_or_integrations():
    files = [
        read("lib/flip-ai/pilot-access.ts"),
        read("lib/flip-ai/access.ts"),
        read("lib/flip-ai/public-agent.ts"),
    ]
    source = "\n".join(files).lower()
    for forbidden in ["delete from", "truncate", "meta", "pixel", "google", "whatsapp", "waba"]:
        assert forbidden not in source
