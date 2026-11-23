# Flip Voice — Plano de implantação FV00–FV08 (23/11/2026)

**Situação:** proposta de engenharia, primeira contribuição em Draft, SEM ativação de serviço. **Repositório:** `agenciarhodes-source/flipform`. **Produto:** Flip Voice dentro do FlipForm (não um novo aplicativo).

## 0. Reaproveitar o que já existe
- `lib/flip-ai/elevenlabs-speech.ts`: TTS da ElevenLabs com saída Ogg/Opus/MP3.
- `lib/whatsapp-ai/voice.ts`, `lib/whatsapp-ai/voice-rules.ts` e `components/whatsapp-ai/voice-manager.tsx`: configuração por tenant e respostas em áudio (não chamada ao vivo).
- `lib/flip-ai/text-model-catalog.ts` / `openai-pricing.ts`: modelo `gpt-6-luna` já cadastrado e tabela US$0,10/M entrada e US$0,50/M saída.
- `components/lead-call-dialog.tsx` e `lib/leads/call-rules.ts`: anotação de chamadas humanas no CRM (não discador VoIP).
- API v1 recente integrada à main no commit `a577ea9`, com `FLIPFORM_API_V1_ENABLED` inicialmente desativado. **Não alterar esse gate nem reabrir a homologação concluída.**
- Quatro workflows legados de reparo que estiverem desativados devem permanecer inalterados; não executá-los como requisito do Flip Voice.

## 1. Arquitetura
```text
Contato / CRM (tenant autenticado)
 -> Política de chamada + consentimento + orçamento + reserva atômica
 -> Serviço Flip Voice (orquestração, eventos e ferramentas mínimas)
 -> ElevenAgents (STT/turn-taking/TTS, voz autorizada)
 -> LLM de texto OpenAI gpt-6-luna por chave própria, via integração Custom LLM
 -> Twilio Voice (PSTN) OU WhatsApp Business Calling (SIP/WebRTC, com permissão)
 -> Webhooks assinados -> registro da sessão e resumo autorizados no CRM
```

**Conexão do Luna:** ElevenAgents permite LLM externo por API compatível com Chat Completions ou Responses. `gpt-6-luna` não processa áudio nativamente: ElevenAgents fornece entrada de fala e saída de voz. Para Chat Completions com tool calling, usar `reasoning_effort: none`, conforme documentação oficial; validar streaming, ferramentas e latência com chamadas simuladas. Não prometer a mesma voz clonada no WhatsApp por TTS e na conversa antes de um ensaio real.

**Runtime:** não rotear fluxo contínuo PCM pelo request/response de uma Vercel Function. Usar transporte de mídia do provedor, webhooks pequenos, autenticação do tenant no serviço interno e fluxo de agentes em tempo real. O WhatsApp não permite ligar via PSTN a partir de chamada WhatsApp. O provedor de números e o contrato de chamadas devem ser validados para o Brasil.

## 2. PRs completos e dependências

| PR lógico | Entrega | Critério de aceite | Depende de |
| --- | --- | --- | --- |
| **FV00** | Plano, contratos tipados, flags OFF, gate puro e testes | Nenhuma ligação habilitada; CI de código e testes | main |
| **FV01** | Schema/migration para `VoiceProfile`, `VoiceConsent`, `VoiceCallSession`, `VoiceCallEvent`, `VoiceBudget`; RBAC e políticas tenant | Isolamento entre A/B, migração reversível testada e nenhuma leitura cruzada | FV00 |
| **FV02** | Cadastro de voz, verificação/consentimento do titular, seleção de `voiceId`, revogação e teste de áudio | Não grava sem permissão; não mistura vozes entre empresas | FV01 |
| **FV03** | Adaptador LLM da Flip AI para ElevenAgents com GPT-6 Luna; ferramentas read-only e escalonamento | Latência e respostas aprovadas; sem inferência jurídica inventada; orçamento de tokens | FV01 |
| **FV04** | Serviço de sessão em tempo real, webhooks assinados, deduplicação, timeout, interrupções e handoff | Replay/webhook forjado não gera sessão; falhas encerram sem cobranças repetidas | FV02, FV03 |
| **FV05** | Twilio PSTN inbound/outbound, dialer autorizado, retorno, identificação de não atendimento | Outbound somente opt-in e iniciativa permitida; chamada de teste controlada no staging | FV04 |
| **FV06** | WhatsApp Business Calling inbound/outbound, permissão específica da Meta, SIP/WebRTC | Permissões verificadas por chamada, sem ponte PSTN e sem chamar contatos não autorizados | FV04 |
| **FV07** | UI Flip Voice (configurações, números, voz, custos, histórico, acesso humano, resumo) | Botões OFF por padrão e RBAC; acessibilidade; relatório por tenant | FV05, FV06 |
| **FV08** | E2E/segurança, carga, auditoria LGPD, rollback e liberação gradual por tenant | CI completo verde, evidência de staging, custos observados, aprovação de piloto; release separado | FV07 |

