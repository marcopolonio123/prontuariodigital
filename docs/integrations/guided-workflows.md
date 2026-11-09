# Cadastros dirigidos: unidade, RQE, exames e convênios

Complementa o PR #109. Nenhuma referência pública substitui a confirmação da pessoa, do atendimento ou de cobertura.

- **Unidades:** em Meus locais de atendimento, buscar por nome, UF e município quando o CNES for desconhecido. O IBGE fornece a lista de municípios. O DEMAS pagina por município (20 por lote); o MyDoctor filtra o nome no lote. Mesmo se um lote estiver vazio, é possível avançar. A seleção consulta o CNES exato antes de preencher; ao cadastrar, o servidor confere o código novamente. A consulta não confirma vínculo empregatício ou habilitação.
- **RQE:** informado pelo profissional para a especialidade e o CRM/UF selecionados. A administração pode conferir separadamente o RQE na fonte oficial e registra o resultado na auditoria da decisão. Sem essa conferência, continua declarado. Mudança no perfil ou nova decisão invalida a conferência anterior. Esta etapa é manual; o conector CFM do PR #108 tem ativação própria.
- **Exames integrados:** DiagnosticReport, Observation e ServiceRequest referenciado devem pertencer ao mesmo paciente autorizado. O código do laudo, os códigos de procedimentos solicitados e os códigos de resultados ficam separados. Os resultados exibem valor, unidade e faixa de referência da origem; o documento original é preservado. TUSS e LOINC não são inferidos nem convertidos entre si. A integração preserva o código informado na origem, sem homologá-lo contra um catálogo de procedimentos. Registros antigos continuam exibindo seu texto original.
- **Convênios:** seleção de operadora e plano na edição local da ANS. O servidor confirma o par e grava a edição utilizada. O número da carteirinha mantém os zeros e a formatação digitada. É possível informar operadora/plano manualmente quando ausentes da edição. A presença no catálogo não confirma elegibilidade ou cobertura.

## Atualização das referências

A edição de 09/11/2026 inclui 1.100 operadoras e 29.111 planos ativos com registro de nove dígitos e operadora presente na edição. Os dados foram reduzidos a identificador e informações de exibição, sem contatos de representantes. A base IBGE contém 5.571 municípios. Para atualizar, baixe as fontes e execute:

    python3 server/scripts/import-guided-references.py operadoras.csv planos.csv municipios.html AAAA-MM-DD

Fontes:
- https://dadosabertos.ans.gov.br/FTP/PDA/operadoras_de_plano_de_saude_ativas/
- https://dadosabertos.ans.gov.br/FTP/PDA/caracteristicas_produtos_saude_suplementar-008/
- https://www.ibge.gov.br/explica/codigos-dos-municipios.php
- https://apidadosabertos.saude.gov.br/
- https://hl7.org/fhir/R4/diagnosticreport.html
