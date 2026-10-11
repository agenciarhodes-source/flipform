import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = "lib/storage/attachment-storage.ts"
MIGRATION = "prisma/migrations/20261010120000_chat_attachment_records/migration.sql"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_credentials_stay_on_the_server_and_links_are_short_lived():
    lib = read(LIB)
    assert "NEXT_PUBLIC" not in lib
    assert "expiresSeconds: 300," in lib      # upload link
    assert "expiresSeconds: 60," in lib       # download link
    assert "'content-length': String(input.contentLength)" in lib
    assert "console.log" not in lib
    for name in ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ATTACHMENTS_BUCKET"]:
        assert name in lib and name + "=" in read(".env.example"), name


def test_database_only_describes_the_file_and_never_holds_its_bytes():
    schema = read("prisma/schema.prisma").split("model ChatAttachment {")[1].split("}")[0]
    assert re.search(r"Bytes", schema) is None
    assert 'objectKey       String    @unique @map("object_key")' in schema
    lines = [line for line in read(MIGRATION).splitlines() if not line.strip().startswith("--")]
    sql = "\n".join(lines).upper()
    assert "BYTEA" not in sql
    for forbidden in ["DROP ", "TRUNCATE", "DELETE FROM", "UPDATE ", "INSERT ", "ALTER TABLE"]:
        assert forbidden not in sql, forbidden
    assert sql.count("CREATE TABLE") == 1
    assert "5242880" in sql
    assert "flip_ai" not in Path(MIGRATION).parent.name


def test_signature_is_checked_against_a_published_reference_in_ci():
    tests = read("tests/attachment-storage.test.ts")
    assert "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404" in tests
    assert "tests/attachment-storage.test.ts" in read(".github/workflows/ci.yml")
