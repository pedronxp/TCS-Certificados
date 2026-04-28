# README Técnico - TCS Certificados

## Visão Geral

O TCS Certificados é um painel web para criar modelos de certificados, marcar variáveis em cima de um arquivo base e emitir certificados em PDF/DOCX com validação pública por QR Code.

O sistema foi pensado para preservar o design original do certificado. Em vez de tentar reconstruir margem, fonte e layout de um documento enviado, ele mantém o arquivo como base e aplica os campos variáveis por cima. Para DOCX, também há suporte a placeholders editáveis no formato `{{nome}}`.

## Stack

- Next.js 16 com App Router e TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL no Supabase
- Supabase Storage para arquivos gerados quando configurado
- Sessão JWT em cookie HTTP-only com `jose`
- `bcryptjs` para senha
- `pdf-lib` para sobrepor variáveis em PDFs e fallback de geração PDF
- `docxtemplater` + `pizzip` para preencher DOCX
- `mammoth` para extrair preview HTML de DOCX
- `csv-parse` e `xlsx` para emissão em lote

## Arquitetura

### Camadas

- `src/app`: rotas, páginas e APIs do Next.js.
- `src/components`: componentes de painel, editor, formulários e ações.
- `src/lib`: regras de negócio, autenticação, Prisma, Supabase e renderização.
- `prisma`: schema, migrations e seed.
- `docs`: documentação técnica e apresentação.

### Fluxo Principal

1. Admin faz login.
2. Admin sobe um modelo em PDF, DOCX ou imagem.
3. O sistema cria um `CertificateTemplate`.
4. O usuário posiciona campos variáveis no editor.
5. Ao salvar, as variáveis são sincronizadas em `TemplateVariable`.
6. Na emissão, o operador preenche os labels gerados.
7. O sistema gera PDF, DOCX, código de validação e QR Code.
8. O certificado fica disponível no histórico e na rota pública `/validar/[codigo]`.

## Modelo de Dados

Entidades principais:

- `User`: usuários do painel.
- `CertificateTemplate`: modelo base do certificado.
- `TemplateVariable`: campos usados no formulário de emissão.
- `CertificateRecipient`: titular do certificado.
- `CertificateIssue`: emissão com código único e status.
- `GeneratedFile`: arquivos PDF/DOCX gerados.

Perfis:

- `ADMIN`: gerencia usuários e modelos, emite e revoga certificados.
- `OPERADOR`: emite certificados e consulta histórico.

## Templates e Placeholders

### PDF

O PDF enviado é mantido como base. Na geração, o sistema usa `pdf-lib` para desenhar texto, QR Code e variáveis sobre a primeira página.

### DOCX

O DOCX enviado é extraído com `mammoth` para gerar preview no editor. Se houver placeholders como `{{nome}}`, eles são detectados e viram campos automaticamente.

Na geração DOCX, o `docxtemplater` substitui placeholders usando os valores preenchidos.

### Imagem

Imagem enviada vira fundo visual do canvas. Os campos são posicionados manualmente e renderizados sobre ela.

## Configuração

Crie `.env` e `.env.local` a partir de `.env.example`.

Variáveis essenciais:

```env
DATABASE_URL="postgresql://..."
SESSION_SECRET="troque-em-producao"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
ADMIN_NAME="Administrador"
ADMIN_EMAIL="admin@tcs.local"
ADMIN_PASSWORD="admin123456"
NEXT_PUBLIC_SUPABASE_URL="https://...supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
SUPABASE_CERTIFICATE_BUCKET="certificados"
```

Para Supabase, a URL atual usa pooler na porta `6543` com `pgbouncer=true`, `connection_limit=5` e `pool_timeout=20`, evitando falhas intermitentes da conexão direta IPv6.

## Comandos

Instalar dependências:

```bash
npm install
```

Gerar Prisma Client:

```bash
npx prisma generate
```

Aplicar migrations:

```bash
npm run prisma:migrate -- --name init
```

Criar admin padrão:

```bash
npm run prisma:seed
```

Rodar local:

```bash
npm run dev -- -p 3000
```

Validar:

```bash
npm run lint
npm run build
npx prisma validate
```

## Geração de Arquivos

PDF:

- usa o PDF base quando o modelo foi criado a partir de PDF;
- usa fallback `pdf-lib` quando não há browser Playwright instalado;
- pode usar Playwright no futuro para fidelidade HTML/CSS quando o Chromium estiver disponível.

DOCX:

- se houver arquivo base DOCX, substitui placeholders com `docxtemplater`;
- se não houver, gera um DOCX simples com os dados principais.

Storage:

- quando `SUPABASE_SERVICE_ROLE_KEY` está configurada, PDF/DOCX são enviados para Supabase Storage;
- sem essa chave, os arquivos ficam no banco como `Bytes`.

## Troubleshooting

### Erro de conexão com Supabase

Use o pooler:

```env
DATABASE_URL="postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:6543/postgres?schema=public&pgbouncer=true&connection_limit=5&pool_timeout=20"
```

### Erro ao gerar PDF com Playwright

O sistema possui fallback com `pdf-lib`. Para habilitar renderização HTML/CSS completa, instale o Chromium:

```bash
npx playwright install chromium
```

### DOCX não detecta campos

O arquivo precisa ter placeholders como:

```text
{{nome}}
{{curso}}
{{data}}
```

Sem placeholders, o sistema mostra o preview e permite marcar campos manualmente.

## Segurança

- `.env` e `.env.local` não devem ser commitados.
- `SUPABASE_SERVICE_ROLE_KEY` só pode ser usada no servidor.
- Senhas são armazenadas com hash `bcrypt`.
- Sessões usam cookie HTTP-only.

## Próximos Passos Técnicos

- Melhorar renderização visual de DOCX com conversão mais fiel.
- Adicionar editor drag-and-drop real para mover campos no canvas.
- Suportar múltiplas páginas de PDF.
- Implementar revogação com motivo editável.
- Adicionar auditoria de emissões por usuário.
