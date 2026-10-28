# 04 — Política de Backup e Recuperação

> **Versão:** 1.0 · 28/10/2026 · **Dono:** Responsável pela Segurança · **Revisão:** anual; teste a cada 3 meses

> **Para leigos:** backup é a cópia de segurança. Duas perguntas definem um bom backup:
> - **RPO — quanto eu aceito perder?** Se o banco quebrar agora, voltamos à cópia de quando?
> - **RTO — em quanto tempo volto?** Quanto tempo o sistema fica fora do ar até a recuperação?
>
> Um backup que nunca foi testado é só uma esperança. Por isso esta política exige **teste a cada 3 meses**.

## 1. O que precisa de backup

| O quê | Onde fica | Importância |
|---|---|---|
| Banco de dados (empresas, usuários, leads, conversas, configurações) | **Neon** (PostgreSQL 17), região **EUA (us-east-1)**, ramo `production` | Crítico |
| Anexos das conversas | **Cloudflare R2** (armazenamento privado) | Alto. Anexos do chat do site expiram em 7 dias por regra |
| Código | **GitHub** (repositório + cópias locais dos desenvolvedores) | Alto (já é versionado) |
| Configuração e segredos | Variáveis de ambiente da **Vercel** | Alto: manter cópia segura em gerenciador de senhas |

## 2. Situação do banco

### Antes (verificada em 28/10/2026)

| Item | Situação | Comentário |
|---|---|---|
| Histórico para restauração a um ponto no tempo (PITR) | **6 horas** | Dá para voltar o banco a qualquer momento das **últimas 6 horas**. Um problema percebido depois disso não é desfeito por este caminho. |
| Cópias agendadas (snapshots) | **Nenhuma** | Existe só uma cópia manual de 25/09/2026. |
| Ramo de produção protegido | **Não** | Proteger impede exclusão acidental. |

> **Tradução:** se alguém apagasse dados por engano e só percebêssemos no dia seguinte, **não haveria como recuperar** pelo banco.

### Depois (aplicado em 28/10/2026, com autorização do responsável)

| Item | Situação | Comentário |
|---|---|---|
| Histórico para restauração a um ponto no tempo (PITR) | **7 dias** | Dá para voltar o banco a qualquer minuto da última semana. |
| Cópias agendadas (snapshots) | **Diária, às 03h (Brasília), guardada por 30 dias** | Cópia completa de cada dia do último mês. |
| Ramo de produção protegido | **Sim** | O banco de produção não pode ser excluído por engano. |

Custo estimado: menos de US$ 0,50 por mês (preços do plano Launch do Neon: histórico US$ 0,20/GB-mês; snapshots US$ 0,09/GB-mês).

## 3. Metas (o que queremos)

| Meta | Valor | Como chegar |
|---|---|---|
| **RPO** (perda máxima) | 1 minuto para erros percebidos em até 7 dias; 24 horas para o resto (até 30 dias) | PITR de 7 dias + snapshot diário por 30 dias (**em vigor desde 28/10/2026**) |
| **RTO** (tempo para voltar) | 4 horas | Procedimento da seção 5 testado a cada 3 meses |

Qualquer mudança nessas configurações do Neon só é feita com autorização do responsável.

## 4. Regras

1. Antes de qualquer mudança grande no banco, criar um **snapshot manual** (como foi feito em 25/09/2026).
2. Mudanças no banco são só "aditivas" (não apagam colunas ou dados) e só com autorização.
3. Os segredos da Vercel têm cópia em gerenciador de senhas, acessível ao Responsável pela Segurança e a um substituto.
4. Restaurações são feitas **primeiro num ramo separado** do Neon, para conferir, e só depois na produção.

## 5. Como recuperar (resumo)

1. Confirmar o problema e o **horário** em que os dados ainda estavam corretos.
2. No Neon, criar um **ramo novo** a partir desse horário (PITR) ou de um snapshot.
3. Conferir os dados no ramo novo.
4. Restaurar a produção a partir dele (ou copiar só os dados afetados), com autorização.
5. Registrar na tabela de testes/recuperações abaixo.

## 6. Registro de testes de recuperação

| Data | Tipo (teste/real) | O que foi recuperado | Tempo gasto | Resultado | Quem |
|---|---|---|---|---|---|
| [PREENCHER no 1º teste] | | | | | |
