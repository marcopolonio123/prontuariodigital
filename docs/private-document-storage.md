# Armazenamento privado de documentos

## Situação e ativação

A integração é compatível com S3 e fica desativada até configurar o provedor. Na região atual do projeto Neon, a API retornou `region_unavailable` para Object Storage em 28/10/2026. O banco não precisa ser movido: pode-se usar outro armazenamento compatível com S3.

Criar um bucket **privado**, com bloqueio de acesso público e credencial limitada ao bucket e aos prefixos da aplicação. Configurar criptografia, política de recuperação e retenção no provedor. Um backup somente do PostgreSQL não inclui os objetos.

No ambiente Node da Hostinger (nunca em variáveis VITE nem no navegador):

| Variável | Valor |
|---|---|
| DOCUMENT_STORAGE_MODE | `s3` para ativar novos uploads externos |
| DOCUMENT_STORAGE_BUCKET | Nome do bucket privado |
| DOCUMENT_STORAGE_REGION | Região exigida pelo provedor; R2 normalmente `auto` |
| DOCUMENT_STORAGE_ENDPOINT | Endpoint HTTPS S3; dispensável no Amazon S3 padrão |
| DOCUMENT_STORAGE_ACCESS_KEY_ID | Credencial restrita ao bucket |
| DOCUMENT_STORAGE_SECRET_ACCESS_KEY | Segredo da credencial |
| DOCUMENT_STORAGE_PATH_STYLE | `true` por padrão; pode ser `false` conforme o provedor |
| DOCUMENT_STORAGE_PATH | Manter o diretório legado persistente até terminar a migração e a retenção dos originais |

Não remover credenciais enquanto houver documentos S3 referenciados, mesmo que o modo de novos uploads seja desativado. O bucket é persistido por documento; a integração usa um endpoint/credencial por instalação. Trocar de provedor exige migrar os objetos, não apenas trocar o endpoint.

## Estrutura

UserIdentityDocument, PatientIdentityDocument, ProfessionalVerificationDocument e TutorDocument mantêm seus IDs, PKs, UKs, FKs e metadados. Recebem `objectKey`, `storageProvider`, `storageBucket`; `content` é opcional para leitura de arquivos legados. Uma restrição no banco exige exatamente o conteúdo legado OU uma referência S3 completa. Novos uploads no modo S3 deixam `content = NULL`.

ClinicalDocument já mantém metadados e `objectKey`: a identificação de provedor e bucket fica em `metadata`, compatível com os registros existentes. Novos objetos têm chaves imutáveis com UUID, sem nome, CPF ou e-mail nas pastas. Documentos de dependentes permanecem vinculados ao paciente, independentemente de quem exerce a tutoria.

A API conserva todas as verificações de titularidade, tutoria, especialidade/validação e autorização de prontuário antes de liberar um download. Para S3, retorna um redirecionamento a URL assinada de 120 segundos; não há URL permanente pública. Uma URL já emitida pode funcionar até expirar mesmo após revogação, por isso a validade é curta. Não registrar URLs assinadas nos logs.

Os envios permanecem nas rotas autenticadas atuais para preservar a validação de formato, tamanho e fluxo de aprovação; os downloads vão diretamente ao armazenamento. Upload direto assinado, antivírus, cotas por plano e políticas automáticas de retenção são evoluções separadas, não recursos já implementados nesta etapa. Não habilitar acesso público nem limpeza automática de documentos clínicos sem política definida.

## Migração controlada

A migração SQL apenas prepara campos e restrições. Não copia nem remove arquivos. Após configurar e testar o bucket, executar **no servidor da aplicação**, onde os arquivos legados existem:

```sh
cd server
node scripts/migrate-document-storage.mjs
node scripts/migrate-document-storage.mjs --apply --only-id ID_DE_UM_DOCUMENTO
node scripts/migrate-document-storage.mjs --apply
```

Sem `--apply`, apenas conta registros pendentes. A opção `--only-id` permite validar uma migração piloto. O script processa poucos registros por vez, envia cada objeto, baixa a cópia e compara tamanho e SHA-256 antes de atualizar a referência e retirar os bytes do PostgreSQL. Se a cópia divergir, o original é preservado. Alterações concorrentes são verificadas antes de trocar a referência. Reexecuções ignoram documentos já migrados.

Anexos clínicos locais são preservados no disco depois da cópia; sua chave antiga fica em `metadata.legacyObjectKey`. A retirada desses originais requer conferência e política de retenção, não ocorre automaticamente. Os bytes retirados do PostgreSQL podem continuar no histórico/backups pelo prazo configurado no provedor; a redução da cobrança não deve ser prometida como imediata.

## Limpeza e falhas

StorageDeletion é uma fila transacional de exclusões. Substituições/exclusões só enfileiram o objeto anterior junto da alteração do banco. Uploads cuja confirmação no banco falha também são enfileirados. O trabalhador tenta a cada minuto, em lotes de 25, com novas tentativas e verifica referências antes de excluir. Objetos clínicos inativados continuam preservados conforme o comportamento atual.

Falhas no provedor não devem gravar referências incompletas nem voltar silenciosamente a armazenar novos arquivos no banco no modo S3. Falhas ambíguas no envio ou indisponibilidade simultânea do banco e do armazenamento podem deixar um objeto sem referência: manter inventário periódico para conciliar objetos e referências, com período de segurança antes de excluir. Essa conciliação completa não foi automatizada nesta etapa.

## Verificação

`object-storage-smoke.mjs` usa um endpoint S3 simulado e documentos fictícios em banco de teste. Valida referências sem bytes, URLs temporárias após autorização, isolamento entre usuários, substituição/limpeza, falha do provedor, leitura legada e migração com hash divergente, retomada e preservação de arquivos locais. O teste não substitui um envio/download real no bucket privado configurado em produção.
