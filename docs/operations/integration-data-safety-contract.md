# Contrato de segurança das integrações

Este documento define o comportamento mínimo de segurança para mudanças futuras em integrações do FlipForm. O objetivo é evitar perda de histórico, limpeza silenciosa de vínculos, desconexões acidentais e mutações indevidas em dados comerciais.

## Princípios obrigatórios

1. **Reautorização não apaga vínculos válidos.** Renovar credenciais da mesma identidade deve preservar conta de anúncios, Pixel/Dataset, WABA, número, tokens já válidos e demais seleções persistidas que não precisem ser substituídas.
2. **Desconexão é reversível no histórico.** Conexões Meta, Instagram e WhatsApp devem ser marcadas como `revoked`/equivalente, preservando a linha histórica e o Audit Log. Não usar delete físico como rotina normal de desconexão.
3. **Troca de identidade preserva o vínculo anterior no histórico.** Quando um novo ativo substitui outro, o anterior pode ser revogado, mas não apagado.
4. **Credenciais mascaradas ou omitidas são preservadas.** Salvar outras configurações não pode zerar um segredo já persistido só porque o front-end não reenviou o valor original.
5. **Nenhuma rotina de integração pode apagar Lead, Form, Pipeline, Kanban, Conversation ou histórico comercial como efeito colateral.** Qualquer operação destrutiva nesses domínios exige autorização explícita, PR separado e plano de rollback.
6. **Diagnósticos externos são somente leitura.** Ferramentas de diagnóstico de Meta Ads e integrações não podem possuir chamadas capazes de pausar, ativar, editar ou excluir Campaign, Ad Set ou Ad.
7. **Sem mutação cross-tenant.** Toda gravação de conexão deve estar vinculada ao tenant autorizado e impedir que um ativo já pertencente a outro tenant seja reassociado silenciosamente.
8. **Mudança destrutiva exige intenção explícita.** Qualquer endpoint que realmente apague configuração precisa de ação direta do usuário, confirmação e teste específico. Nunca deve ocorrer em callback, refresh, reautorização, health check ou diagnóstico.
9. **Migrations de integração devem ser aditivas por padrão.** Reparos de schema não devem apagar, truncar ou sobrescrever dados comerciais existentes.
10. **Audit Log acompanha mudanças de vínculo.** Conectar, reautorizar, revogar e trocar ativos deve produzir trilha auditável suficiente para investigação posterior.

## Superfícies protegidas por regressão automática

A suíte `tests/test_integration_data_safety_contract_static.py` bloqueia regressões nas superfícies críticas de Meta Ads, Meta OAuth, Instagram Business Login, WhatsApp Cloud/Embedded Signup, tracking legado e diagnósticos read-only.

Esses testes não substituem revisão humana, mas tornam falhas como limpeza silenciosa de `metaAdAccountId`, `metaPixelId`, credenciais ou exclusão física de conexões um erro de CI antes do merge.

## Regra operacional

Ao alterar uma integração existente:

- preservar configuração e histórico por padrão;
- preferir `update`/soft revoke a `delete`;
- validar o tenant antes de gravar;
- não alterar dados comerciais fora do escopo da integração;
- não executar reparo em produção sem autorização explícita;
- manter o merge manual após checks verdes.
