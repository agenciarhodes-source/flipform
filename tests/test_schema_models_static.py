"""Every table created by a migration of these features keeps its model in schema.prisma (a branch
merge once dropped one), and every rules test stays in the CI list."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_feature_tables_keep_their_models():
    schema = (ROOT / "prisma/schema.prisma").read_text(encoding="utf-8")
    for table in ("lead_calls", "message_edits", "whatsapp_voice_settings", "closing_document_settings",
                  "closing_document_templates", "whatsapp_followup_settings", "whatsapp_followup_sends", "business_group_plans"):
        assert f'@@map("{table}")' in schema, table


def test_rules_tests_are_in_the_ci_list():
    ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    for name in ("lead-call-rules", "message-correction-rules", "lead-story-rules", "whatsapp-voice-rules", "group-plan-rules", "whatsapp-number-rules",
                 "closing-documents-send", "closing-documents", "whatsapp-reactivation-rules"):
        assert f"tests/{name}.test.ts" in ci, name
