## Context

O projeto e um app Next.js 16.2.4 com regras locais para consultar a documentacao instalada antes de escrever codigo de framework. As telas publicas de validacao e as telas autenticadas usam tokens CSS globais em `src/app/globals.css`, `html.dark` e o componente `ThemeToggle`. O fluxo de lote esta dividido entre UI (`BatchForm`, toast de progresso e pagina `/certificados/lote`), API (`/api/certificates/batch`) e processamento incremental (`src/lib/batch-jobs.ts`), reutilizando `issueCertificate` e os classificadores/formatadores de `src/lib/template-variable-fields.ts`.

A correcao deve partir do bug real observado no app, preservando a arquitetura existente. A interface deve ficar correta no modo claro e no modo noturno, e o texto exibido ao usuario deve estar em pt-BR natural. O lote deve aceitar dados validos, rejeitar dados invalidos com mensagens acionaveis e manter a mesma normalizacao de campos usada na emissao individual.

## Goals / Non-Goals

**Goals:**

- Corrigir contraste, superficies, bordas, foco, estados vazios, avisos e mensagens afetadas no modo noturno.
- Corrigir textos sem acento, anglicismos ou mensagens tecnicas expostas em fluxos de validacao, tema e lote.
- Diagnosticar e corrigir a falha de criacao em lote no caminho real de uso, incluindo UI, API ou job assíncrono conforme necessario.
- Preservar a formatacao compartilhada de CPF, RG, datas, meses e campos espelhados entre emissao individual, lote, previa e documento renderizado.
- Adicionar testes automatizados para a regra de lote corrigida e para formatacao/localizacao quando houver helper compartilhado.

**Non-Goals:**

- Nao redesenhar o produto inteiro nem substituir o sistema de tema.
- Nao trocar Next.js, Prisma, Supabase, biblioteca de leitura de planilha ou mecanismo de renderizacao de certificados.
- Nao alterar schema de banco, exceto se a investigacao provar que o bug de lote depende disso.
- Nao mudar regras de permissao: emissao em lote continua restrita ao perfil administrativo existente.

## Decisions

1. Corrigir tema por tokens e seletores existentes.

   Rationale: o app ja possui uma escala de superficies, texto, bordas e marca em `globals.css`. Usar esses tokens reduz regressao entre telas publicas e privadas.

   Alternatives considered: criar CSS isolado por pagina ou novas classes paralelas. Isso aumentaria duplicacao e deixaria novas telas fora do ajuste.

2. Centralizar pt-BR em helpers e constantes compartilhadas quando o texto for regra de dominio.

   Rationale: campos como CPF/RG/data/mes e mensagens de lote aparecem em UI, API e documentos. Ajustar apenas o texto visivel de um componente pode deixar API, testes ou certificados divergentes.

   Alternatives considered: corrigir strings pontuais no JSX. E aceitavel para labels puramente visuais, mas nao para regra de validacao, formato ou mensagem retornada pela API.

3. Tratar criacao em lote como fluxo transacional por job existente.

   Rationale: `startBatchJob`, `processBatchJobChunk` e `issueCertificate` ja modelam o lote linha a linha. A correcao deve manter essa arquitetura e atacar o ponto que quebra: parse, normalizacao, validacao, criacao do job, polling ou finalizacao.

   Alternatives considered: voltar a emitir todos os certificados de uma vez no POST. Isso aumentaria risco de timeout, duplicacao de logica e perda de progresso por linha.

4. Investigar manual e planilha como entradas de lote.

   Rationale: a API suporta `peopleRows`/manual e upload CSV/XLSX. Mesmo que o bug reportado venha da tela atual, a correcao nao deve quebrar planilhas nem remover suporte existente.

   Alternatives considered: focar so no caminho manual. Isso reduziria escopo, mas deixaria risco alto de regressao em uma funcionalidade ja presente na API e nos limites de upload.

5. Validar com testes e uma checagem visual real.

   Rationale: modo noturno e pt-BR sao problemas renderizados; testes unitarios nao capturam contraste, estados visuais ou texto truncado. O Executor deve rodar testes/build e abrir o app quando aplicavel.

   Alternatives considered: apenas `npm run test`. Insuficiente para bugs visuais e possiveis mudancas de App Router/Next 16.

## Risks / Trade-offs

- [Risk] A falha de lote depender de dados reais ou template especifico que nao esteja no repositorio -> Mitigation: reproduzir com template/variaveis locais e registrar claramente qualquer dado externo necessario.
- [Risk] Corrigir uma string em pt-BR na UI mas manter mensagem sem acento na API -> Mitigation: buscar ocorrencias relacionadas e ajustar helpers/constantes compartilhadas quando a mensagem for retornada por servidor.
- [Risk] Mudanca de CSS resolver a tela do print e quebrar outras superficies no modo noturno -> Mitigation: validar public home, validacao publica e `/certificados/lote` em tema claro e escuro.
- [Risk] Corrigir lote criando duplicidade de certificados em reprocessamento -> Mitigation: preservar locks, contadores `processed/created`, erros por linha e finalizacao do job.
- [Risk] Next.js 16 ter comportamento diferente do conhecimento previo -> Mitigation: consultar `node_modules/next/dist/docs/` antes de alterar App Router, route handlers ou APIs de framework.

## Migration Plan

1. Trabalhar em branch propria de fix antes da implementacao.
2. Reproduzir o erro de lote e registrar o caminho exato: manual, CSV, XLSX ou polling.
3. Aplicar correcao pequena no ponto causador, preservando contratos existentes.
4. Rodar `npm run test`, `npm run lint` e `npm run build`.
5. Validar visualmente modo claro/noturno nas superficies afetadas.
6. Se a correcao for rejeitada, reverter apenas os arquivos tocados pela tarefa e manter os arquivos locais ja sujos do usuario intactos.

## Open Questions

- Qual tela especifica do modo noturno ainda falha: home publica do print, `/validar`, dashboard autenticado, lote ou mais de uma?
- O erro de lote ocorre ao colar pessoas manualmente, enviar planilha CSV/XLSX ou durante o progresso/polling apos iniciar o job?
- Existe uma mensagem/termo pt-BR especifico que o usuario ja viu errado, ou a revisao deve cobrir todos os textos tocados no fluxo?
