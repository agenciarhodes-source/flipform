# FlipForm 360° — PR-A: infraestrutura operacional
Base auditada: 770abfabf49554e7b19d113ca291908e225614b0; PR #640 integrado. Prompt Mestre V2.0 de 24/11/2026, PR-A.
## Evidências de código (não equivalem a homologação)
- lib/universal-connectors/contracts.ts: contratos e capacidades somente leitura; ainda sem motor.
- lib/auth.ts e lib/rbac.ts: sessão revalidada e papéis de tenant. O serviço novo exige owner ativo, sem bypass por admin; PR-B deverá derivar o ator de sessão verificada, nunca do body.
- lib/tracking/crypto.ts: AES-GCM existente sem binding AAD de conexão; preservado. Novo vault dedicado com AAD por tenant/conexão/provedor, chave versionada e separada; não migrar os secrets legados.
- app/(app)/integrations/page.tsx e lib/api-v1/policy.ts: UI e gate API v1 outbound separados. Não alterar escopos, grants, chave Flip OS ou flags existentes. Revalidar circuito em CI; não testar produção.
- lib/tracking/google-funnel.ts, lib/tracking/google-data-manager.ts: infraestrutura de conversões, não prova de gestão de campanhas.
- lib/meta/platform-settings.ts, lib/meta/whatsapp.ts: infraestrutura existente Meta/WhatsApp, não prova de autorização de Ads.
- lib/flip-ai/text-model-setting.ts e lib/flip/briefing.ts: IA e briefing existentes. Não mudar carteira, modelos ou atendimento.
- Auditoria de módulos financeiros e homologação real por provedor ainda pendentes para respectivos PRs.
## Escopo
Registro e vault server-side, transações serializáveis, auditoria de ações bem-sucedidas, FKs compostas, default OFF e allowlist explícita. Nenhuma rota, UI, chamada externa, worker, ativação ou escrita em terceiros. Revogação local remove o envelope ativo, não revoga tokens no provedor nem expurga backups. Rotação por substituição de credencial com nova key ID; migração de envelopes sob chaves anteriores requer runbook e homologação antes de uso real. Não existe caminho para habilitar conexão neste PR.
Config futura: UNIVERSAL_CONNECT_ENABLED=false (ausência também nega), UNIVERSAL_CONNECT_PILOT_TENANT_IDS (UUIDs aprovados), UNIVERSAL_CONNECT_VAULT_KEY (32 bytes base64url), UNIVERSAL_CONNECT_VAULT_KEY_ID. Não criar variáveis no ambiente nem fornecer valores reais agora.
## Gates
CI offline e banco descartável; revisão da migração aditiva, retenção/LGPD, PITR, egress, destino e rollback antes de qualquer aplicação. O histórico de NO_GO em docs/security/api-v1-retention-owner-review-20261123.md não é revogado por este PR. Teste piloto prévio relatado não prova liberação comercial.
O PR-B acrescenta catálogo confiável, interface e autenticação, validação de identidade, OAuth/state/PKCE, SSRF/DNS/egress, revogação remota, limites e testes reais sandbox. Nenhuma ativação produtiva ou merge automático.
