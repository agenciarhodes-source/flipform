from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_external_sources_can_be_limited_to_some_pages():
    migration = read("prisma/migrations/20261024150000_flip_ai_external_source_paths/migration.sql")
    assert 'ALTER TABLE "flip_ai_external_sources" ADD COLUMN "path_prefix" TEXT;' in migration
    assert "DROP" not in migration and "DELETE" not in migration
    assert "path_prefix:text?" in read("lib/flip-ai/schema-contract.ts")
    web = read("lib/flip-ai/external-web-search.ts")
    assert "if (pathRules && !pathAllowed(url.pathname, pathRules.get(domainToASCII(url.hostname.toLowerCase())))) return null;" in web
    assert "const result = await searchOpenAiWeb(query, domains, { safetyIdentifier: input.conversationId, pathRules });" in web
    # The search tool still receives only domains; pages are filtered after it answers.
    assert "tools: [{ type: 'web_search', filters: { allowed_domains: domains } }]," in web
    editor = read("components/flip-ai/external-sources-editor.tsx")
    assert "Limitar a estas páginas (opcional)" in editor
    assert "onClick={() => void editPaths(source)}" in editor
