## Why

Hoje a emissao sempre orienta o usuario a baixar "PDF e arquivo", mantendo a versao nativa DOCX/PPTX disponivel como arquivo editavel. Alguns certificados precisam ser entregues em uma versao nao editavel para reduzir alteracoes manuais depois da emissao e deixar claro qual arquivo e a copia final.

## What Changes

- Adicionar um modo de geracao de documento com opcao explicita entre arquivo editavel e versao nao editavel.
- Manter o fluxo atual como padrao para nao quebrar emissao, historico, validacao publica e lote.
- Quando o modo nao editavel for escolhido, gerar e expor a versao final protegida/fechada do certificado, priorizando PDF final e evitando oferecer arquivo nativo editavel como principal entrega.
- Ajustar textos de UI e downloads para distinguir "arquivo editavel" de "versao nao editavel".
- Registrar o modo escolhido junto ao certificado para que regeneracao, historico, validacao publica e downloads respeitem a mesma escolha.

## Capabilities

### New Capabilities
- `certificate-output-protection`: Define como o sistema seleciona, armazena, regenera e apresenta arquivos editaveis ou nao editaveis de certificados emitidos.

### Modified Capabilities
- `batch-certificate-issuance`: O fluxo de lote deve propagar o modo de saida escolhido para todos os certificados criados no lote.

## Impact

- Banco de dados: possivel novo campo em `CertificateIssue` e/ou `GeneratedFile` para persistir o modo de saida.
- Backend: emissao individual, emissao em lote, regeneracao de arquivos, rotas autenticadas e publicas de download.
- Frontend: formulario de emissao, tela de certificado concluido, historico, acoes de download e tela de lote.
- Testes: cobertura para modo padrao editavel, modo nao editavel, downloads autenticados/publicos e lote.
