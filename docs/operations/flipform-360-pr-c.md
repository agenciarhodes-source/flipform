# FlipForm 360° — PR-C: central de dados / fundação sintética
Base 0ffc52475ec01fde61cbb479954dfe5d7d5aed05; PR-A #642 e PR-B #647 integrados. GoJus e Flip Voice preservados.
## Entregue
- Fila persistente de execuções, chave de idempotência por tenant/conexão, cursor de páginas, estado e histórico, tentativas limitadas (3 por página), código de erro redigido.
- Projeção financeira sintética em centavos BRL, origem/provedor, identificador, versão temporal, horário de observação e referência à execução. Não são dados comerciais. Deduplicação e rejeição de conflito de versão; atualização mais antiga não sobregrava a mais recente.
- FK composta tenant/conexão/execução; transação serializável por página e lock de execução, cursor e registros juntos. Processamento explícito, sem worker em produção, sem lease remoto ou egress. Não modifica leads, pipelines, dados legados ou credenciais.
- Serviço só funciona com NODE_ENV=test, flag de fixture e DB PostgreSQL localhost descartável, nunca Vercel. Sem HTTP/UI/cron, sem ativar conexões.
## Validação
Com dependências já instaladas e Node compatível: npx tsx --test tests/universal-sync-fixture-policy.test.ts
Integração apenas em PostgreSQL descartável flipform_ci (schema novo, pgvector se necessário): primeiro confirme URL com node scripts/assert-ci-local-db.mjs flipform_ci, depois materialize o schema no banco local, nunca Neon/produção. NODE_ENV=test UNIVERSAL_SYNC_FIXTURE_ENABLED=true NODE_OPTIONS=--conditions=react-server npx tsx --test tests/universal-sync-fixture.integration.test.ts.
O db push do ambiente descartável não valida o SQL da migração ou seus CHECKs; homologar SQL separadamente e comparar. GitHub Actions permanece OFF; Vercel só valida build.
## Limites
Sem importação de Asaas ou qualquer fornecedor real. Não expor esta projeção ao Flip Intelligence, Flip OS ou relatórios comerciais. Sem webhook real, motor remoto, mapeamento genérico, relacionamento de entidades, histórico de todas as versões dos registros ou interface de monitoramento. Estas são etapas pendentes do PR-C, além dos testes PostgreSQL dos PRs A/B/C. A fila de fixture não é uma fila distribuída de rede. Antes da ativação: identidade da conta externa, OAuth, permissões, retenção/LGPD, egress, quotas, backup/rollback, migração revisada e teste de concorrência e isolamento. Não configurar flags, rodar migração produtiva, nem realizar merge automático.
