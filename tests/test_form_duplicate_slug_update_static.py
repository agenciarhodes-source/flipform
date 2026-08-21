from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_duplicated_form_slug_syncs_to_final_name_on_save():
    route = read('app/api/forms/[id]/route.ts')

    assert "generateUniqueFormSlug" in route
    assert "action: 'form.duplicated'" in route
    assert "hasDuplicatePlaceholderSlug(existing.slug)" in route
    assert "!isDuplicatePlaceholderName(data.name)" in route
    assert "name: data.name" in route
    assert "excludeSlug: existing.slug" in route
    assert "slug: nextSlug" in route
    assert "duplicateSlugSynced: duplicateSlugNeedsSync" in route


def test_slug_sync_is_limited_to_unsynced_duplicates():
    route = read('app/api/forms/[id]/route.ts')

    assert "const duplicateAudit = hasDuplicatePlaceholderSlug(existing.slug)" in route
    assert "const duplicateSlugNeedsSync = Boolean(duplicateAudit)" in route
    assert "const nextSlug = duplicateSlugNeedsSync" in route
    assert ": existing.slug;" in route
    assert "Formulários normais (e cópias já sincronizadas)" in route


def test_duplicate_placeholder_detection_covers_copy_suffixes():
    route = read('app/api/forms/[id]/route.ts')

    assert "function isDuplicatePlaceholderName" in route
    assert "c[oó]pia" in route
    assert "function hasDuplicatePlaceholderSlug" in route
    assert "copia(?:-\\d+)?" in route
