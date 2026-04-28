# TCS Certificados

Painel web para criar modelos visuais de certificados, emitir certificados individualmente ou por planilha, gerar PDF/DOCX e validar autenticidade por QR Code.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma
- Sessão JWT em cookie HTTP-only
- Playwright para PDF
- `docx` para DOCX

## Como Rodar com Supabase

1. Crie um projeto no Supabase.

2. Em **Project Settings > Database**, copie a connection string Postgres e coloque em `DATABASE_URL`.

3. Em **Project Settings > API**, copie:

- `Project URL` para `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` para `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou publishable key para `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `service_role` para `SUPABASE_SERVICE_ROLE_KEY`

4. Em **Storage**, crie um bucket privado chamado `certificados`.

5. Configure ambiente. O Next lê `.env.local`; o Prisma CLI lê `.env`:

```bash
cp .env.example .env.local
cp .env.example .env
```

6. Instale dependências:

```bash
npm install
```

7. Crie as tabelas e o usuário admin:

```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

8. Instale o Chromium usado para gerar PDF:

```bash
npm run playwright:install
```

9. Rode o painel:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

Credenciais padrão do seed:

- E-mail: `admin@tcs.local`
- Senha: `admin123456`

## Como Rodar com PostgreSQL Local

1. Instale dependências:

```bash
npm install
```

2. Configure ambiente. O Next lê `.env.local`; o Prisma CLI lê `.env`:

```bash
cp .env.example .env.local
cp .env.example .env
```

3. Suba o PostgreSQL:

```bash
docker compose up -d
```

4. Crie as tabelas e o usuário admin:

```bash
npm run prisma:migrate -- --name init
npm run prisma:seed
```

5. Instale o Chromium usado para gerar PDF:

```bash
npm run playwright:install
```

6. Rode o painel:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

## Fluxos Implementados

- Login com perfis `ADMIN` e `OPERADOR`.
- Admin cria usuários.
- Admin cria, edita, duplica e exclui modelos.
- Editor visual com fundo, texto, variável, QR Code e controles de posição/estilo.
- Emissão individual com formulário dinâmico por variáveis.
- Emissão em lote por CSV/XLSX.
- Download de PDF e DOCX.
- Histórico de emissões.
- Revogação de certificados.
- Página pública `/validar/[codigo]`.
- Integração com Supabase Postgres e Supabase Storage para os arquivos gerados.

## Observações

- O PDF é a saída oficial com layout preservado.
- O DOCX é editável e contém os dados principais do certificado, podendo variar visualmente conforme o editor usado.
- Para produção, troque `SESSION_SECRET`, `ADMIN_PASSWORD` e `NEXT_PUBLIC_APP_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser exposta no frontend. Ela é usada apenas em rotas server-side para Storage.

## Documentação

- [README técnico](docs/README_TECNICO.md)
- Apresentação do projeto: `docs/TCS-Certificados-Apresentacao.pptx`