**Não abrir 9 PRs vazios.** Cada PR deve conter implementação e testes reais, ser pequeno o suficiente para revisão e permanecer Draft até seus gates. Sem merge, deploy produtivo ou compra automática.

## 3. Proteções obrigatórias
1. Flags globais, por tenant, outbound e gravação com default **false**.
2. Só aceitar tenant do contexto autenticado; callbacks assinados e associados à sessão/tenant no banco.
3. Outbound exige contato com consentimento rastreável, não estar em lista de bloqueio, horário permitido, autorização específica da chamada WhatsApp quando aplicável e teto financeiro.
4. Solicitação de humano encerra automação ou encaminha com segurança; não manter conversa fingindo ser funcionário real.
5. Consentimento e licença explícita para voz clonada, retenção mínima, revogação e exclusão orientada pela política aprovada.
6. Sem envio automático de chamadas para leads existentes, automação de funil, campanhas/Ads/Pixel ou alteração de workflow de reparo.
7. Segredos no servidor/cofre, nunca expostos em logs, browser, texto de PR ou payloads históricos.
8. Idempotência forte com reserva de custo e chave única transacional; `evaluateVoiceCallGate` sozinho NÃO assegura concorrência, cotas ou entrega única.
9. Para escritório jurídico: transparência de IA, revisão/escalonamento humano para orientação jurídica, sem promessas de resultado.
10. Chamadas reais apenas depois de checkout financeiro/operacional e aprovação formal por tenant e canal.

## 4. Custos de referência (não são orçamento contratado)

**OpenAI `gpt-6-luna`:** US$ 0,10 / 1M tokens de entrada; US$ 0,50 / 1M de saída. Exemplo **por ligação de 3 minutos**, assumindo 5.000 tokens de entrada e 1.000 de saída ao longo dos turnos: (5000×0,10 + 1000×0,50)/1M = **US$ 0,001** em LLM. Esse número não inclui o áudio. Se a integração encaminhar todo o histórico várias vezes, o consumo real poderá ser maior.

**ElevenAgents:** Creator US$22/mês com 275 min incluídos; excedente US$0,08/min, LLM à parte. **Twilio Brasil celular outbound:** US$0,0663/min e número local US$4,25/mês (conforme disponibilidade). Para **100 chamadas atendidas de 3 min**, simulação:
- ElevenAgents = US$22 + 25×US$0,08 = **US$24,00**.
- Telefonia celular = 300×US$0,0663 + US$4,25 = **US$24,14**.
- GPT-6 Luna texto = 100×US$0,001 = **US$0,10**.
- **Total indicativo: US$48,24 ≈ R$286,55** usando câmbio ilustrativo R$5,94. Não inclui tributos, custos de número adicionais, eventual mídia/roteamento, chamadas não completadas, gravação, provedor WhatsApp, callbacks, excedente de concorrência ou retrabalho.

Para chamadas WhatsApp, **não** aplicar a tarifa PSTN; cotar tarifas Meta/BSP e confirmar requisitos antes de comprar. Custo principal é minutos de voz e telecom; Luna é parcela pequena.

## 5. Fontes de arquitetura e tarifa (rever antes de contratar)
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/deployment-checklist
- https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- https://elevenlabs.io/pricing/agents
- https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration/
- https://www.twilio.com/en-us/voice/pricing/br
- https://www.twilio.com/docs/voice/whatsapp-business-calling

## 6. Status desta primeira entrega
FV00 é apenas especificação + política pura + testes unitários. **Não instalado em produção, não apto a discagem, sem credenciais ou contrato com provedores.** Avançar em FV01 depois de CI; proteger os demais PRs por testes reais.
