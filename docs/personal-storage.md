# Meu armazenamento

Área de documentos pessoais em Configurações. Usa a conta de login, compartilhada pelos perfis acessados por esse login; não cria armazenamento pago automaticamente para um dependente ou concede acesso a outro login. Não há acesso automático pelo profissional de saúde nem inclusão no prontuário.

## Separação obrigatória

- Chaves exclusivamente em `storage/contas/{idDaConta}/arquivos/{uuid}` no bucket R2 privado já configurado.
- Pastas são metadados; seus nomes não são usados para compor caminhos no R2.
- StorageAccount, StorageFolder, StorageFile, StorageReservation e StorageUpgradeRequest são tabelas próprias.
- StorageFile possui CHECK que exige o prefixo da própria conta. O vínculo composto da pasta inclui a conta e rejeita pasta de outro usuário.
- Identificação, validação profissional, tutela e ClinicalDocument continuam nas estruturas e rotas existentes. Não entram na lista, na exclusão nem na cota desta área pessoal.
- APIs limitadas ao usuário autenticado. A administração vê solicitações e consumo, não os arquivos pessoais dos clientes.

## Cota e ativação

Franquia inicial de 5 GB decimais (5.000.000.000 bytes), máximo inicial de 10.000 arquivos e 500 pastas. Cada envio aceita até 25 MB decimais. Os limites são apresentados na tela. Qualquer tipo de arquivo pode ser guardado: apenas PDFs e imagens com assinatura reconhecida são visualizados; demais arquivos recebem MIME binário e download como anexo.

Novas contas ficam com envio desativado até liberação administrativa. Administradores com e-mail confirmado são liberados na criação da conta de armazenamento para testes. Nenhum plano/preço/pagamento é criado automaticamente. A solicitação de 5 GB ativa o plano inicial; 10, 25, 50 e 100 GB solicitam ampliação. O administrador confirma a liberação sem disparar cobranças. Integração comercial/cobrança recorrente é uma etapa posterior.

Antes do envio ao R2, uma reserva com validade de 20 minutos é criada sob lock da conta. O limite é comparado com bytes utilizados e reservas em andamento. Reservas expiradas são ignoradas/removidas. A gravação dos metadados, incremento de consumo e remoção da reserva ocorrem na mesma transação. Falhas não consomem franquia. O envio remoto fica fora da transação para evitar locks longos. A aplicação limita envios simultâneos para limitar memória no plano Business; uploads diretos/multipart de arquivos grandes não fazem parte desta entrega.

A exclusão de um arquivo pessoal remove seus metadados, reduz o consumo e enfileira a limpeza do objeto na mesma transação. O trabalhador comum verifica também referências de StorageFile antes de excluir qualquer objeto. Links já emitidos expiram em até 120 segundos. Falhas ambíguas de rede e queda simultânea do banco podem exigir a conciliação de objetos sem referência descrita em private-document-storage.md.

## Interface

Lista inicial com filtros recolhíveis, pesquisa acionada por botão, ordenação e paginação no servidor. Controles no início e no fim; ficam ocultos até 10 resultados. Clique abre detalhes; Editar altera nome, pasta e observações, com Salvar/Cancelar. Excluir exige confirmação. Pasta com arquivos não pode ser excluída: é necessário mover ou excluir seus arquivos primeiro. Arquivos médicos não são apresentados nessa funcionalidade.

A listagem de pastas fica recolhida e usa a tabela/paginação padrão do aplicativo. Até 500 pastas são carregadas para os seletores. Administradores consultam solicitações pendentes em Administração → Armazenamento pessoal.
