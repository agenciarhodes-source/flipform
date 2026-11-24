# Flip Voice — implantação em somente 3 PRs

**Referência:** 24/11/2026. **Repositório:** agenciarhodes-source/flipform.  
**Política:** sem merge automático, sem alterar produção, sem discagem ou ativação de API. A antiga lista FV00–FV08 foi consolidada em somente três PRs; nenhum requisito foi descartado.

## Infraestrutura já existente (reaproveitar)
- ElevenLabs texto-para-áudio: `lib/flip-ai/elevenlabs-speech.ts`.
- Áudio WhatsApp e regras: `lib/whatsapp-ai/voice.ts`, `lib/whatsapp-ai/voice-rules.ts`; configurações e testes existentes.
- GPT-6 Luna: `lib/flip-ai/text-model-catalog.ts` com US$0,10/1M tokens entrada e US$0,50/1M saída.
- LeadCall atual registra chamadas humanas. **Não** é discador VoIP.
- API v1 na `main` com ativação OFF; não reabrir PR00/PR01 nem alterar quatro workflows de reparação.

## PR #636 — Core, GPT-6 Luna e voz clonada (em desenvolvimento, Draft)
Entrega:
1. Persistência aditiva com tabelas `flip_voice_*`: configurações OFF, perfis, prova de consentimento hash, orçamento, sessões, eventos. Relações compostas por `tenant_id` evitam vozes/consentimentos/chamadas cruzados.
2. Política *fail-closed* para autorização de chamadas, bloqueio, opt-in, permissão específica WhatsApp, orçamento e idempotência requerida. **A reserva financeira atômica no banco fica no PR de telefonia**; a política pura sozinha não despacha chamada.
3. Núcleo de agente ElevenAgents, `llm=gpt-6-luna`, `reasoning_effort=none`, português, voz ElevenLabs validada, first-message identificando IA, duração curta e nenhuma ferramenta ativa.
4. Adaptador de provisionamento **apenas de agente de teste**. Inexistem rotas públicas ou gatilhos que executem criação de agente, chamadas, migração ou faturamento. Só código confiável poderia invocar provisionamento com sinalizador explícito.
5. Testes unitários e estáticos: tenant cruzado, consentimento expirado/revogado, voz inválida, habilitação OFF, custo Luna, schema aditivo, agente sem ferramentas.
6. Homologação do build/tipos/Prisma e simulação sem segredos; teste de voz real com pessoa autorizada depende de chave ElevenLabs e consentimento posterior.

**Estado atual:** implementação parcial em Draft, sem demonstração real de conversa por voz e sem DB migration executada. Critério de conclusão do PR: CI verde, migração avaliada sem aplicar em produção, configuração validada com payload de teste e nenhuma exposição pública.

## PR 2 — Telefonia real + CRM + console (futuro)
Entrega combinada dos antigos FV04, FV05 e FV07:
- Motor de sessão, webhook assinado, *tool calls* com autorização por operação e tenant; impedir prompt injection em respostas e dados do CRM.
- Reservas financeiras transacionais/idempotentes, medição, estorno em caso de falha, cotas duráveis e circuit breakers.
- Twilio entrada e saída, horário permitido, consentimento documentado, DNC, interrupção de fala e handoff humano.
- UI e APIs para configurar vozes/números, discagem manual autorizada, atendimentos, transcrição autorizada, resumo, consumo.
- Testes E2E reais só em staging com equipe, sem ativar todos os clientes nem permitir campanha de chamadas em massa.

## PR 3 — WhatsApp Business Calling + finalização (futuro)
Entrega combinada dos antigos FV06 e FV08:
- Integração Meta/BSP/SIP/WebRTC WhatsApp Business Calling.
- Entrada e saída com permissão de chamada verificada por contato, sem ponte PSTN proibida.
- Histórico unificado por tenant, custeio de WhatsApp separado de telefonia, fallback de serviço.
- Testes carga, isolamento, consentimentos, segurança, transcrições, auditoria, rollback e piloto gradativo por tenant.

## Contratos e restrições
- `FLIP_VOICE_*_ENABLED` OFF por padrão. Não permitir ligações ou gravação com um build que só contém o Core.
- Chave de ElevenLabs e OpenAI somente no servidor ou cofre do provedor; nunca enviar valor em logs/PR.
- Qualquer voz clonada requer autorização verificável do titular, escopo específico e possibilidade de revogação.
- A IA deve se apresentar como IA, não como pessoa real, e nunca tomar decisões jurídicas definitivas ou prometer resultados.
- Controle por tenant com FK composta + RBAC + consulta filtrada + testes A/B; FK por si só não substitui autorização.
- PR2 aplica reserva de orçamento **atômica** na transação da sessão, ao contrário de validação só em memória.
- Não incorporar mudanças da estrutura de dados de PR00/PR01 sem avaliação. Não mudar Ads, Pixel, estágios dos leads, cron de manutenção ou secrets.
- Somente habilitar produção após aprovação, testes reais e escolha/contratação explícita dos provedores.

## Estimativa de custos (100 chamadas atendidas × 3 minutos, câmbio R$ 5,94/USD)
- GPT-6 Luna, assumindo 5.000 tokens de entrada + 1.000 saída/chamada: US$ 0,001/chamada, US$ 0,10 total.
- ElevenAgents Creator: US$22 + excedente de 25 min a US$0,08/min = US$24,00.
- Twilio celular Brasil: 300 min × US$0,0663/min = US$19,89, mais número US$4,25 = US$24,14.
- Soma indicativa **US$48,24 (~R$286,55)**/mês, sem impostos, testes, outros serviços, múltiplos números e Meta/WhatsApp. Valor ilustrativo, não preço contratado.

## Testes sugeridos após código no branch
```bash
npx tsx --test tests/flip-voice-policy.test.ts tests/flip-voice-agent-core.test.ts tests/flip-voice-elevenlabs-agent.test.ts
python -m pytest tests/test_flip_voice_schema_static.py
npm run prisma:validate
npm run typecheck
```

## Fontes
- https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- https://elevenlabs.io/docs/api-reference/agents/create
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://www.twilio.com/en-us/voice/pricing/br
