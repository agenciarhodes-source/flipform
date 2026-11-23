# PR629 — Aceite do responsável operacional (23/11/2026)

**Declaração recebida:** “vamos para proxima etapa. eu aceito o operacional da API”.

**Registro:** o proprietário/representante da Pollo/FlipForm assumiu expressamente a responsabilidade e o aceite **empresarial de continuidade operacional** da API v1. Esta declaração não constitui assinatura digital, aprovação das metas numéricas de RPO/RTO nem certificação técnica de recuperação, isolamento de rede ou conformidade legal.

## Provas já existentes e verificadas

- PR627 → PR628 → PR629: código ainda não mesclado; quatro checks verdes no último commit de evidências anterior a este registro.
- Neon QA isolado: migração aditiva de cinco clocks homologada em branch descartável; totais **102 tabelas, 356 índices, 139 FKs**, com diff de apenas cinco colunas. Snapshot real de esquema + registros sintéticos restaurado anteriormente, **não** PITR com timestamp.
- Vercel `flipform-staging`, branch `security/api-v1-homologation-20261121`, inspeção em 23/11/2026 **sem descriptografar segredos**: `FLIPFORM_API_V1_ENABLED=false`, `PR629_BLOCK_EXTERNAL_EGRESS=true`, `EMAIL_PROVIDER=none`, `MAINTENANCE_GATE=disabled`. Overrides próprios de `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET_CURRENT` e `JWT_SECRET_PREVIOUS` presentes. Estas evidências são um snapshot de configuração, não prova de ausência de egress por todo o runtime.
- Pré-visualização protegida: auth e leitura multi-tenant comprovados com dados sintéticos em código anterior aos relógios; última migração comprovada via SQL em QA, não E2E HTTP mais recente.

## Condições técnicas que permanecem abertas

| Critério | Situação depois do aceite empresarial |
|---|---|
| Responsável pela coordenação operacional | **Aceite declarado** |
| PITR por horário/LSN do esquema real | **Não demonstrado** |
| RPO/RTO definidos quantitativamente e exercício de reconexão | **Não aprovado/comprovado** |
| Isolamento completo de egress de jobs, SDKs e runtime | **Não atestado** |
| Snapshot restore atual em laboratório | **Comprovado (escopo limitado)** |
| Política das dez categorias de retenção e legal hold | **Pendente** |
| E2E HTTP do último esquema com os clocks | **Pendente** |
| Autorização de merge, migração/deploy produtivo e cliente piloto | **Não concedida nesta declaração** |

**Por que a autorização não é total:** a expressão “aceito o operacional” designa aceite do proprietário para conduzir a operação e avançar a preparação. Não estabelece metas de RTO/RPO, não implica que verificações não realizadas passaram, não aprova a política LGPD nem especifica a sequência de ações produtivas autorizadas.

## Continuidade concreta sem colocar clientes em risco

1. Prosseguir com verificação técnica não produtiva de egress e PITR, preferencialmente em branch-raiz totalmente descartável; nenhum ensaio de snapshot deve ser descrito como PITR.
2. Finalizar a política por categoria, com justificativa, exceções, responsabilidade de eliminação e revisão jurídica adequada.
3. Executar E2E do último esquema e do kill switch em preview isolado com dados sintéticos, sem integração real e sem rede de terceiros.
4. Solicitar uma **autorização expressa e separada** para merges #627→#628→#629 e implantação produtiva conservadora com API OFF; somente depois considerar um piloto de cliente específico.

**Decisão de liberação atual: NO_GO.** Manter produção inalterada, API desligada, quatro workflows de manutenção desativados e nenhum expurgo automático.
