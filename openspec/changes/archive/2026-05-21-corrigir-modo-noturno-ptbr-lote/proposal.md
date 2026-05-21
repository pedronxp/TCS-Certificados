## Why

A interface ainda apresenta problemas visiveis no modo noturno e mensagens/textos inconsistentes em pt-BR, o que reduz a confianca do operador e do participante na validacao publica. Alem disso, a criacao em lote esta falhando ou produzindo feedback insuficiente, bloqueando um fluxo central de emissao de certificados.

## What Changes

- Corrigir regressions visuais do modo noturno nas telas publicas e privadas afetadas, mantendo contraste, tokens de tema e estados de formulario consistentes.
- Revisar mensagens, labels, estados vazios e erros do fluxo impactado para pt-BR natural, com acentos corretos na interface renderizada.
- Corrigir a criacao/emissao em lote para processar planilhas e entradas manuais validas, preservar formatacao compartilhada de campos e retornar erros claros por lote/linha quando houver dados invalidos.
- Adicionar cobertura de validacao automatizada para os pontos de formatacao pt-BR e para o caminho de lote que estiver falhando.
- Nao ha breaking changes previstos.

## Capabilities

### New Capabilities

- `theme-localization-quality`: cobre a consistencia visual do modo noturno e a qualidade dos textos pt-BR nas superficies publicas e autenticadas afetadas.
- `batch-certificate-issuance`: cobre a criacao, validacao, processamento e feedback de emissao de certificados em lote.

### Modified Capabilities

- Nenhuma. Ainda nao existem specs base em `openspec/specs/` neste checkout.

## Impact

- Codigo afetado provavel: `src/app/globals.css`, componentes de tema, paginas publicas de validacao, layout autenticado, `src/components/certificates/batch-form.tsx`, `src/components/certificates/batch-progress-toast.tsx`, `src/app/api/certificates/batch/route.ts`, `src/lib/batch-jobs.ts`, `src/lib/batch-status.ts`, `src/lib/template-variable-fields.ts`.
- Testes afetados provaveis: `tests/template-variable-fields.test.ts`, `tests/batch-status.test.ts`, `tests/batch-job-values.test.ts`, novos testes focados no bug de lote identificado.
- Sem novas dependencias esperadas.
- Validacao esperada: `npm run test`, `npm run lint`, `npm run build` e checagem visual/manual do modo noturno e do fluxo de lote no app real.
