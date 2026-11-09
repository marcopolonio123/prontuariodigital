# Preenchimento dirigido — MyDoctor

| Fluxo | Fonte | Identificador e conferência |
| --- | --- | --- |
| Agenda de medicamentos | Edição dos dados abertos da Anvisa | Nome/princípio ativo e registro do produto. O servidor confere nome e registro. Dose e horário vêm da prescrição. |
| Receita digital | Módulo de prescrição Memed (piloto separado) | Identificador da apresentação do provedor, categoria de receituário, prescritor, paciente, documento assinado. Não derivar a categoria do catálogo da agenda. |
| Meus locais de atendimento | API DEMAS/CNES; ViaCEP confere município e UF | CNES de 7 dígitos vincula unidade única. Nome e endereço do CNES são conferidos pelo servidor; horários continuam específicos do profissional. |
| Endereço | Consulta CEP já existente | CEP, município, UF e logradouro sugeridos. Usuário confirma número e complemento. |
| Profissional médico | Revisão administrativa; conector CFM no PR #108 | CRM + UF e situação, sem misturar conferência do conselho com autorização de paciente. |
| Paciente/dependente | Cadastro MyDoctor | CPF e verificações existentes, com conferência de identidade e vínculo. Evitar inferência de identidade por nome sozinho. |

## Como usar

- **Agenda de medicamentos:** digite o nome ou o princípio ativo, selecione **Buscar no catálogo Anvisa** e escolha o registro após conferir a embalagem. A agenda aceita entrada manual e só vincula um registro se você o selecionar. O catálogo identifica o produto, não a apresentação nem a classe do receituário; não recomenda dose, substituição ou uso.
- **Meus locais de atendimento:** informe o CNES e clique em **Buscar CNES**. Confirme a unidade antes de salvar. Estabelecimentos desabilitados, respostas divergentes ou endereços não confirmados não recebem o vínculo. O preenchimento manual fica disponível. O cadastro do local não comprova vínculo de trabalho, credenciamento SUS/RNDS ou autorização para atender.
- Locais confirmados compartilham uma referência à unidade oficial, enquanto os horários são particulares do profissional. Atendimentos mantêm o endereço/nome registrado; não se refaz retroativamente a ligação de registros históricos.

## Manutenção do catálogo

A edição inicial contém 10.326 registros de produtos marcados ativos no arquivo da Anvisa importado em 09/11/2026, deduplicados pelo número de registro de nove dígitos. Não é consulta de vigência em tempo real. O arquivo compactado inclui a data de importação e o SHA-256 do CSV original.

Baixe [DADOS_ABERTOS_MEDICAMENTOS.csv](https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv) e execute:

    python3 server/scripts/import-anvisa-catalog.py caminho/medicamentos.csv AAAA-MM-DD

Revise o diff de contagem e publique a nova edição junto à aplicação. Não habilita receitas controladas; essas dependem de homologação por tipo de receituário. A busca usa a edição local e não envia nomes de medicamentos ou dados de pacientes à Anvisa. A consulta CNES envia apenas o código público e o CEP da unidade aos respectivos serviços.

## Próximos campos a dirigir

- Pesquisa de estabelecimento por nome + município/UF com seleção da unidade exata (não vincular por nome sozinho).
- Exames por código de procedimento (TUSS para intercâmbio com operadoras, quando aplicável; LOINC para resultados quando fornecido pelo laboratório), com unidade e faixa de referência da origem.
- Especialidade vinculada ao RQE quando confirmado pelo conselho, distinguindo especialidade declarada de verificada.
- Importações clínicas: reconciliar identificadores de origem com cadastro local; quando a correspondência é ambígua, manter em conferência.
- Operadoras e planos: buscar cadastro público aplicável e guardar código de operadora separadamente da identificação da carteirinha. Vincular autorização de exame apenas após confirmação da operadora.

Fontes: [DEMAS / CNES](https://apidadosabertos.saude.gov.br/), [Dados Abertos Anvisa](https://dados.anvisa.gov.br/dados/), [Memed](https://doc.memed.com.br/).
