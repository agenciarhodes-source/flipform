# Flip Voice — PR 2/3: telefonia PSTN e CRM (24/11/2026)

**ESTADO:** código em PR Draft, sem merge, sem ativação em produção. Não é uma central operacional homologada. Este documento descreve o que existe, as proteções e as dependências pendentes.

## Estrutura já implementada
- `flip_voice_lines`: vinculação de telefone E.164, tenant, voz aprovada e agente ElevenLabs; default `disabled`, inbound/outbound OFF.
- `flip_voice_contact_permissions`: consentimento **do destinatário da chamada** separado do consentimento do titular da voz clonada; prova de autorização por hash SHA-256, número exato vinculado por HMAC, revogação e validade.
- `flip_voice_calls` agora aceita `lead_id`, `line_id`, `contact_permission_id`; sem armazenamento de telefone em claro na sessão.
- `lib/flip-voice/telephony-service.ts`: reserva atômica de orçamento em PostgreSQL, associada ao tenant e mês; idempotência na chave; fail-closed se falta autorização; originação autorizada via ElevenLabs/Twilio; inbound com webhook assinado; reconciliação **estimada** ao receber status final assinado.
- `lib/flip-voice/telephony-provider.ts`: ElevenLabs `/v1/convai/twilio/outbound-call` e `register-call`, sem gravação. A integração é nativa e não depende de WebSockets hospedados na Vercel.
- Rotas `/api/flip-voice/calls` (GET e POST), `/api/flip-voice/twilio/inbound`, `/api/flip-voice/twilio/status`, `/api/flip-voice/permissions/revoke`.
- CI com testes offline de segurança e simuladores de fornecedor.

## Flags e segredos — zero por padrão
No processo do servidor, todos os seguintes devem estar **desligados/ausentes** até testes autorizados:

```text
FLIP_VOICE_PSTN_ENABLED=false
FLIP_VOICE_OUTBOUND_ENABLED=false
FLIP_VOICE_TWILIO_INBOUND_URL=(vazio)
FLIP_VOICE_TWILIO_STATUS_URL=(vazio)
TWILIO_AUTH_TOKEN=(segredo no vault; jamais escrever no GitHub)
ELEVENLABS_API_KEY=(segredo no vault; jamais escrever no GitHub)
FLIP_VOICE_CONTACT_PEPPER=(HMAC secreto >=32 caracteres; jamais escrever no GitHub)
```

Não alterar `FLIPFORM_API_V1_ENABLED`, os 4 workflows desativados, regras de Ads/Pixel, secrets já existentes ou o fluxo atual de mensagens de clientes.

## Pré-requisitos reais para teste humano piloto
1. Dois números Twilio de teste (número da empresa, telefone de funcionário), com cobertura e requisitos regulatórios do Brasil verificados.
2. Agente ElevenLabs criado com identificação explícita de IA, língua pt-BR, limite de duração e voz clonada com consentimento verificável do titular; modelo textual GPT-6 Luna via opção Custom LLM se suportada e validada.
3. Linha/telefone registrado **em tenant correto**, com providerAgentId e providerPhoneNumberId; uso de `register-call` exige que o webhook de voz Twilio aponte para o FlipForm e não seja sobrescrito automaticamente pela integração nativa ElevenLabs.
4. Consentimento documentado do destinatário para receber ligações automáticas (propósito, canal, número exato e validade), verificável e revogável. A linha deve estar em status `ready`, com entradas e saídas habilitadas separadamente.
5. Teto mensal e por ligação configurado explicitamente no tenant, mais linha de saldo `flip_voice_budgets` para o mês UTC atual. Na ausência dos dois, toda ligação deve falhar fechada.
6. Ambiente de staging com chave e URLs de Twilio validadas. Registros e integrações dos provedores **não são provisionados automaticamente neste PR**.
7. A URL pública assinada da Twilio para entrada deve ser exatamente `https://<host>/api/flip-voice/twilio/inbound`; status `https://<host>/api/flip-voice/twilio/status`. A signature usa a URL configurada, não headers de proxy informados pelo cliente.
8. Testar simultaneidade, falhas de rede, número inválido, autorização expirada/revogada, troca de telefone do lead, retorno humano, limite de minutos e cobrança. Só depois o responsável aprova a flag de cada tenant.
9. Há dependências **ainda não implementadas** para UX completa (cadastro assistido de linha/voz, confirmação de fonte de consentimento, UI operacional e transferência humana real). **NÃO** marcar PR como concluído enquanto faltar essa integração.

## Semântica de custos
`reserved_usd_micros` reserva crédito antes de qualquer chamada. O campo legado `billed_usd_micros` após callback contém **estimativa contábil provisória** com teto da reserva, não fatura confirmada Twilio/ElevenLabs; confrontar custos reais com faturamento de ambos. Se chamada excede 180s, callback inválido, perda de rede ou evento inconclusivo: marcar para revisão humana e **não rediscar** automaticamente. Falha posterior à tentativa de originação é `delivery_unknown`.

## Limitações de segurança / próximo fechamento deste PR
- Inbound por número único, webhook HMAC Twilio, sem tenant derivado de payload.
- Outbound apenas por dono/admin autenticado, janela 09h–18h seg–sex (São Paulo), lead existente e autorização ativa para o número exato.
- Não há chamada em massa nem tentativa automática em horário indesejado.
- A validação do papel humano e do atendimento sensível deve ficar por conta de ferramentas CRM de leitura limitada, com autorização do servidor. O prompt do agente não concede autonomia.
- A transferência de ligação para humano exige configuração do sistema ElevenLabs/Twilio e teste real; não é demonstrada neste PR ainda.
- O modelo `LeadCall` representa chamadas manuais; o histórico de chamadas de IA é separado em `FlipVoiceCall`, com endpoint redigido para a empresa.
- Número real da linha permanece em `flip_voice_lines` com autorização restrita, enquanto sessões armazenam apenas hash HMAC.

## Critérios de aceite
- CI Typecheck, Prisma Validate, Python tests, build e Playwright verdes.
- Simulações de Twilio e ElevenLabs sem tráfego de saída e testes multi-tenant transacionais em banco descartável.
- Verificação real de assinatura Twilio, rejeição de duplicatas, reconciliação e corrida de orçamento.
- Piloto inbound e outbound com números internos, voz autorizada e LLM configurado (sem produção); confirmação de Twilio e ElevenLabs.
- Teste de ausência de permissão e rollback; aprovações explícitas antes de habilitar produção.

## Documentação oficial
- https://elevenlabs.io/docs/eleven-agents/api-reference/integrations/twilio/outbound-call
- https://elevenlabs.io/docs/eleven-agents/api-reference/integrations/twilio/register-call
- https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration/
- https://www.twilio.com/docs/usage/webhooks/webhooks-security
