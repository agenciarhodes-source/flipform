"""Admin-scoped developer onboarding keeps MFA enrollment under the target user's control."""
from pathlib import Path

PANEL = Path("app/admin/(secure)/developer-access/page.tsx").read_text(encoding="utf-8")
GRANTS_API = Path("app/api/admin/developer-access/route.ts").read_text(encoding="utf-8")
SESSION = Path("lib/session-access.ts").read_text(encoding="utf-8")


def test_admin_can_review_mfa_state_and_share_enrollment_link():
    assert "Autorizar Desenvolvedor" in PANEL
    assert "MFA pendente" in PANEL
    assert "Autorizado · aguardando MFA" in PANEL
    assert "Copiar link de ativação do MFA" in PANEL
    assert "/account/security" in PANEL


def test_admin_never_activates_another_users_mfa():
    assert "/api/auth/mfa/setup" not in PANEL
    assert "/api/auth/mfa/enable" not in PANEL
    assert "mfaEnabledAt:" not in GRANTS_API.split("export const POST")[1].split("export const DELETE")[0]
    assert "mayUseDeveloperGrant({" in SESSION
    assert "mfaEnabled: !!account?.mfaEnabledAt" in SESSION
