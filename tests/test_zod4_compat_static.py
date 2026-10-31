import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source_files():
    for folder in ("app", "lib", "components"):
        for path in (ROOT / folder).rglob("*.ts*"):
            yield path


def test_zod_is_v4_and_ids_keep_the_lenient_rule():
    package = (ROOT / "package.json").read_text(encoding="utf-8")
    assert '"zod": "^4.6.7"' in package
    # In zod 4, .uuid() refuses ids that zod 3 accepted (e.g. 00000000-0000-0000-0000-000000000001);
    # .guid() keeps the zod 3 rule, so no id that works today stops working.
    for path in source_files():
        text = path.read_text(encoding="utf-8")
        assert not re.search(r"z\.string\(\)[^;\n]*\.uuid\(", text), path


def test_zod_errors_are_read_from_issues():
    for path in source_files():
        text = path.read_text(encoding="utf-8")
        assert ".error.errors" not in text, path
