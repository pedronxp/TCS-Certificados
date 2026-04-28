# TCS Certificados

Painel web completo para criar modelos de certificados, emitir certificados individuais ou em lote, gerar arquivos PDF/DOCX e validar autenticidade por QR Code.

O projeto foi pensado para cenários administrativos em que a equipe precisa manter padronização visual, rastreabilidade das emissões e uma experiência simples para operadores que emitem muitos certificados no dia a dia.

## Sumário

- [Visão Geral](#visão-geral)
- [Principais Recursos](#principais-recursos)
- [Stack](#stack)
- [Como Rodar Localmente](#como-rodar-localmente)
- [Como Rodar com Supabase](#como-rodar-com-supabase)
- [Fluxos do Sistema](#fluxos-do-sistema)
- [Emissão em Lote](#emissão-em-lote)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Comandos Úteis](#comandos-úteis)
- [Validação e Segurança](#validação-e-segurança)
- [Documentação Técnica](#documentação-técnica)

## Visão Geral

O TCS Certificados centraliza a vida útil de um certificado:

1. O administrador cria um modelo visual a partir de PDF, DOCX ou imagem.
2. O sistema identifica ou permite configurar variáveis como nome, empresa, data, curso e demais campos.
3. O operador emite certificados individualmente ou por lote.
4. Cada certificado recebe código de verificação, QR Code e arquivos gerados.
5. A consulta pública confirma a autenticidade pela rota de validação.
6. O histórico permite localizar, baixar e revogar certificados emitidos.

## Principais Recursos

| Área | Recursos |
| --- | --- |
| Autenticação | Login com sessão JWT em cookie HTTP-only e perfis `ADMIN` e `OPERADOR`. |
| Usuários | Cadastro e administração de usuários por perfil. |
| Modelos | Criação, edição, duplicação e exclusão de modelos de certificados. |
| Editor visual | Posicionamento de textos, variáveis e QR Code sobre o layout base. |
| Emissão individual | Formulário dinâmico criado a partir das variáveis do modelo. |
| Emissão em lote | Fluxo guiado, validação de dados, processamento assíncrono e progresso em tela. |
| Histórico | Busca, filtros, paginação, download de arquivos e revogação. |
| Validação pública | Página pública `/validar/[codigo]` para conferência de autenticidade. |
| Arquivos | Geração de PDF e DOCX, com armazenamento em Supabase Storage quando configurado. |

## Stack

- Next.js 16 com App Router e TypeScript.
- React 19.
- Tailwind CSS.
- Prisma ORM.
- PostgreSQL.
- Supabase Storage para arquivos gerados.
- JWT com `jose` em cookie HTTP-only.
- `bcryptjs` para hash de senha.
- `pdf-lib`, `docx`, `docxtemplater`, `pizzip` e `mammoth` para geração e leitura de documentos.
- `csv-parse` e `xlsx` para importação de planilhas.
- Playwright para suporte de renderização quando necessário.

## Como Rodar Localmente

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as variáveis de ambiente

O Next.js usa `.env.local` durante o desenvolvimento. O Prisma CLI usa `.env`.

```bash
cp .env.example .env.local
cp .env.example .env
```

Em Windows PowerShell, caso `cp` não esteja disponível:

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.example .env
```

### 3. Suba o PostgreSQL local

```bash
docker compose up -d
```

O `docker-compose.yml` sobe um PostgreSQL 16 em `localhost:5432`, com banco `tcs_certificados`, usuário `postgres` e senha `postgres`.

### 4. Aplique as migrations e gere o Prisma Client

```bash
npm run prisma:migrate
npm run prisma:generate
```

### 5. Crie o usuário administrador inicial

```bash
npm run prisma:seed
```

Credenciais padrão:

| Campo | Valor |
| --- | --- |
| E-mail | `admin@tcs.local` |
| Senha | `admin123456` |

### 6. Instale o Chromium do Playwright

```bash
npm run playwright:install
```

### 7. Rode o painel

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

## Como Rodar com Supabase

1. Crie um projeto no Supabase.
2. Em **Project Settings > Database**, copie a connection string Postgres e coloque em `DATABASE_URL`.
3. Em **Project Settings > API**, copie as chaves públicas e de serviço.
4. Em **Storage**, crie um bucket privado chamado `certificados`.
5. Configure `.env` e `.env.local`.
6. Rode migrations, seed e aplicação normalmente.

Exemplo de variáveis Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL="https://seu-projeto.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-chave-publica"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sua-chave-publicavel"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
SUPABASE_CERTIFICATE_BUCKET="certificados"
```

Para ambientes com Supabase e Prisma, prefira a connection string recomendada pelo painel do Supabase. Em alguns cenários, a URL pooled na porta `6543` ajuda a evitar falhas intermitentes de conexão.

## Fluxos do Sistema

### Administrador

- Acessa o painel com perfil `ADMIN`.
- Cadastra operadores.
- Cria modelos de certificado.
- Configura variáveis e elementos visuais.
- Emite certificados.
- Consulta histórico.
- Revoga certificados quando necessário.

### Operador

- Acessa o painel com perfil `OPERADOR`.
- Emite certificados usando modelos cadastrados.
- Gera lotes.
- Consulta histórico e baixa arquivos.

### Público externo

- Acessa a rota `/validar/[codigo]`.
- Confere dados do certificado.
- Verifica se o certificado está emitido ou revogado.

## Emissão em Lote

A emissão em lote foi estruturada para evitar travamentos de tela e facilitar acompanhamento de grandes volumes.

O fluxo atual permite:

- escolher o modelo;
- informar dados comuns do lote, como empresa e data;
- preencher variáveis compartilhadas;
- colar uma lista de nomes;
- revisar duplicidades e campos obrigatórios;
- iniciar geração assíncrona;
- acompanhar progresso por toast;
- consultar os últimos lotes gerados.

Regras importantes:

- o lote exige empresa e data;
- empresa e data devem ser consistentes para todos os certificados do lote;
- cada item processado atualiza o progresso;
- erros por linha são preservados no registro do lote;
- certificados gerados ficam vinculados ao lote.

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URL de conexão PostgreSQL usada pelo Prisma. |
| `SESSION_SECRET` | Sim | Chave para assinar sessões JWT. Troque em produção. |
| `NEXT_PUBLIC_APP_URL` | Sim | URL pública usada para links e QR Codes. |
| `ADMIN_NAME` | Seed | Nome do admin criado pelo seed. |
| `ADMIN_EMAIL` | Seed | E-mail do admin criado pelo seed. |
| `ADMIN_PASSWORD` | Seed | Senha inicial do admin. Troque em produção. |
| `NEXT_PUBLIC_SUPABASE_URL` | Opcional | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Opcional | Chave pública Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Opcional | Chave publishable Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Chave server-side para gravar arquivos no Storage. |
| `SUPABASE_CERTIFICATE_BUCKET` | Opcional | Bucket onde PDFs e DOCXs são armazenados. |

## Comandos Úteis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Cria build de produção. |
| `npm run start` | Roda o build de produção. |
| `npm run lint` | Executa ESLint. |
| `npm run prisma:generate` | Gera Prisma Client. |
| `npm run prisma:migrate` | Aplica migrations em desenvolvimento. |
| `npm run prisma:seed` | Cria dados iniciais. |
| `npm run playwright:install` | Instala Chromium usado pelo Playwright. |

## Validação e Segurança

- Senhas são armazenadas com hash `bcrypt`.
- Sessões usam cookie HTTP-only.
- Rotas privadas exigem usuário autenticado.
- Perfis controlam acesso administrativo.
- `SUPABASE_SERVICE_ROLE_KEY` fica somente no servidor.
- Certificados emitidos recebem código único de verificação.
- Certificados revogados continuam rastreáveis no histórico e na validação pública.

## Estrutura do Projeto

```text
prisma/
  migrations/        Migrations do banco
  schema.prisma      Modelo de dados Prisma
  seed.ts            Criação do admin inicial
src/
  app/               Páginas e rotas API do Next.js
  components/        Componentes de interface
  lib/               Regras de negócio e integrações
docs/
  README_TECNICO.md  Documentação técnica detalhada
```

## Documentação Técnica

Para entender arquitetura, modelo de dados, rotas, fluxos internos, geração de arquivos e troubleshooting:

- [README técnico](docs/README_TECNICO.md)
- Apresentação do projeto: `docs/TCS-Certificados-Apresentacao.pptx`

## Observações de Produção

Antes de publicar:

- troque `SESSION_SECRET`;
- troque `ADMIN_PASSWORD`;
- confirme `NEXT_PUBLIC_APP_URL`;
- configure HTTPS;
- restrinja acesso ao bucket privado;
- revise políticas de backup do banco;
- rode `npm run build`;
- aplique migrations no banco de produção com cuidado.
