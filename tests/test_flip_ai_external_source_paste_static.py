from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_pasted_link_is_cleaned_to_the_domain():
    editor = read("components/flip-ai/external-sources-editor.tsx")
    assert "onBlur={() => setDomain((current) => domainFromPastedLink(current))}" in editor
    assert "const cleanDomain = domainFromPastedLink(domain);" in editor
    assert "tests/flip-ai-external-source-input.test.ts" in read(".github/workflows/ci.yml")
    # The server rule stays strict: links are still refused there.
    assert "value.includes('://')" in read("lib/flip-ai/external-sources.ts")
