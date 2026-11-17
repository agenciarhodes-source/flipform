# PR 00 — A2-C.2 | Geração offline e auditoria SQL Prisma

Este PR existe somente para gerar SQL oficial com Prisma 5.22.0, auditar os comandos e disponibilizar evidências para revisão humana.

## Proteções

- Esta branch tem deploy automático desativado desde o primeiro commit no vercel.json.
- Workflow disparado apenas para este PR; permissões mínimas contents: read.
- Nenhum segredo do Neon, Vercel, Stripe, Ads, Pixel ou WhatsApp é enviado ao workflow.
- DATABASE_URL e DIRECT_URL são URLs fictícias de loopback porta 1, sem servidor.
- Nenhuma execução de SQL, db push, db execute, migrations, deploy, merge ou acesso a dados reais é autorizada.
- O pacote SQL não se destina a ser executado automaticamente.

## Execução

1. Checar hash Git do schema imutável, 92 modelos, 10 enums e pacote Prisma 5.22.0.
2. Executar testes de falha segura (fail closed).
3. Validar schema e executar prisma migrate diff de modelo vazio para schema Prisma com saída SQL.
4. Conferir somente DDL aditivo, os nomes exatos das 92 tabelas, 10 enums e operações de criação.
5. Anexar no PR o artefato pr00-a2c2-prisma-sql-offline-review (SQL, JSON, hash SHA-256, commit).

## Atenção

A auditoria automática é um filtro inicial. É obrigatória a revisão manual integral, principalmente das regras ON DELETE CASCADE, índices, constraints e coluna vector(1536).
Não integrar este PR nem aplicar o SQL em banco. Qualquer aplicação posterior precisa de autorização específica.
