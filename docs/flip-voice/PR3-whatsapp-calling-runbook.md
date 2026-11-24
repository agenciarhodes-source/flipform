# Flip Voice PR3 — WhatsApp Calling, risco operacional e aceites (24/11/2026)

**Status:** PR em DRAFT. Nem PSTN nem WhatsApp foram homologados com ligações reais pelo assistente. **Nenhuma flag, número ou webhook está ativado nesta entrega.** Os dois PRs anteriores (#636 e #641) foram integrados, mas isso não constitui uma central telefônica pronta para o público.

## Arquitetura do terceiro PR
- Transportadora WhatsApp Business Calling: Twilio Programmable Voice com sender WABA autorizado para Voice; **não** usar a integração Meta Cloud existente como se tivesse sido migrada para Twilio.
- Voz/IA: ElevenLabs Conversational AI + GPT-6 Luna mediante agente e configuração autorizados.
- Registro: `FlipVoiceCall` com canal `whatsapp` e custo estimado, com reserva financeira do `FlipVoiceBudget` da empresa.
- Integridade: callbacks de voz e resposta a permissão com HMAC da Twilio, conta verificada, URL pública exata e associação de tenant pelo sender cadastrado no DB.
- Proteções: `FlipVoiceLine.whatsappInboundEnabled/outboundEnabled` ambos OFF; modo default `none`; consentimento específico `FlipVoiceContactPermission`, prova por hash e evento assinado.
- Transferência humana: **somente VoIP/SIP** confirmado pelo provedor. Não conectar chamada do WhatsApp com PSTN e não habilitar transfer até demonstrar no staging.

## Arquivos de implementação adicionados
- `lib/flip-voice/whatsapp-calling-policy.ts`: regras puras, consentimento, expiração conservadora de 7 dias e limite de 5 ligações/24h.
- `lib/flip-voice/whatsapp-twilio-provider.ts`: adaptadores Twilio Voice Call e VOICE_CALL_REQUEST Content Template, ambos sem invocação automática.
- `lib/flip-voice/whatsapp-inbound-service.ts`: inbound com vínculo por tenant, consentimento da voz, reserva atômica, TwiML restrito a VoIP e proteção contra duplicatas.
- `lib/flip-voice/whatsapp-outbound-service.ts`: origem de chamada WhatsApp, sob flags desligadas, autorização do cliente confirmada em webhook Twilio, reserva transacional, limite atômico de 5 chamadas/24h e TwiML por CallSid.
- `app/api/flip-voice/whatsapp/calls/route.ts`: chamada unitária autenticada + histórico por tenant.
- `app/api/flip-voice/whatsapp/outbound-twiml/route.ts`: webhook de execução por CallSid, assinado e impedindo conexão PSTN.
- `app/api/flip-voice/whatsapp/inbound/route.ts`: webhook de entrada protegido por HMAC.
- `app/api/flip-voice/whatsapp/status/route.ts`: callback de encerramento que reconcilia **estimativa** de custo, isolado do canal PSTN.
- `app/api/flip-voice/whatsapp/permission/route.ts`: resposta à solicitação de permissão Twilio; aceita **somente permissão pendente** de tenant e número corretos.
- `prisma/migrations/20261124213000_flip_voice_whatsapp_caller/migration.sql`: migração aditiva, tudo OFF por padrão.

## Flags globais — todos OFF por padrão
```text
FLIP_VOICE_WHATSAPP_ENABLED=false
FLIP_VOICE_WHATSAPP_INBOUND_ENABLED=false
FLIP_VOICE_WHATSAPP_OUTBOUND_ENABLED=false
FLIP_VOICE_WHATSAPP_PERMISSION_WEBHOOK_ENABLED=false
FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED=false
FLIP_VOICE_WHATSAPP_PERMISSION_URL=(vazio)
FLIP_VOICE_WHATSAPP_INBOUND_URL=(vazio)
FLIP_VOICE_WHATSAPP_STATUS_URL=(vazio)
FLIP_VOICE_WHATSAPP_OUTBOUND_TWIML_URL=(vazio)
TWILIO_ACCOUNT_SID=(servidor/cofre)
TWILIO_AUTH_TOKEN=(servidor/cofre)
ELEVENLABS_API_KEY=(servidor/cofre)
FLIP_VOICE_CONTACT_PEPPER=(servidor/cofre)
```

## Restrições da Meta/Twilio
1. Uma empresa só inicia chamada após permissão de WhatsApp, que é diferente do opt-in para telefone tradicional.
2. Os limites da documentação Twilio incluem **1 solicitação de permissão por 24 horas, 2 por 7 dias e até 5 chamadas por dia**, sujeitos a mudanças do fornecedor; mantê-los como limites máximos.
3. Não criar fallback silencioso para telefonia PSTN; WhatsApp→PSTN é bloqueado por política.
4. Um WhatsApp sender ligado a outro BSP/Cloud API pode não ser gerenciável simultaneamente por ElevenLabs. Não tocar nos webhooks de mensagens Meta do FlipForm nem migrar WABA sem aprovação.
5. O webhook de resposta `VOICE_CALL_REQUEST` vai para a URL de **mensagens do sender Twilio**. Se a empresa utiliza um provedor Meta diferente, é necessário um desenho de roteamento SIP/integração, não sobrescrever mensagens existentes.
6. O Twilio Voice/TwiML + `register-call` ElevenLabs em WhatsApp exige **validação real de compatibilidade** com o sender e aplicativo TwiML; a rota requer `FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED=true` após aprovação.

## Pendências que NÃO podem ser ocultadas por CI verde
- [ ] Integração de **envio de pedido de permissão** com limite persistente de frequência e estado pendente; o adaptador existe, ainda não tem API autenticada/orquestrador. Sem isso, não é possível criar novos consentimentos verificáveis pelo fluxo de ponta a ponta.
- [x] Núcleo de **originação WhatsApp outbound** com reserva + quota atômica + status + TwiML e endpoint autenticado. **Apenas em código; não homologado**, depende de sender ativo e teste de compatibilidade Twilio/ElevenLabs.
- [ ] Configuração assistida de sender Twilio/WhatsApp e permissões sem SQL manual em produção, protegida por perfil desenvolvedor.
- [ ] Transferência real para agente humano via SIP/VoIP e teste de retomada no CRM.
- [ ] Histórico e painel operacional unificados, controles de custo com conciliação dos valores reais do fornecedor.
- [ ] Fluxo autorizado de ferramentas CRM (consulta e ações) protegido por RBAC/tenant, sem confiar no prompt.
- [ ] Testar migração em banco descartável, concorrência, limitação de chamadas e restauração; sem tocar Neon produção.
- [ ] Provar ingresso WhatsApp e saída para número da equipe, auditados e aprovados em **staging**, verificando latência, áudio, voz e consentimento.
- [ ] Verificar retenção de conversas e tratamento dos dados segundo LGPD e políticas do cliente.

**Critério para sair de Draft:** todas as verificações automatizadas verdes + itens de implementação acima resolvidos ou explicitamente separados de um release mais limitado, com aceite do dono do sistema. **Não realizar merge enquanto a central estiver incompleta.**

## Documentação oficial
- https://www.twilio.com/docs/voice/whatsapp-business-calling
- https://elevenlabs.io/docs/eleven-agents/whatsapp
- https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking
- https://www.twilio.com/en-us/blog/developers/tutorials/integrations/ai-agent-to-human-agent-elevenlabs-call-handoffs-twilio

## Importante: possível corrida na originação
Na chamada iniciada pela API Twilio, o provedor pode solicitar o TwiML antes de o `CallSid` ter sido persistido na sessão. O webhook só aceita `CallSid` associado ao tenant e a uma chamada autorizada; nesse caso, uma tentativa prematura será rejeitada. É obrigatório reproduzir esta condição em testes E2E e escolher mecanismo transacional de correlação/compensação antes do piloto; **não ativar outbound em produção enquanto isso não estiver resolvido**.
