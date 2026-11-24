# FlipForm — Central Universal de Dados (Plano de execução)

**Decisão de produto, 24/11/2026:** FlipForm é a plataforma central de integrações, operações e dados. Flip Intelligence fica dentro do FlipForm. Flip OS é sistema separado de leitura, sem motor próprio de integrações nem permissões de escrita. Desconectar Flip OS NÃO deve afetar os outros conectores.

## Estado técnico verificado
- API v1 M2M outbound do FlipForm existe e foi usada para diagnóstico e leitura no Flip OS; ela **não** importa automaticamente dados de terceiros.
- A API v1 mantém flag, allowlist de tenants, escopos e controles de autorização existentes. Não ampliar grants neste trabalho.
- WhatsApp Cloud API tem Embedded Signup por tenant, assinatura de webhook, Conversation Core e outbox de texto. O **Gestor Executivo no WhatsApp** não está implementado.
- O presente PR define somente contrato seguro, tipos e testes offline. **Não** cria tabelas, endpoints, jobs, credenciais, configuração produtiva ou tráfego de rede.

## Arquitetura-alvo
Terceiros (ERP, financeiro, CRM, agenda, logística, pedidos, BI)
→ adaptadores server-side *por fornecedor* → conexões autorizadas por tenant
→ ingestão com proveniência, timestamps, unidade e estado de sincronização
→ camada de dados consultáveis no FlipForm → Flip Intelligence
→ API v1 de leitura limitada e autorizada → consumidores externos opcionais.

A integração não significa copiar todos os dados externos: permitir modo sob demanda, espelho incremental ou recepção de eventos, conforme contrato com o fornecedor e necessidade do cliente. Os dados externos não podem sobregravar leads, pipelines ou campos sem uma regra explícita de reconciliação aprovada.

## PRs propostos (não inferir números antes de abrir)
1. Contratos estáticos de adaptadores, domínios, capacidades e política inicial **somente leitura** (este PR).
2. Registro por tenant e vault/credenciais: migração aditiva após revisão de backup e destino, RBAC owner, encryption, rotação e revogação; default OFF.
3. Conexão segura: OAuth2 com PKCE/state quando aplicável, API key protegida, configuração de host fixa por adaptador, prevenção de SSRF/redirect, timeout, limites, teste de conexão e logs redigidos.
4. Motor de coleta: cursores, idempotência, filas, retry limitado, DLQ, eventos assinados, observabilidade e pausas por tenant.
5. Data hub: contratos normalizados, proveniência e frescor, segregação entre empresas, política de retenção/LGPD, catálogo e acesso pelo Flip Intelligence.
6. Primeiro conector real: selecionar fornecedor piloto, homologar documentação e permissões desse fornecedor, executar sandbox antes de produção.
7. Canal executivo do WhatsApp: identidade e consentimento do proprietário, telefone(s) autorizados, inbox executiva separada de leads, consulta somente leitura e AI com fontes.
8. Relatórios proativos via templates Meta aprovados, opt-in/opt-out, preferências de agenda, gatilhos, orçamento e aprovação para ações sensíveis.
9. Reuniões e chamadas: agenda integrada por autorização específica; chamadas WhatsApp em fase própria conforme elegibilidade, permissões do usuário e custos.

## Segurança e contratos
- **Nunca usar um token universal para todos os tenants.** A plataforma pode operar um único Meta App com vínculos de ativo por tenant, mas a autorização de dados e escopo pertence a cada empresa.
- O primeiro rollout de terceiros fica exclusivamente read-only, default OFF, sem ações remotas e sem reativar flags antigas.
- Identidade do tenant provém da sessão/credencial de backend, nunca de parâmetros informados pelo navegador ou pelo provedor.
- Allowlist de hosts não substitui a validação dos endereços IP após resolução DNS, bloqueio de redirecionamento, limites de saída, egress controlado e auditoria.
- Cada registro recebido tem origem, data de referência, identificação do provedor, tenant e política de reconciliação; sem misturar a fonte com fatos gerados pelo modelo.
- Requisições de IA precisam de autorização no momento da consulta; não repassar segredos nem dados sensíveis desnecessários ao LLM.
- Chaves do Flip OS, se revogadas, devem ser revogadas no FlipForm **e** apagadas do armazenamento local do Flip OS; desconectar só a interface não equivale a revogação remota.
- Abertura de PR não autoriza migração produtiva, homologação com dados reais, acesso amplo a clientes, envio de WhatsApp ou merge.

## WhatsApp executivo — proposta funcional
Número exclusivo de plataforma pode atender vários empresários, desde que o backend valide cada remetente e associe autorização de consulta e empresa ativa; número comercial de uma empresa não deve dar automaticamente acesso executivo. Para várias empresas vinculadas ao mesmo proprietário, exigir seleção explícita. A entrada pode ser por texto/áudio; relatórios e ações são módulos separados.
Fora da janela de atendimento de 24h, notificações proativas exigem templates aprovados e consentimento. Chamadas requerem elegibilidade e, quando iniciadas pela empresa, permissão específica. Custos e limites são controlados por tenant.

## Critérios de aceite desta etapa
- testes do contrato verde, sem alterações ao banco, ambiente ou endpoints;
- análise de segurança da interface de adaptadores e clareza das fronteiras API v1 outbound vs conectores inbound;
- merge somente após checks e autorização do proprietário.
