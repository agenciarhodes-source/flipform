# Segurança e governança do FlipForm — leia primeiro

> **Versão:** 1.0 · 28/10/2026 · **Dono deste conjunto:** responsável pela segurança do FlipForm (ver Parte 1 da Política).
> **Revisão:** a cada 12 meses, ou antes se mudar algo grande (novo fornecedor, novo tipo de dado, incidente).

Este é o guia de entrada. Ele explica, em linguagem simples, **o que é cada documento, por que ele existe e como tudo se encaixa**. Se você só tiver tempo para ler um arquivo, leia este.

---

## 1. Por que existem "documentos de segurança"?

Proteger um sistema tem duas partes:

1. **A parte técnica**: o que o sistema faz sozinho. Exemplos no FlipForm: senha guardada embaralhada, CPF criptografado, o login conferido no banco a cada clique, os testes automáticos que travam um código inseguro.
2. **A parte de governança**: as **regras escritas** que dizem *quem* faz *o quê*, *quando* e *como provar* que fez. Exemplos: quem pode ver dados de clientes, o que fazer se houver um vazamento, com que frequência testar o backup.

Uma certificação (ISO 27001, SOC 2) ou um cliente grande pergunta as duas coisas: "o sistema é seguro?" e "**como vocês sabem e como provam?**". Os documentos desta pasta respondem a segunda pergunta.

> **Analogia:** um prédio pode ter boas fechaduras (técnica), mas o seguro só aceita se houver também um regulamento: quem tem chave, o que fazer em incêndio, quando revisar o extintor (governança).

## 2. As três regras de ouro de um documento de segurança

1. **Escreva só o que é verdade.** Documento que promete o que não é feito é pior que nenhum: numa auditoria, vira "não conformidade". Por isso, quando algo ainda não está feito, ele aparece como **pendência** no Registro de Riscos (arquivo 08), e não como se estivesse pronto.
2. **Tenha um dono e uma data.** Todo controle tem alguém responsável e uma frequência (diária, semanal, anual).
3. **Guarde a prova.** "Fizemos o teste de backup" só vale se houver registro (data, quem fez, resultado). As provas automáticas do FlipForm ficam no GitHub (Actions) e no registro de auditoria do sistema.

## 3. Os documentos, um por um

| Arquivo | Em uma frase | Pergunta que ele responde |
|---|---|---|
| [01 — Política de Segurança da Informação](01-politica-seguranca-informacao.md) | O "documento-mãe": princípios e responsabilidades. | Qual é o compromisso da empresa com segurança e quem cuida disso? |
| [02 — Controle de Acesso](02-controle-de-acesso.md) | Quem pode entrar e ver o quê, e como isso é conferido. | Como garantimos que cada pessoa só vê o que deve? |
| [03 — Resposta a Incidentes](03-resposta-a-incidentes.md) | O passo a passo quando algo dá errado. | O que fazemos se houver um vazamento ou invasão? |
| [04 — Backup e Recuperação](04-backup-e-recuperacao.md) | Como os dados são copiados e recuperados. | Se o banco for apagado, em quanto tempo voltamos e quanto perdemos? |
| [05 — Gestão de Fornecedores](05-fornecedores.md) | Lista das empresas que tocam nos dados e o que cada uma recebe. | Quem mais tem acesso aos dados dos nossos clientes? |
| [06 — Registro de Tratamento de Dados (LGPD)](06-registro-tratamento-dados-lgpd.md) | O "inventário" dos dados pessoais exigido pela LGPD. | Que dados pessoais temos, para quê, por quanto tempo e com quem compartilhamos? |
| [07 — Desenvolvimento Seguro](07-desenvolvimento-seguro.md) | Como o código é escrito, revisado, testado e publicado. | Como evitamos que uma mudança abra uma brecha? |
| [08 — Registro de Riscos e Pendências](08-registro-de-riscos.md) | A lista honesta do que ainda falta, com prioridade. | O que ainda não está bom e qual é o plano? |

## 4. Como tudo se encaixa (o "ciclo")

As normas de segurança funcionam em um ciclo chamado **PDCA** (Planejar, Fazer, Checar, Agir):

1. **Planejar**: escrever as regras (estes documentos) e listar os riscos (arquivo 08).
2. **Fazer**: o sistema e a equipe seguem as regras (os controles técnicos e as rotinas).
3. **Checar**: provas automáticas toda semana (Gitleaks, Semgrep, OWASP ZAP), revisão de acessos a cada 3 meses, teste de backup a cada 3 meses.
4. **Agir**: o que a checagem encontrar vira item no Registro de Riscos, com dono e prazo.

## 5. Pequeno dicionário

| Termo | O que significa, sem jargão |
|---|---|
| **Confidencialidade, Integridade, Disponibilidade** | Os três objetivos da segurança: só quem deve **vê** o dado; o dado **não é alterado** sem querer ou por má-fé; o sistema **está no ar** quando precisa. |
| **Controle** | Qualquer medida que reduz um risco (uma regra, uma trava no sistema, um teste). |
| **Incidente de segurança** | Qualquer evento que ameace os dados ou o sistema: vazamento, invasão, perda de dados, acesso indevido. |
| **Criptografia** | Embaralhar um dado com uma chave secreta. Sem a chave, o dado é ilegível. |
| **MFA / 2FA** | Login em duas etapas: senha + código do Google Authenticator. Quem rouba a senha ainda não entra. |
| **Backup** | Cópia dos dados guardada para recuperar em caso de perda. |
| **RPO** | "Quanto de dado aceitamos perder." RPO de 1 hora = no pior caso, perdemos a última hora. |
| **RTO** | "Em quanto tempo voltamos ao ar." RTO de 4 horas = o sistema volta em até 4 horas. |
| **Controlador (LGPD)** | Quem decide o que fazer com o dado pessoal. Para os leads, é a **empresa cliente** do FlipForm. |
| **Operador (LGPD)** | Quem trata o dado em nome do controlador. Para os leads, é o **FlipForm**. |
| **Encarregado / DPO** | A pessoa de contato para assuntos de dados pessoais (titulares e ANPD). A LGPD exige que ela seja nomeada. |
| **ANPD** | Autoridade Nacional de Proteção de Dados: o "órgão fiscal" da LGPD. |
| **Titular** | A pessoa a quem o dado se refere (ex.: o lead). |
| **Fornecedor / suboperador** | Empresa contratada que também toca nos dados (ex.: Neon guarda o banco, OpenAI processa o texto da IA). |
| **Princípio do menor privilégio** | Cada pessoa recebe só o acesso mínimo de que precisa para o trabalho. |
| **Log / trilha de auditoria** | Registro automático de quem fez o quê e quando. |
| **CI (Integração Contínua)** | Os testes que o GitHub roda sozinho em cada mudança antes de ela ir ao ar. |

## 6. O que fazer com estes documentos

1. **Ler** cada um uma vez (comece pelo 01 e pelo 08).
2. **Preencher** os campos marcados com `[PREENCHER]` (razão social, nome do Encarregado, contatos).
3. **Aprovar**: o responsável pela empresa assina/aprova a Política (arquivo 01). Basta registrar a aprovação no histórico do documento.
4. **Seguir as rotinas** com data marcada (ver tabela "Calendário" na Política).
5. **Atualizar** quando algo mudar. Toda mudança passa por PR, então o próprio GitHub guarda o histórico de versões.
