from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_flip_alerts_are_read_only_and_scoped_to_who_is_looking():
    alerts = read("lib/flip/alerts.ts")
    assert "const own = seesTeam ? {} : { assignedTo: session.userId };" in alerts
    assert "getInboxConversationWhere(await withInboxScope(session))" in alerts
    for write_call in (".create(", ".update(", ".delete(", ".upsert("):
        assert write_call not in alerts
    rules = read("lib/flip/alert-rules.ts")
    for deadline in ("unansweredMinutes: 30,", "staleLeadDays: 3,", "newLeadWithoutContactHours: 2,", "overloadFactor: 1.5,"):
        assert deadline in rules


def test_flip_page_and_menu():
    assert "withPermission('LEADS_VIEW'" in read("app/api/flip/alerts/route.ts")
    shell = read("components/app-shell.tsx")
    assert '{ href: "/flip", label: "Flip", icon: Sparkles, permission: "LEADS_VIEW" },' in shell
    assert '{item.href === "/flip" && <FlipNavBadge />}' in shell
    assert "tests/flip-alert-rules.test.ts" in read(".github/workflows/ci.yml")
