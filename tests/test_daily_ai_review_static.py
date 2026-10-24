from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_the_scheduler_runs_the_daily_review():
    job = read("app/api/internal/jobs/whatsapp-ai/route.ts")
    assert "const reviews = await sweepDailyAiReviews()" in job
    reviews = read("lib/whatsapp-ai/reviews.ts")
    assert "export async function sweepDailyAiReviews(now = new Date())" in reviews
    assert "if (!inDailyReviewWindow(now)) return { tenants: 0, reviewed: 0 };" in reviews
    assert "{ limit: DAILY_REVIEWS_PER_RUN, deadline }" in reviews


def test_sensitive_reviews_become_flip_alerts():
    alerts = read("lib/flip/alerts.ts")
    assert "recentReviews.filter(reviewNeedsAttention)" in alerts
    assert "detail: reviewAlertDetail(review)," in alerts
