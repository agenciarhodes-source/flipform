from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_dashboard_report_draws_the_pipeline_funnel_when_one_is_selected():
    report = (ROOT / "components/print-report/dashboard-report.tsx").read_text(encoding="utf-8")
    assert "{funnelStages.length ? (" in report
    assert "<FunnelDrawing stages={funnelStages.map(" in report
    kit = (ROOT / "components/print-report/report-kit.tsx").read_text(encoding="utf-8")
    assert "export function FunnelDrawing(" in kit
    assert "<polygon points=" in kit
