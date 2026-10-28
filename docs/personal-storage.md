# Armazenamento e planos

Configurações → Meu HD. Cadastro também fica no grupo Configurações. A gestão restrita do sistema permanece visível somente para administradores. O menu e a funcionalidade são telas exclusivas: abrir o menu oculta a tela atual; escolher uma função fecha o menu.

## Capacidade única, conteúdo separado

Cada conta recebe 1 GB decimal (1.000.000.000 bytes), sem aprovação administrativa. A capacidade é compartilhada pelos documentos administrados pelo MyDoctor e pelos arquivos pessoais. O resumo apresenta `managedBytes`, `personalBytes` e `usedBytes = managedBytes + personalBytes`.

A separação física e de permissões permanece obrigatória:

- Arquivos pessoais: `storage/contas/{idDaConta}/arquivos/{uuid}`. Listas, alteração e exclusão desta tela operam apenas sobre StorageFile da própria conta.
- Documentos de identificação, validação profissional, tutela e clínicos mantêm seus caminhos, tabelas, permissões e retenção.
- Nenhum documento é movido, copiado ou incluído na lista pessoal para calcular o consumo.

A soma usa os tamanhos dos metadados de UserIdentityDocument, PatientIdentityDocument, ProfessionalVerificationDocument, TutorDocument e ClinicalDocument, independentemente de estarem no R2, disco privado ou banco. Imagens data URI persistidas em User.accountData, Patient.data, HealthEvent.payload e HealthEvent.provenance também entram pelo tamanho textual efetivamente armazenado, incluindo a codificação base64. Perguntas/imagens transitórias enviadas ao consultor não entram, pois não são armazenadas. O texto do prontuário não compõe a franquia de arquivos.

A cobrança segue a conta proprietária do cadastro (Patient.ownerUserId); documentos de tutela seguem a conta solicitante. Médico ou tutor com acesso a outra conta não recebe cópia nem cobrança duplicada por essa permissão. Dependentes originalmente criados pela mesma conta compartilham sua cota. Alterar tutor não muda a propriedade de armazenamento. Documentos inativados e versões antigas de imagens preservadas no histórico continuam contando enquanto ocuparem armazenamento. Não há exclusão automática de conteúdo clínico ao atingir a cota.

## Controle de envios

Reservas com validade de 20 minutos são criadas sob lock da conta e somadas ao consumo total antes de qualquer novo envio pessoal ou médico. O upload remoto não segura uma transação longa. Gravar o arquivo pessoal, atualizar seu contador e consumir a reserva ocorre em uma transação. Para documentos geridos, a reserva só é removida após o commit dos metadados; por um intervalo curto, o consumo pode ser contado conservadoramente duas vezes durante o envio. Alterações de imagens em JSON usam a mesma trava, verificam o crescimento e revertem a gravação que ultrapassaria a cota. Reduções e edições sem aumento de arquivos permanecem permitidas, inclusive acima do limite.

Limites pessoais: até 25 MB por arquivo, 10.000 arquivos, 500 pastas. Quatro envios simultâneos por processo. PDFs/imagens reconhecidos podem ser visualizados; demais formatos são baixados como anexos. Pastas são metadados, seus nomes não compõem as chaves R2. CHECK de namespace e FK composta de pasta/conta mantêm o isolamento. Deleção pessoal reduz somente seu contador e enfileira limpeza do objeto; o trabalhador verifica todas as referências antes de remover qualquer objeto.

## Carrinho e pagamento

Planos de 5 GB e 10 GB representam capacidade total, substituindo o limite anterior, e podem ser escolhidos no carrinho persistido por conta. Preços, periodicidade e provedor de pagamento serão definidos posteriormente pelo proprietário do produto.

Nesta entrega, o carrinho pode ser consultado, alterado e esvaziado. O botão Pagar fica indisponível, explicitamente indicado como em configuração; POST /storage/checkout retorna 409. Nenhum valor é inventado, nenhuma cobrança é executada e nenhum pagamento é simulado. As antigas rotas de pedido de ampliação e aprovação administrativa retornam 410 e não concedem espaço. Solicitações anteriores são preservadas somente para histórico.

A integração comercial futura deverá criar um pedido com preço/versionamento no servidor e liberar a capacidade apenas após confirmação autenticada do provedor, com verificação de pedido, conta, valor, moeda, status e idempotência. Nunca aceitar um status de pagamento fornecido pelo navegador. Ainda não há cobrança nem webhook nesta entrega.

A migração 20261028-storage-plans.sql substitui as franquias da fase de teste por 1 GB ativo; preserva todos os arquivos e não cria assinaturas. O contador StorageAccount.usedBytes continua exclusivo dos arquivos pessoais; o total é calculado sem mover dados. Não executar novamente a migração fora do controle de checksum/ledger.
