from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_web_search_accepts_official_subdomains_and_records_rejections():
    web = (ROOT / "lib/flip-ai/external-web-search.ts").read_text(encoding="utf-8")
    assert "return isHostAllowed(normalized, domains);" in web
    assert "const filterDomains = searchFilterDomains(domains);" in web
    assert "rejectedHosts: failure.rejectedHosts" in web
