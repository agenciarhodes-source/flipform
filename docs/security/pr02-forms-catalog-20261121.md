# PR02 — catálogo de formulários por API nativa (21/11/2026)

## Escopo concluído em código, pendente de CI

Branch `feature/pr02-forms-catalog-read`, **dependente da fundação PR01/#627**.
Esta branch deriva do HEAD do PR01. A comparação foi temporariamente alterada para `main` para executar os checks existentes; até o merge do PR01, o diff mostrado pelo GitHub inclui também toda a fundação PR01. Nunca mesclar PR02 antes de PR01.

### Entrega

- `GET /api/v1/forms`: identifica somente formulários ativos da empresa vinculada à credencial.
- `GET /api/v1/forms/{formId}/fields`: retorna apenas estrutura mínima dos campos de formulário ativo da empresa autenticada (`id`, `label`, `fieldType`, `isRequired`, `orderIndex`), em ordem estável e no máximo 100 campos. `truncated` indica quando há mais campos. Sem respostas, dados de leads, opções, regras detalhadas ou URLs públicas. Requer `forms.read` e rejeita consulta entre empresas (404 genérico).
- Campos retornados: `id`, `name`, `pipelineId`, `initialStageId`, `leadSource`. Excluídos os campos de clientes, respostas, formulários, links públicos, configurações detalhadas e dados pessoais.
- Escopo dedicado `forms.read`, chave M2M vinculada à integração/empresa, validade, revogação, entitlement e quota transacional.
- Parametrização paginada `limit=1..50` e cursor `after` UUID. Recusa parâmetros inesperados, inclusive `tenantId`.
- Proprietário pode emitir chave de leitura específica no painel de Integrações, quando feature flag estiver habilitada futuramente.
- Testes de validação de parâmetros, no-store, isolamento A/B, revogação, suspensão, flag OFF e falha de DB com ambiente sintético.
- Documentação OpenAPI 3.1 atualizada, sem criação de novos modelos ou migrations.

### Regras de implantação

- `FLIPFORM_API_V1_ENABLED` permanece OFF em produção e staging.
- Preview automático Vercel para PR01 e PR02 desativado em `vercel.json`.
- CI isolado apenas em GitHub Actions com banco descartável localhost. Nenhuma credencial real, nenhum acesso Neon.
- PR02 Draft não deve ser mesclado antes de PR01, homologação de banco, política de retenção, rollback e autorização específica.
- Não altera leads, pipelines, formulários reais ou tráfego dos clientes.
