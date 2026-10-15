from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_dashboard_and_reports_open_a_designed_printable_report_with_their_filters():
    dashboard = read("app/(app)/dashboard/page.tsx")
    assert "onClick={openPrintReport}" in dashboard
    assert "window.open(`/report/dashboard?${params.toString()}`, '_blank', 'noopener');" in dashboard
    reports = read("components/reports-page-client.tsx")
    assert "window.open(`/report/reports?${qs}`, '_blank', 'noopener')" in reports
    kit = read("components/print-report/report-kit.tsx")
    assert "@page { size: A4; margin: 12mm; }" in kit
    assert "print-color-adjust: exact !important;" in kit


def test_printable_reports_require_a_session_and_the_same_view_permissions():
    assert "if (!session) redirect('/login');" in read("app/report/layout.tsx")
    assert "can(session.role, 'DASHBOARD_VIEW')" in read("app/report/dashboard/page.tsx")
    assert "can(session.role, 'REPORTS_VIEW')" in read("app/report/reports/page.tsx")
    # The reports read the same APIs as the screens, so each role sees exactly what it already sees.
    assert "fetch(`/api/dashboard?${params.toString()}`" in read("components/print-report/dashboard-report.tsx")
    assert "fetch(`/api/reports/${endpoint}?${qs}`" in read("components/print-report/commercial-report.tsx")
