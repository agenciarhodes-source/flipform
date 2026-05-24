# First Access & Onboarding — FlipForm

## Fluxo
Pagamento confirmado → token criado → e-mail enviado → cliente define senha → token usado → login → onboarding → dashboard.

## Estados de token

| Estado | Comportamento | Mensagem | Ação disponível | Auditoria |
|---|---|---|---|---|
| válido | Permite definir senha | Defina sua senha | Enviar formulário | `first_access.token_validated` |
| expirado | Bloqueia conclusão | Este link expirou | Login / suporte | `first_access.token_expired` |
| usado | Bloqueia reutilização | Este link já foi utilizado | Login / suporte | `first_access.token_used` |
| inválido | Bloqueia conclusão | Link inválido | Login / suporte | `first_access.token_invalid` |

## Segurança
- Não enviamos senha padrão por e-mail.
- Não criamos senha provisória fixa.
- Não logamos token de first-access.
- Não expomos link completo em audit.
- Token é de uso único.
- Token expirado não pode ser reutilizado.

## Suporte
Quando cliente reportar problemas:
- **Não recebi e-mail**: validar allowed user/tenant ativo e reenviar por fluxo interno/admin.
- **Link expirou**: gerar novo first-access token e reenviar e-mail.
- **Link já foi usado**: orientar login normal em `/login`.
- **Não consigo definir senha**: validar política mínima (8+) e confirmação.

## Smoke
```bash
npm run smoke:test
```

## Referência
- Ver também: .
