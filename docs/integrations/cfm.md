# Consulta de CRM no CFM

O MyDoctor mantém a aprovação administrativa da identidade e passa a
consultar o registro médico no serviço oficial quando configurado.
O CFM recebe somente CRM, UF e chave pela operação **Consultar**, por
SOAP 1.1 em TLS 1.2. A consulta compara CRM/UF e nome e exige inscrição
regular principal ou secundária. Inscrições de outros tipos ficam fora
desta primeira etapa. Isso não valida CPF, data de nascimento ou RQE:
a conferência documental continua obrigatória, e a operação Validar
precisa de verificação separada com o contrato vigente.

1. Solicitar a chave no [serviço Lista de Médicos do CFM](https://sis.cfm.org.br/listamedicos/informacoes).
2. Configurar `CFM_WS_KEY` como segredo do servidor. Testar em ambiente
   isolado a saída HTTPS na porta 8080, uma consulta autorizada e a renovação
   da chave. Não enviar a chave pelo chat nem colocá-la no frontend.
3. Configurar `CFM_VALIDATION_REQUIRED=true` junto à chave na ativação.
   A chave presente já ativa a consulta; o modo obrigatório impede retorno
   ao fluxo exclusivamente manual se a chave for removida ou ficar vazia.

Sem chave e sem modo obrigatório, o fluxo atual permanece manual. Com a
integração ativa, aprovar CRM e abrir, criar, editar ou enviar atendimento
de CRM exige confirmação atual. Não se aproveita consulta antiga na
indisponibilidade do CFM. Falha temporária não suspende o profissional
no cadastro nem apaga atendimentos; a operação corrente é bloqueada
com mensagem de erro. Outros conselhos continuam no fluxo administrativo.
A autorização do paciente continua sendo exigida.

A aprovação e a criação de atendimento registram a fonte e data da
consulta nos campos de auditoria existentes, sem CPF, data de nascimento,
chave ou resposta SOAP completa. Não há mudança de esquema.
Os testes locais usam resposta fictícia; produção depende da chave
oficial e de validação de conectividade a partir da hospedagem.

[Contrato técnico do CFM](https://sis.cfm.org.br/listamedicos/arquivos/manualwebservices.pdf).
