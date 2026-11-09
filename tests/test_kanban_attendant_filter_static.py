"""Kanban: owners, admins and managers can filter the board by attendant; attendants keep seeing only their own leads."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_api_filters_only_for_managers():
    route = read("app/api/leads/route.ts")
    assert "if (assignee && can(session.role, 'DASHBOARD_FILTER_BY_ASSIGNEE'))" in route
    assert "if (assignee === 'none') where.assignedTo = null;" in route
    # The filter comes after the role scope, so it only narrows what the person already sees.
    assert route.index("...getLeadScopeForRole(session)") < route.index("searchParams.get('assignedTo')")


def test_attendant_list_is_for_managers():
    route = read("app/api/leads/assignees/route.ts")
    assert "withPermission('DASHBOARD_FILTER_BY_ASSIGNEE'" in route
    assert "role: { not: 'viewer' }" in route


def test_kanban_has_the_filter():
    page = read("app/(app)/kanban/page.tsx")
    assert "fetch('/api/leads/assignees'" in page
    assert "if (assignee !== 'all') params.set('assignedTo', assignee);" in page
    assert '<SelectItem value="all">Todos os atendentes</SelectItem>' in page
    assert '<SelectItem value="none">Sem responsável</SelectItem>' in page
