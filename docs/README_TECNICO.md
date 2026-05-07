# README Técnico - TCS Certificados

Este documento descreve a arquitetura, os módulos, o modelo de dados, os fluxos internos e os cuidados operacionais do TCS Certificados.

O objetivo é permitir que outro desenvolvedor consiga entender a aplicação, rodar o projeto, investigar problemas e evoluir o sistema com segurança.

## Índice

- [Arquitetura Geral](#arquitetura-geral)
- [Tecnologias](#tecnologias)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Modelo de Dados](#modelo-de-dados)
- [Autenticação e Autorização](#autenticação-e-autorização)
- [Modelos de Certificado](#modelos-de-certificado)
- [Emissão Individual](#emissão-individual)
- [Emissão em Lote](#emissão-em-lote)
- [Histórico e Revogação](#histórico-e-revogação)
- [Geração de Arquivos](#geração-de-arquivos)
- [Storage](#storage)
- [Rotas](#rotas)
- [Banco e Migrations](#banco-e-migrations)
- [Comandos de Desenvolvimento](#comandos-de-desenvolvimento)
- [Troubleshooting](#troubleshooting)
- [Roadmap Técnico](#roadmap-técnico)

## Arquitetura Geral

A aplicação usa Next.js App Router com separação simples entre:

- páginas server-side para buscar dados e renderizar telas privadas;
- componentes client-side para interações ricas;
- rotas API para ações de autenticação, templates, usuários e certificados;
- camada `src/lib` para regras de negócio e integrações.

Fluxo resumido:

```text
Usuário autenticado
  -> AppShell privado
  -> Páginas em src/app/(private)
  -> Rotas API em src/app/api
  -> Serviços em src/lib
  -> Prisma
  -> PostgreSQL
  -> Supabase Storage, quando configurado
```

## Tecnologias

| Tecnologia | Uso |
| --- | --- |
| Next.js 16 | Framework web, App Router, server components e API routes. |
| React 19 | Componentes de interface. |
| TypeScript | Tipagem da aplicação. |
| Tailwind CSS | Estilização. |
| Prisma | ORM, migrations e client tipado. |
| PostgreSQL | Banco relacional principal. |
| Supabase | Storage opcional para arquivos gerados. |
| `jose` | Assinatura e validação de JWT. |
| `bcryptjs` | Hash de senhas. |
| `pdf-lib` | Manipulação e geração de PDF. |
| `docx` | Criação de DOCX. |
| `docxtemplater` + `pizzip` | Substituição de placeholders em DOCX base. |
| `mammoth` | Extração de conteúdo de DOCX para preview. |
| `csv-parse` + `xlsx` | Leitura de CSV/XLSX em lote. |
| Playwright | Suporte para renderização quando o Chromium está instalado. |
| Gotenberg / LibreOffice | Conversão DOCX para PDF no preview e na emissão. |
| Collabora Online | Editor DOCX no navegador usando LibreOffice via WOPI. |

## Estrutura de Pastas

```text
src/app
  layout.tsx
  page.tsx
  login/
  validar/[codigo]/
  (private)/
    dashboard/
    usuarios/
    modelos/
    certificados/
  api/
    auth/
    users/
    templates/
    certificates/

src/components
  app-shell.tsx
  login-form.tsx
  certificates/
  templates/

src/lib
  auth.ts
  prisma.ts
  supabase.ts
  certificate-service.ts
  render-certificate.ts
  certificate-layout.ts
  batch-jobs.ts
  document-extract.client.ts

prisma
  schema.prisma
  seed.ts
  migrations/
```

## Modelo de Dados

### Entidades principais

| Entidade | Responsabilidade |
| --- | --- |
| `User` | Usuários do painel, senha e perfil. |
| `CertificateTemplate` | Modelo visual do certificado e arquivo base. |
| `TemplateVariable` | Campos configuráveis do modelo. |
| `CertificateRecipient` | Titular do certificado emitido. |
| `CertificateIssue` | Registro de emissão, status e código de validação. |
| `CertificateBatch` | Controle de lotes processados de forma assíncrona. |
| `GeneratedFile` | Arquivos PDF/DOCX gerados para uma emissão. |

### Perfis

| Perfil | Permissões principais |
| --- | --- |
| `ADMIN` | Gerenciar usuários, modelos, emissões, histórico e revogações. |
| `OPERADOR` | Emitir certificados e consultar histórico. |

### Status relevantes

```text
CertificateStatus
  ISSUED
  REVOKED

CertificateBatchStatus
  RUNNING
  COMPLETED
  FAILED

GeneratedFileType
  PDF
  DOCX
```

### Índices

O schema inclui índices para melhorar consultas de histórico:

- template por nome;
- titular por nome, e-mail e documento;
- emissão por data;
- status + data;
- template + data;
- titular + data;
- emissor + data;
- lote + data.

## Autenticação e Autorização

Arquivo principal:

```text
src/lib/auth.ts
```

Responsabilidades:

- validar credenciais;
- criar sessão JWT;
- gravar cookie HTTP-only;
- recuperar usuário autenticado;
- proteger páginas e APIs privadas;
- redirecionar usuários não autenticados.

O cookie HTTP-only reduz exposição do token ao JavaScript do navegador. A variável `SESSION_SECRET` deve ser forte e exclusiva por ambiente.

## Modelos de Certificado

Arquivos principais:

```text
src/components/templates/template-editor.tsx
src/components/templates/upload-template-button.tsx
src/app/api/templates/route.ts
src/app/api/templates/[id]/route.ts
src/lib/certificate-layout.ts
src/lib/document-extract.client.ts
```

O sistema suporta modelos base em PDF, DOCX ou imagem.

### PDF

O PDF é usado como base visual. Durante a emissão, o sistema desenha textos, variáveis e QR Code sobre o documento.

### DOCX

O DOCX pode conter placeholders como:

```text
{{nome}}
{{empresa}}
{{data}}
{{curso}}
```

Quando esses placeholders existem, o sistema consegue detectá-los e usá-los como variáveis do formulário. O editor preserva o DOCX como base nativa e usa Gotenberg/LibreOffice para gerar uma prévia fiel em PDF.

### Imagem

Imagens funcionam como fundo visual do certificado. Os elementos são posicionados manualmente no editor.

## Emissão Individual

Arquivos principais:

```text
src/app/(private)/certificados/emitir/page.tsx
src/components/certificates/issue-form.tsx
src/app/api/certificates/issue/route.ts
src/lib/certificate-service.ts
```

Fluxo:

1. Operador seleciona um modelo.
2. A tela monta o formulário com base nas variáveis do modelo.
3. Operador preenche os dados do titular.
4. API chama `issueCertificate`.
5. O serviço cria ou reutiliza `CertificateRecipient`.
6. O serviço cria `CertificateIssue` com código único no padrão `TCS-BR-ANO-0001`, usando numeração global do sistema.
7. O sistema gera PDF/DOCX.
8. Se o modelo tiver `{{COD}}`, o render substitui pelo número global, como `0001`.
9. Os arquivos ficam vinculados em `GeneratedFile`.

## Emissão em Lote

Arquivos principais:

```text
src/app/(private)/certificados/lote/page.tsx
src/components/certificates/batch-form.tsx
src/components/certificates/batch-progress-toast.tsx
src/app/api/certificates/batch/route.ts
src/lib/batch-jobs.ts
```

### Fluxo da interface

1. O operador escolhe o modelo.
2. Informa empresa, data e variáveis compartilhadas.
3. Cola a lista de nomes.
4. Revisa o lote.
5. Inicia a geração.
6. O toast acompanha o processamento.
7. A página lista os lotes mais recentes.

### Fluxo da API

1. `POST /api/certificates/batch` recebe formulário manual ou arquivo.
2. A rota normaliza os dados.
3. A rota valida empresa e data.
4. `startBatchJob` cria um `CertificateBatch`.
5. O processamento roda de forma assíncrona.
6. Cada linha chama `issueCertificate`.
7. Progresso, criados e erros são persistidos.
8. O lote termina como `COMPLETED` ou `FAILED`.

### Consulta de progresso

```text
GET /api/certificates/batch?jobId=<id>
```

Retorna:

- status;
- total;
- processados;
- criados;
- erros;
- percentual de progresso;
- nome do template.

### Regras atuais

- O lote precisa ter pelo menos um nome ou uma planilha válida.
- Empresa é obrigatória.
- Data é obrigatória.
- Empresa e data devem ser iguais em todo o lote.
- Erros por linha não impedem o restante do lote de continuar.
- O certificado gerado recebe `batchId`.

## Histórico e Revogação

Arquivos principais:

```text
src/app/(private)/certificados/historico/page.tsx
src/components/certificates/revoke-button.tsx
src/app/api/certificates/[id]/revoke/route.ts
```

O histórico permite:

- buscar por titular, código, modelo, e-mail, documento e emissor;
- filtrar por status;
- filtrar por intervalo de datas;
- navegar por páginas;
- baixar PDF e DOCX;
- revogar certificados.

Revogações preservam o registro original. O certificado passa para status `REVOKED`, mantendo rastreabilidade na validação pública.

## Geração de Arquivos

Arquivos principais:

```text
src/lib/certificate-service.ts
src/lib/render-certificate.ts
src/lib/certificate-layout.ts
```

### PDF

O PDF é a saída principal, adequada para preservação visual.

Quando há base PDF, o sistema usa o documento original como fundo. Textos variáveis e QR Code são sobrepostos com base nas posições configuradas no editor.

Quando a base original é DOCX, a conversão para PDF tenta Gotenberg e, em desenvolvimento local, LibreOffice instalado como fallback.

### DOCX

O DOCX é a saída editável.

Quando o modelo original é DOCX com placeholders, o `docxtemplater` substitui os campos. Quando não há base adequada, o sistema gera um DOCX simplificado com os dados principais.

## Storage

Arquivo principal:

```text
src/lib/supabase.ts
```

Quando `SUPABASE_SERVICE_ROLE_KEY` está configurada:

- PDFs e DOCXs são enviados para Supabase Storage;
- o bucket usado vem de `SUPABASE_CERTIFICATE_BUCKET`;
- os registros em `GeneratedFile` apontam para o caminho armazenado.

Quando Supabase não está configurado:

- os arquivos podem ser mantidos como bytes no banco, conforme a lógica de fallback.

## Rotas

### Páginas públicas

| Rota | Descrição |
| --- | --- |
| `/` | Entrada da aplicação. |
| `/login` | Login. |
| `/validar/[codigo]` | Validação pública de certificado. |

### Páginas privadas

| Rota | Descrição |
| --- | --- |
| `/dashboard` | Indicadores gerais. |
| `/usuarios` | Gestão de usuários. |
| `/modelos` | Listagem de modelos. |
| `/modelos/novo` | Criação de modelo. |
| `/modelos/[id]/editar` | Editor de modelo. |
| `/certificados/emitir` | Emissão individual. |
| `/certificados/lote` | Emissão em lote. |
| `/certificados/historico` | Histórico de certificados. |

### APIs

| Método e rota | Descrição |
| --- | --- |
| `POST /api/auth/login` | Autentica usuário. |
| `POST /api/auth/logout` | Encerra sessão. |
| `GET /api/users` | Lista usuários. |
| `POST /api/users` | Cria usuário. |
| `GET /api/templates` | Lista modelos. |
| `POST /api/templates` | Cria modelo. |
| `GET /api/templates/[id]` | Busca modelo. |
| `PUT /api/templates/[id]` | Atualiza modelo. |
| `DELETE /api/templates/[id]` | Remove modelo. |
| `POST /api/certificates/issue` | Emite certificado individual. |
| `POST /api/certificates/batch` | Inicia lote. |
| `GET /api/certificates/batch` | Consulta progresso do lote. |
| `GET /api/certificates/[id]/download/[type]` | Baixa arquivo gerado. |
| `POST /api/certificates/[id]/revoke` | Revoga certificado. |

## Banco e Migrations

Migrations atuais:

| Migration | Objetivo |
| --- | --- |
| `20260428152808_init` | Estrutura inicial do sistema. |
| `20260428180000_add_certificate_batches` | Adiciona lotes de certificados. |
| `20260428183000_add_history_indexes` | Adiciona índices para histórico e filtros. |

Comandos úteis:

```bash
npm run prisma:generate
npm run prisma:migrate
npx prisma validate
```

Em produção, aplique migrations com o fluxo apropriado do ambiente, normalmente com `prisma migrate deploy`.

## Comandos de Desenvolvimento

```bash
npm install
npm run dev
npm run lint
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run playwright:install
```

## Checklist de Qualidade

Antes de abrir PR:

- `npm run lint`
- `npm run build`
- `npx prisma validate`
- testar login;
- testar criação ou edição de modelo;
- testar emissão individual;
- testar emissão em lote;
- testar download de PDF/DOCX;
- testar validação pública;
- testar revogação.

## Troubleshooting

### `EPERM` ao rodar `prisma generate` no Windows

Sintoma comum:

```text
EPERM: operation not permitted, rename query_engine-windows.dll.node
```

Possíveis causas:

- servidor Next.js ainda rodando;
- processo Node segurando o Prisma Client;
- antivírus ou indexador bloqueando o arquivo temporariamente.

Soluções:

1. Pare servidores `npm run dev`.
2. Encerre processos Node ligados ao projeto.
3. Rode novamente:

```bash
npm run prisma:generate
```

### Erro de conexão com Supabase

Confirme:

- `DATABASE_URL`;
- senha do banco;
- porta;
- modo pooled ou direto;
- IP allowlist, quando aplicável.

Exemplo pooled:

```env
DATABASE_URL="postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:6543/postgres?schema=public&pgbouncer=true&connection_limit=5&pool_timeout=20"
```

### PDF não é gerado com fidelidade esperada

Verifique se o Chromium está instalado:

```bash
npm run playwright:install
```

Quando Playwright não está disponível, o sistema usa fallback baseado em `pdf-lib`.

### DOCX não detecta variáveis

Confirme se o documento usa placeholders no formato:

```text
{{nome}}
{{empresa}}
{{data}}
```

Textos visualmente parecidos, mas quebrados em múltiplos runs internos do Word, podem não ser detectados como placeholders simples.

## Segurança

- Nunca commitar `.env` ou `.env.local`.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Trocar `SESSION_SECRET` em produção.
- Trocar senha inicial do administrador.
- Usar HTTPS em produção.
- Manter bucket de certificados privado.
- Revisar permissões de operadores.

## Roadmap Técnico

Melhorias naturais para próximas versões:

- auditoria detalhada de ações administrativas;
- motivo de revogação editável;
- suporte completo a múltiplas páginas de PDF;
- preview mais fiel de DOCX complexos;
- fila persistente para lotes muito grandes;
- retentativa de linhas com erro em lote;
- exportação do histórico em CSV/XLSX;
- testes automatizados para APIs críticas;
- testes end-to-end para emissão, download e validação.
