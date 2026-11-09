# Cadastros administrativos do MyDoctor

Caminho: **Gestão do MyDoctor → Cadastros administrativos**.

O servidor exige sessão válida e e-mail confirmado presente em `MYDOCTOR_ADMIN_EMAILS`, a lista já usada pela área de gestão. Informe endereços de e-mail separados por vírgula na configuração do servidor. O perfil clínico por si só não concede acesso administrativo.

Os quatro módulos são **Administradoras de saúde**, **Medicamentos**, **Profissionais** e **Estabelecimentos de saúde**. Cada um permite consultar, incluir e editar registros locais (nome, código interno opcional e descrição). O arquivamento é a exclusão lógica; registros arquivados podem ser consultados e reativados. O histórico vincula cada alteração ao administrador e à versão. Uma edição concorrente não sobrescreve a última versão.

A aba **Consultar referências** exibe operadoras da edição ANS, medicamentos da edição Anvisa, perfis profissionais do MyDoctor e estabelecimentos já cadastrados, identificando vínculos CNES conferidos. As referências são somente leitura. Códigos locais não são apresentados como registros oficiais. A inclusão de um profissional local não cria usuário, não concede acesso a prontuário e não aprova CRM ou RQE; a habilitação continua na área **Validação de profissionais**.

Os registros locais são administrativos. Não substituem a base oficial nas buscas da agenda, do convênio, do CNES ou na emissão de receita.
