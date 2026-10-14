from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_attendant_card_offers_the_campaign_link_builder():
    manager = read("components/flip-ai/agent-draft-manager.tsx")
    assert "<CampaignLinkBuilder publicPath={agent.publication.publicPath} published={agent.status === 'published'} />" in manager
    builder = read("components/flip-ai/campaign-link-builder.tsx")
    assert "buildCampaignLink({ baseUrl: `${origin}${publicPath}`, platform, campaign, content })" in builder
    assert "tests/flip-ai-campaign-link.test.ts" in read(".github/workflows/ci.yml")
