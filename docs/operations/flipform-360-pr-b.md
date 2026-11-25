# PR-B — Universal Connect: sandbox piloto
Base: 4c63d27797cb7044864c00cc72e6aa963435843c, PR-A #642 integrado.
## Entrega parcial e deliberadamente desativada
- Catálogo de categorias e adaptador Asaas sandbox (GET /v3/myAccount/status/, access_token), conforme https://docs.asaas.com/reference/consultar-situacao-cadastral-da-conta e https://docs.asaas.com/reference/comece-por-aqui.
- Integrações mantém política existente exclusiva do Desenvolvedor. Além disso, o serviço do PR-A exige vínculo owner direto ativo; nenhuma permissão foi ampliada. Definir política comercial do proprietário antes de liberar.
- Preview somente, dupla flag e allowlist por tenant, proteção PR629 de egress preservada, origem exata Vercel, rate limit, body limitado, host/path fixos, TLS/SNI, DNS IPv4 pinado, sem redirecionamento, sem retorno de corpo externo.
- Testar e salvar usa mesma credencial, transação de cadastro + envelope + auditoria. Aceitação HTTP 200 não comprova titularidade. Registro continua disabled. Desconexão local não revoga chave externa.
- Primitivas Bearer e PKCE apenas. OAuth real requer state persistido/atômico, sessão/tenant, callback, issuer e autorização de aplicativo; bearer exige fornecedor específico. Não há integração genérica arbitrária ou escrita externa.
## Não ativar
Não configurar flags/secrets, não usar dados reais, não executar chamadas em preview protegido. Isolamento PostgreSQL do PR-A ainda precisa ser executado; migração não aplicada aqui. Homologação de egress, rate-limit distribuído fail-closed (helper legado usa fallback em memória), identidade da conta, rotação, OAuth, consentimento e testes de rota ainda pendentes. Nenhuma sincronização e nenhum uso produtivo.
Testes offline: NODE_OPTIONS=--conditions=react-server npx tsx --test tests/universal-connectors-sandbox.test.ts tests/universal-connectors-vault.test.ts tests/universal-connectors-contracts.test.ts. Ações GitHub permanecem desabilitadas; executar em ambiente local isolado. Vercel preview valida build, não substitui testes.
