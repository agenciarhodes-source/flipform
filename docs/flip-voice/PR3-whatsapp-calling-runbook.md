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
- [x] Em código: **solicitação de permissão** pela API autenticada `/api/flip-voice/whatsapp/permission-request`, limitada a 1 tentativa/24h e 2/7 dias, com prova da mensagem Twilio enviada, callback assinado e vínculo com tenant e número. **Não homologado com sender real** e ainda exige integração segura com o webhook atual de mensagens.
- [x] Núcleo de **originação WhatsApp outbound** com reserva + quota atômica + status + TwiML e endpoint autenticado. **Apenas em código; não homologado**, depende de sender ativo e teste de compatibilidade Twilio/ElevenLabs.
- [ ] Configuração assistida de sender Twilio/WhatsApp e permissões sem SQL manual em produção, protegida por perfil desenvolvedor.
- [ ] **Transferência humana não disponível neste modo:** a documentação ElevenLabs diz que `register-call` NÃO possui transferência nativa. Somente habilitar handoff após projetar, implementar e homologar mecanismo próprio VoIP/SIP, sem ponte PSTN.
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
A versão original dependia do `CallSid` já persistido e podia rejeitar chamadas por uma corrida. A nova implementação grava uma credencial temporária **hash HMAC** por chamada ANTES de solicitar a origem à Twilio, inclui somente a versão opaca no URL de voz assinado pela Twilio e reivindica a execução uma única vez no banco. **O mecanismo ainda precisa ser comprovado em teste E2E com Twilio real**, incluindo retomadas e falhas de rede. Não habilitar saída até esse aceite.

## Segunda tentativa — PR #646 (substitui #644 fechado)
- Nova branch baseada no código não integrado do #644; sem reabertura ou merge do PR cancelado.
- `provider_permission_request_sid` rastreia o pedido real de autorização enviado pela Twilio; resposta `ACCEPTED` sem pedido pendente, recente, não expirado e com SID válido não libera ligação.
- Pedidos supersedidos expiram em vez de revogar o consentimento do destinatário; pedidos incertos contam para o limite e não são reenviados automaticamente.
- `outbound_webhook_ticket_hash` armazena um HMAC único e `outbound_twiml_claimed_at` impede registros repetidos, com callback assinado sobre URL que inclui `ticket`.
- `register-call` recebe `direction=outbound` em ligações iniciadas pelo FlipForm, sem alterar o comportamento PSTN `inbound`.
- Tests offline acrescentados para cotas, permission request SID, ticket obrigatório na URL, migração e direção do fluxo.
- GitHub Actions executava falhas de inicialização **sem steps** em branches distintas, mesmo quando o build da Vercel compilava. **Não interpretar ausência de check como sucesso**. Investigar conta/runner/faturamento GitHub Actions antes do aceite.
- Transferência humano via `register-call` ElevenLabs: **não suportada nativamente**. Deve permanecer indisponível até mecanismo VoIP/SIP implementado e testado.
- Aviso: o backend de permissões Twilio usa webhook de mensagem próprio do sender; **não sobrescrever o WhatsApp Meta existente no FlipForm** sem desenho de roteamento e aprovação do operador.
- Todo o serviço é fail-closed e sem migração de produção; requer staging com sender Twilio WhatsApp Calling ativado, voz consentida, testes e aprovação.

## Retomada dos checks — 24/11/2026
O GitHub Actions voltou a executar normalmente para `main` e outras branches. A branch do PR #646 foi criada quando o Actions não estava disparando workflows; o commit desta revisão deve acionar uma nova execução de CI, Security e Playwright no GitHub. **Não presumir sucesso antes de os checks serem concluídos no SHA da branch.** Até lá, manter o PR em Draft, migração e chamadas desativadas, e proibir merge para produção.
