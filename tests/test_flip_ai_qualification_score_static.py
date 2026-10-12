from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_score_follows_the_live_policy_weights_without_new_ai_calls():
    score = read("lib/flip-ai/qualification-score.ts")
    live = read("lib/flip-ai/lead-intelligence-policy.ts")
    assert "fitScore * 0.40" in live and "const FIT_WEIGHT = 40 / 75;" in score
    assert "intentScore * 0.30" in live and "const INTENT_WEIGHT = 30 / 75;" in score
    assert "confidenceScore * 0.05" in live and "const CONFIDENCE_WEIGHT = 5 / 75;" in score
    for forbidden in ["fetch(", "prisma", "server-only", "process.env"]:
        assert forbidden not in score, forbidden


def test_modal_shows_the_attendant_score_and_hides_the_competing_live_score():
    modal = read("components/lead-detail-modal.tsx")
    assert "summarizeFlipAiQualificationScore(qualification)" in modal
    assert "{!lead.flipAiLiveIntelligence && (() => {" not in modal
    # The attendant's qualification comes before the per-message reading.
    assert modal.index("Qualificação do lead") < modal.index("Inteligência em tempo real")
    assert "feita pelo atendente de IA {qualification.agent?.name || 'Flip AI'}" in modal
    assert "Score geral" in modal
    assert "Temperatura sugerida" in modal
    assert "Aplicada ao lead na qualificação, se ninguém tiver alterado a temperatura antes." in modal


def test_suggestion_never_writes_to_the_crm():
    modal = read("components/lead-detail-modal.tsx")
    block = modal.split("summarizeFlipAiQualificationScore(qualification)")[1].split("Fit Score")[0]
    for forbidden in ["updateTemp(", "fetch(", "onClick"]:
        assert forbidden not in block, forbidden
    api = read("app/api/leads/[id]/route.ts")
    assert "summarizeFlipAiQualificationScore" not in api


def test_score_unit_tests_run_in_ci():
    assert "tests/flip-ai-qualification-score.test.ts" in read(".github/workflows/ci.yml")


def test_incomplete_qualification_still_shows_a_partial_score_and_triage_never_holds_the_contact():
    score = read("lib/flip-ai/qualification-score.ts")
    assert "const partial = qualification.classification === 'insufficient';" in score
    assert "leitura parcial, faltam informações" in read("components/lead-detail-modal.tsx")
    timing = read("lib/flip-ai/contact-timing.ts")
    assert "faça uma única pergunta, a que mais define se ela faz parte do público que a empresa atende" in timing
    assert "no máximo duas perguntas de triagem" in timing
    assert "Não segure o contato" in timing
    assert "nunca troque o pedido de contato por ela" in timing
    # The contact is never held back for triage.
    assert "não peça nome nem telefone nesta resposta. Primeiro" not in timing
    assert "FLIP_AI_CONTACT_FALLBACK_INBOUND_MESSAGES = 4;" in timing
    assert "'handle_objection_first', 'hold_after_request', 'stop_requesting'];" in timing
    chat = read("lib/flip-ai/public-chat.ts")
    assert "A triagem é o que sustenta a nota" in chat
    assert "Nunca deixe de registrar o contato por falta de triagem." in chat
