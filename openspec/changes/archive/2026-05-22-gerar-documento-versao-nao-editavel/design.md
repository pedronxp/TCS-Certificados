## Context

O app emite certificados a partir de modelos com layout armazenado em JSON e sempre cria um arquivo PDF mais um arquivo nativo do modelo (`DOCX` ou `PPTX`). A deteccao do arquivo nativo esta centralizada em `src/lib/certificate-output-format.ts`, a emissao passa por `src/lib/certificate-service.ts`, e os downloads sao servidos pelas rotas autenticada e publica de certificado.

O pedido e adicionar um modo para gerar a versao nao editavel do documento. Como DOCX/PPTX sao formatos editaveis por natureza, o modo nao editavel deve ser tratado como politica de entrega e disponibilidade: o PDF final e a versao fechada, enquanto arquivos nativos editaveis deixam de ser oferecidos como download principal desse certificado.

## Goals / Non-Goals

**Goals:**
- Permitir que o administrador escolha, na emissao individual e em lote, entre modo editavel atual e modo nao editavel.
- Persistir o modo escolhido no certificado emitido para que historico, conclusao, regeneracao e validacao publica sejam consistentes.
- Manter o comportamento atual como padrao para certificados existentes e novas emissoes sem selecao explicita.
- No modo nao editavel, expor PDF final como entrega principal e bloquear/ocultar download nativo editavel em telas e APIs publicas/autenticadas.
- Cobrir regeneracao de PDF quando arquivo armazenado estiver ausente, invalido ou antigo.

**Non-Goals:**
- Criar um DRM ou uma garantia criptografica de que o PDF nunca sera alterado fora do sistema.
- Prometer que DOCX/PPTX protegido seja inviolavel.
- Remover suporte aos arquivos nativos editaveis no modo padrao.
- Alterar a semantica de codigo de validacao, expiracao de documentos ou revogacao.

## Decisions

1. Persistir `outputMode` no certificado emitido.
   - Escolha: adicionar um enum Prisma, por exemplo `CertificateOutputMode` com `EDITABLE` e `NON_EDITABLE`, e um campo `outputMode` em `CertificateIssue` com default `EDITABLE`.
   - Racional: o modo pertence a emissao concreta, nao ao modelo. O mesmo modelo pode gerar um certificado editavel e outro nao editavel.
   - Alternativa considerada: salvar apenas em `values` JSON. Rejeitada porque dificultaria filtros, contratos de API e seguranca dos downloads.

2. Usar PDF como representacao nao editavel.
   - Escolha: em `NON_EDITABLE`, a UI e as rotas disponibilizam somente PDF final. Arquivos nativos (`DOCX`/`PPTX`) nao aparecem como acao de download e devem retornar erro controlado se requisitados diretamente.
   - Racional: PDF e a saida final ja suportada pelo app e e o formato correto para uma versao fechada. DOCX/PPTX continuam sendo editaveis mesmo quando marcados como somente leitura.
   - Alternativa considerada: gerar DOCX com protecao de edicao. Rejeitada como garantia principal porque e fraca e depende do cliente Office.

3. Preservar geracao interna suficiente para fallback.
   - Escolha: a emissao pode continuar renderizando arquivo nativo quando necessario para gerar PDF a partir de modelo Office, mas a disponibilidade externa deve respeitar `outputMode`.
   - Racional: os conversores de Office para PDF dependem do arquivo nativo/renderizacao atual. O requisito e controlar entrega, nao quebrar a pipeline de renderizacao.
   - Alternativa considerada: nao gerar nativo no banco em `NON_EDITABLE`. Pode ser usado se os testes confirmarem que o PDF nao depende de arquivo persistido; caso contrario, manter nativo interno e bloquear download.

4. Centralizar a regra de disponibilidade.
   - Escolha: criar helper em `certificate-output-format` ou modulo proximo, por exemplo `canDownloadCertificateFile(issue.outputMode, type)`, usado por historico, conclusao, validacao publica e rotas de API.
   - Racional: evita divergencia entre UI escondendo botao e API ainda entregando arquivo editavel.
   - Alternativa considerada: condicionar cada componente/rota localmente. Rejeitada por risco de brecha funcional.

5. Propagar o modo por API.
   - Escolha: aceitar `outputMode` no POST de emissao individual e no payload de lote, validando com allowlist no servidor.
   - Racional: a escolha vem da UI, mas a regra precisa ser validada no backend.
   - Alternativa considerada: inferir pelo tipo baixado depois da emissao. Rejeitada porque historico e validacao publica precisam saber a politica desde a criacao.

## Risks / Trade-offs

- [Risk] Usuario interpretar "nao editavel" como protecao absoluta contra adulteracao externa -> Mitigacao: textos de UI devem dizer "versao nao editavel (PDF final)" e manter validacao por codigo/QR como prova de autenticidade.
- [Risk] Rotas diretas ainda entregarem DOCX/PPTX quando a UI esconder o botao -> Mitigacao: aplicar a regra no backend antes de carregar/regenerar conteudo.
- [Risk] Certificados antigos sem `outputMode` quebrarem downloads -> Mitigacao: migracao com default `EDITABLE` e leitura defensiva.
- [Risk] Conversor PDF indisponivel impedir emissao nao editavel -> Mitigacao: manter erro claro ja existente para conversor indisponivel e validar fallback visual para modelos Office.
- [Risk] Lote criar itens mistos se o modo nao for persistido no job -> Mitigacao: armazenar `outputMode` no `CertificateBatch` ou no payload de processamento e repassar para cada `issueCertificate`.

## Migration Plan

1. Criar migracao Prisma adicionando o enum/campo com default `EDITABLE`.
2. Atualizar tipos gerados do Prisma.
3. Atualizar emissao individual e lote para receber e persistir `outputMode`.
4. Atualizar helpers e rotas de download para negar arquivo nativo quando `outputMode` for `NON_EDITABLE`.
5. Atualizar telas para mostrar a opcao de modo e adaptar labels/botoes.
6. Rodar testes automatizados e validar manualmente emissao editavel, emissao nao editavel, historico e validacao publica.

Rollback: manter default `EDITABLE`; se a feature precisar ser revertida, a UI pode parar de enviar `NON_EDITABLE` e as rotas continuam atendendo certificados existentes conforme o campo.

## Open Questions

- O modo nao editavel deve ser permitido para operadores ou somente administradores?
- O historico deve ter filtro visual por modo de saida nesta primeira entrega ou apenas badge/label?
