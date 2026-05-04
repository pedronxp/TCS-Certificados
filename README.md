# TCS Certificados

Sistema web para criar modelos de certificados, emitir certificados individuais ou em lote, gerar arquivos PDF/DOCX e validar autenticidade por código e QR Code.

Este README está dividido em duas partes:

- **Parte 1: Apresentação**, para entender o produto, módulos, perfis e fluxo de uso.
- **Parte 2: Guia técnico**, para instalar, configurar, executar, testar e preparar o sistema para produção.

## Sumário

- [Parte 1: Apresentação](#parte-1-apresentação)
- [O que o sistema resolve](#o-que-o-sistema-resolve)
- [Principais módulos](#principais-módulos)
- [Perfis de acesso](#perfis-de-acesso)
- [Fluxo de uso](#fluxo-de-uso)
- [Validação, retenção e compartilhamento](#validação-retenção-e-compartilhamento)
- [Parte 2: Guia técnico](#parte-2-guia-técnico)
- [Stack](#stack)
- [Pré-requisitos](#pré-requisitos)
- [Passo a passo local](#passo-a-passo-local)
- [Configuração com Supabase](#configuração-com-supabase)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Comandos úteis](#comandos-úteis)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Rotas principais](#rotas-principais)
- [Regras de segurança e permissão](#regras-de-segurança-e-permissão)
- [Checklist de produção](#checklist-de-produção)
- [Documentação complementar](#documentação-complementar)

---

# Parte 1: Apresentação

## O que o sistema resolve

O TCS Certificados centraliza a emissão e validação de certificados em um painel privado. A proposta é reduzir trabalho manual, manter padrão visual, registrar quem emitiu cada certificado e permitir que qualquer pessoa valide a autenticidade por uma URL pública.

O sistema atende cenários como:

- empresas que emitem certificados de treinamento;
- equipes administrativas que precisam de rastreabilidade;
- emissão recorrente de certificados com modelos padronizados;
- validação pública de certificados por QR Code;
- controle de histórico por usuário e por administrador.

## Principais módulos

| Módulo | O que faz |
| --- | --- |
| Dashboard | Mostra visão geral de modelos, certificados e acessos autorizados. |
| Modelos | Lista modelos disponíveis e exibe preview visual do certificado. |
| Editor de modelo | Permite configurar variáveis, textos e QR Code sobre o layout do certificado. |
| Emissão individual | Gera certificado preenchendo os campos exigidos pelo modelo. |
| Emissão em lote | Permite ao admin gerar vários certificados a partir de uma lista de nomes/dados. |
| Histórico | Lista certificados emitidos, status, downloads, validação e ações administrativas. |
| Validação pública | Rota `/validar/[codigo]` para confirmar autenticidade do certificado. |
| Usuários | Área administrativa para gerenciar acessos. |

## Perfis de acesso

### Administrador

O administrador tem acesso completo ao painel:

1. Cadastra e gerencia usuários.
2. Cria, importa, edita e remove modelos.
3. Emite certificados individuais.
4. Emite certificados em lote.
5. Visualiza o histórico geral.
6. Revoga, oculta, programa exclusão e remove certificados.

### Usuário

Na interface, o perfil operacional aparece como **USUÁRIO**. No banco e no código, a role técnica permanece como `OPERADOR`.

O usuário comum tem acesso reduzido:

1. Emite certificados individualmente.
2. Visualiza modelos disponíveis para emissão.
3. Consulta apenas o próprio histórico.
4. Baixa apenas arquivos dos certificados que ele emitiu.
5. Não vê ações administrativas.
6. Não emite certificados em lote.

## Fluxo de uso

### 1. Configuração inicial

1. O administrador acessa o painel.
2. Cria usuários autorizados.
3. Cria ou importa modelos de certificado.
4. Define campos obrigatórios, textos e posição do QR Code.

### 2. Emissão individual

1. O usuário acessa **Emitir**.
2. Escolhe um modelo.
3. Preenche os campos obrigatórios.
4. O sistema gera os arquivos PDF/DOCX.
5. O certificado fica registrado no histórico do usuário.

### 3. Emissão em lote

1. Apenas o administrador acessa **Emitir em lote**.
2. Escolhe o modelo.
3. Informa dados comuns do lote.
4. Cola ou importa a lista de participantes.
5. Revisa pendências e duplicidades.
6. Inicia o processamento.
7. Acompanha o progresso e consulta o resultado no histórico.

### 4. Validação pública

1. Cada certificado recebe um `verificationCode` sequencial no padrao `TCS-BR-ANO-0001`.
2. O certificado renderizado inclui código e QR Code.
3. A URL pública segue o formato `/validar/[codigo]`.
4. A página pública mostra se o certificado é válido ou revogado.

## Validação, retenção e compartilhamento

### Validação

Sim. Cada certificado emitido recebe um código único de validação. A rota pública `/validar/[codigo]` permite consultar a autenticidade sem login.

Modelos que tiverem a variável `{{COD}}` recebem automaticamente a numeração global do sistema, como `0001`, `0002`, `0003`. Esse campo não deve ser preenchido pelo operador.

### Tempo de permanência

Por padrão, certificados ficam válidos no sistema por **2 anos**, configurado pela variável `CERTIFICATE_VALIDITY_YEARS`.

O administrador também pode programar exclusão usando `deleteAt`. Certificados com exclusão programada podem ser removidos por rotina de limpeza.

### WhatsApp

Não há integração direta com WhatsApp Business API, Twilio ou Z-API. O sistema fornece um link simples de compartilhamento para WhatsApp com a URL pública de validação.

---

# Parte 2: Guia técnico

## Stack

- Next.js 16 com App Router.
- React 19.
- TypeScript.
- Tailwind CSS 4.
- Prisma ORM.
- PostgreSQL.
- Supabase Storage opcional para arquivos.
- JWT com `jose` em cookie HTTP-only.
- `bcryptjs` para hash de senha.
- `docx`, `docxtemplater`, `pizzip`, `mammoth`, `pdf-lib` e `qrcode` para documentos.
- `csv-parse` e `xlsx` para importação.
- Microsoft Graph, CloudConvert, Gotenberg ou LibreOffice para conversão DOCX para PDF.
- Playwright para suporte de renderização e verificações visuais.

## Pré-requisitos

Instale antes de rodar o projeto:

- Node.js compatível com o projeto.
- npm.
- Docker e Docker Compose, se for usar PostgreSQL/Gotenberg locais.
- Git.

Recomendado para desenvolvimento:

- PostgreSQL local via Docker.
- Chromium do Playwright, instalado pelo script do projeto.

## Passo a passo local

### 1. Clone o repositório

```bash
git clone https://github.com/pedronxp/TCS-Certificados.git
cd TCS-Certificados
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Crie os arquivos de ambiente

O Next.js usa `.env.local` em desenvolvimento. O Prisma CLI usa `.env`.

```bash
cp .env.example .env.local
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.example .env
```

### 4. Suba os serviços locais

```bash
docker compose up -d
```

Esse comando sobe os serviços locais opcionais:

- PostgreSQL 16 em `localhost:5432`;
- banco `tcs_certificados`;
- usuário `postgres`;
- senha `postgres`;
- Gotenberg em `localhost:3010` para conversão DOCX/PDF, caso você não configure uma API externa.

### 5. Gere o Prisma Client

```bash
npm run prisma:generate
```

### 6. Aplique as migrations

```bash
npm run prisma:migrate
```

### 7. Crie o administrador inicial

```bash
npm run prisma:seed
```

Credenciais padrão de desenvolvimento:

| Campo | Valor |
| --- | --- |
| E-mail | `admin@tcs.local` |
| Senha | `admin123456` |

Troque esses valores em qualquer ambiente que não seja local.

### 8. Instale o Chromium do Playwright

```bash
npm run playwright:install
```

### 9. Rode o servidor de desenvolvimento

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

### 10. Verifique o build

Antes de abrir PR ou publicar:

```bash
npm run lint
npm run build
```

## Configuração com Supabase

O Supabase é opcional e pode ser usado para armazenar arquivos gerados.

### 1. Crie o projeto

1. Acesse o Supabase.
2. Crie um novo projeto.
3. Copie a connection string Postgres.
4. Configure `DATABASE_URL`.

### 2. Configure as chaves

No painel do Supabase:

1. Acesse **Project Settings > API**.
2. Copie a URL do projeto.
3. Copie a chave pública.
4. Copie a service role key para uso server-side.

### 3. Configure o bucket

1. Acesse **Storage**.
2. Crie um bucket privado chamado `certificados`.
3. Configure `SUPABASE_CERTIFICATE_BUCKET="certificados"`.

Exemplo:

```env
NEXT_PUBLIC_SUPABASE_URL="https://seu-projeto.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-chave-publica"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sua-chave-publicavel"
SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
SUPABASE_CERTIFICATE_BUCKET="certificados"
```

Para ambientes com Supabase e Prisma, prefira a connection string recomendada pelo painel do Supabase. Em alguns cenários, a URL pooled na porta `6543` ajuda a evitar falhas intermitentes de conexão.

### Keepalive semanal do Supabase

O projeto inclui a migration `20260503190000_add_supabase_keepalive_cron` para manter atividade periódica no banco Supabase.

Ela cria:

- a tabela `public.system_keepalive`;
- a função `public.run_system_keepalive()`;
- o job `tcs-system-keepalive-weekly` no Supabase Cron, executado toda segunda-feira às `09:00 UTC`.

Para aplicar no Supabase de produção:

```bash
npx prisma migrate deploy
```

Para conferir se o job foi criado:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'tcs-system-keepalive-weekly';
```

Para conferir a última execução registrada pela aplicação:

```sql
select last_ping_at, run_count, updated_at
from public.system_keepalive
where id = 1;
```

Se o banco local não tiver `pg_cron`, a migration não quebra: ela cria a tabela/função e apenas não agenda o job. No Supabase, a extensão `pg_cron` deve estar disponível pelo módulo **Integrations > Cron**.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | URL de conexão PostgreSQL usada pelo Prisma. |
| `SESSION_SECRET` | Sim | Chave para assinar sessões JWT. Em produção, não pode ficar vazia nem usar o valor padrão local. |
| `ALLOW_PUBLIC_REGISTRATION` | Não | Habilita cadastro público apenas quando definido como `true`. Padrão: desativado. |
| `NEXT_PUBLIC_APP_URL` | Sim | URL pública usada em links e QR Codes. |
| `CERTIFICATE_VALIDITY_YEARS` | Não | Quantidade padrão de anos até `deleteAt`. Padrão do projeto: `2`. |
| `CERTIFICATE_RETENTION_DAYS` | Não | Compatibilidade com ambientes antigos: quando definida, sobrescreve a validade em anos usando dias corridos. |
| `ADMIN_NAME` | Seed | Nome do admin criado pelo seed. |
| `ADMIN_EMAIL` | Seed | E-mail do admin criado pelo seed. |
| `ADMIN_PASSWORD` | Seed | Senha inicial do admin. Troque em produção. |
| `NEXT_PUBLIC_SUPABASE_URL` | Opcional | URL do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Opcional | Chave pública Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Opcional | Chave publishable Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Chave server-side para gravar arquivos no Storage. |
| `SUPABASE_CERTIFICATE_BUCKET` | Opcional | Bucket onde PDFs e DOCXs são armazenados. |
| `MICROSOFT_GRAPH_TENANT_ID` | Opcional | Tenant Microsoft Entra usado pelo conversor Microsoft Graph. |
| `MICROSOFT_GRAPH_CLIENT_ID` | Opcional | Application/client ID do app registrado no Microsoft Entra. |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | Opcional | Client secret server-side do app Microsoft Graph. |
| `MICROSOFT_GRAPH_DRIVE_ID` | Opcional | Drive do OneDrive/SharePoint usado para upload temporario e conversao. |
| `MICROSOFT_GRAPH_USER_ID` | Opcional | Usuario dono do OneDrive quando nao houver `MICROSOFT_GRAPH_DRIVE_ID`. |
| `MICROSOFT_GRAPH_FOLDER_PATH` | Opcional | Pasta ja existente para arquivos temporarios. Padrao: raiz do drive. |
| `GOTENBERG_URL` | Opcional | URL da API Gotenberg. Padrão local: `http://localhost:3010`. |
| `CLOUDCONVERT_API_KEY` | Opcional | Chave server-side para converter DOCX em PDF na Vercel sem LibreOffice local. |
| `CLOUDCONVERT_ENGINE` | Opcional | Engine usada no CloudConvert. Padrão: `libreoffice`. |

## Comandos úteis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor de desenvolvimento. |
| `npm run build` | Cria o build de produção. |
| `npm run test` | Executa testes automatizados. |
| `npm run start` | Roda o build de produção. |
| `npm run lint` | Executa ESLint. |
| `npm run prisma:generate` | Gera Prisma Client. |
| `npm run prisma:migrate` | Aplica migrations em desenvolvimento. |
| `npm run prisma:seed` | Cria o usuário admin inicial. |
| `npm run playwright:install` | Instala Chromium usado pelo Playwright. |

## Estrutura do projeto

```text
prisma/
  migrations/        Migrations do banco
  schema.prisma      Modelo de dados Prisma
  seed.ts            Seed do administrador inicial

src/
  app/               Páginas e rotas API do Next.js
  components/        Componentes de interface
  lib/               Regras de negócio, renderização e integrações

docs/
  README_TECNICO.md  Documentação técnica detalhada
  *.pptx             Material de apresentação
```

## Rotas principais

### Páginas privadas

| Rota | Descrição |
| --- | --- |
| `/dashboard` | Painel inicial. |
| `/modelos` | Lista de modelos. |
| `/modelos/novo` | Criação/importação de modelo. |
| `/modelos/[id]/editar` | Editor visual do modelo. |
| `/certificados/emitir` | Emissão individual. |
| `/certificados/lote` | Emissão em lote para admin. |
| `/certificados/historico` | Histórico de certificados. |
| `/usuarios` | Gestão de usuários para admin. |

### Páginas públicas

| Rota | Descrição |
| --- | --- |
| `/login` | Entrada na plataforma. |
| `/register` | Cadastro quando habilitado no fluxo. |
| `/validar/[codigo]` | Validação pública de autenticidade. |

### APIs

| Rota | Descrição |
| --- | --- |
| `/api/auth/login` | Autenticação. |
| `/api/auth/logout` | Encerramento de sessão. |
| `/api/auth/register` | Cadastro de usuário. |
| `/api/templates` | Criação e listagem de modelos. |
| `/api/templates/[id]` | Edição, duplicação e remoção de modelo. |
| `/api/templates/import` | Importação de modelos. |
| `/api/certificates/issue` | Emissão individual. |
| `/api/certificates/batch` | Emissão em lote. |
| `/api/certificates/[id]` | Ações sobre certificado. |
| `/api/certificates/[id]/download/[type]` | Download de PDF/DOCX. |
| `/api/certificates/[id]/revoke` | Revogação. |
| `/api/users` | Gestão de usuários. |

## Regras de segurança e permissão

- Senhas são armazenadas com hash `bcrypt`.
- Sessões usam JWT em cookie HTTP-only.
- Rotas privadas exigem usuário autenticado.
- `ADMIN` acessa gestão, lote e ações administrativas.
- `OPERADOR` aparece como **USUÁRIO** na interface.
- Usuário comum visualiza apenas o próprio histórico.
- Usuário comum não emite em lote.
- Usuário comum não baixa arquivos emitidos por terceiros.
- Certificados recebem `verificationCode` unico no formato `TCS-BR-ANO-0001`, usando numeração global do sistema.
- A variável `{{COD}}` é preenchida automaticamente com a parte numérica global, por exemplo `0001`.
- Certificados revogados continuam rastreáveis.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no servidor.

## Solução de problemas

### Prisma não conecta

Verifique se o Docker está rodando e se `DATABASE_URL` aponta para:

```text
postgresql://postgres:postgres@localhost:5432/tcs_certificados?schema=public
```

Depois rode:

```bash
npm run prisma:generate
npm run prisma:migrate
```

### PDF não é gerado a partir de DOCX

Em produção na Vercel, configure um conversor externo porque não há LibreOffice local no runtime serverless.

Opção recomendada para Vercel:

```env
MICROSOFT_GRAPH_TENANT_ID="seu-tenant-id"
MICROSOFT_GRAPH_CLIENT_ID="seu-client-id"
MICROSOFT_GRAPH_CLIENT_SECRET="seu-client-secret"
MICROSOFT_GRAPH_DRIVE_ID="drive-do-onedrive-ou-sharepoint"
```

O app Microsoft precisa de permissao Microsoft Graph para ler/escrever arquivos no drive usado para conversao, como `Files.ReadWrite.All`, com consentimento administrativo.

Alternativa com CloudConvert:

```env
CLOUDCONVERT_API_KEY="sua-chave-cloudconvert"
CLOUDCONVERT_ENGINE="libreoffice"
```

Alternativa com Gotenberg hospedado fora da Vercel:

```env
GOTENBERG_URL="https://sua-api-gotenberg"
```

No ambiente local com Docker, confira se o Gotenberg está disponível:

```text
http://localhost:3010
```

### QR Code aponta para URL errada

Confirme `NEXT_PUBLIC_APP_URL` no `.env.local` e no `.env`.

Exemplo local:

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Login do admin não funciona

Rode o seed novamente:

```bash
npm run prisma:seed
```

Confirme se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estão configurados antes do seed.

## Checklist de produção

Antes de publicar:

1. Troque `SESSION_SECRET`.
2. Troque `ADMIN_PASSWORD`.
3. Mantenha `ALLOW_PUBLIC_REGISTRATION="false"`, salvo se o cadastro público for intencional.
4. Configure `NEXT_PUBLIC_APP_URL` com a URL pública real.
5. Configure HTTPS.
6. Configure banco PostgreSQL gerenciado.
7. Rode migrations no banco de produção.
8. Configure bucket privado no Supabase, se usar Storage.
9. Restrinja acesso às chaves server-side.
10. Configure `MICROSOFT_GRAPH_*`, `CLOUDCONVERT_API_KEY` ou `GOTENBERG_URL` para gerar PDF a partir de DOCX na Vercel.
11. Configure rotina de limpeza para certificados com `deleteAt` vencido.
12. Valide geração de PDF/DOCX no ambiente final.
13. Rode `npm run lint`.
14. Rode `npm run build`.

## Documentação complementar

- [Documentação técnica detalhada](docs/README_TECNICO.md)
- Apresentação do projeto: `docs/TCS-Certificados-Apresentacao.pptx`
