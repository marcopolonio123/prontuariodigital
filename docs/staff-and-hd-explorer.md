# Meu HD e equipe profissional

## Perfis e capacidades

Uma conta mantém seus dados e prontuário pessoal. Capacidades podem se acumular: usuário comum; tutor/responsável vigente; profissional de saúde validado/ativo; administrador (lista MYDOCTOR_ADMIN_EMAILS, conforme configuração atual apenas marcopolonio123@gmail.com); atendente/secretária com vínculo aceito e vigente. Dependente é um cadastro de paciente; acesso compartilhado é uma autorização com escopo/prazo, não um novo perfil com poderes ilimitados.

Não se compartilham senha, sessão ou token entre médico e atendente. User.role permanece compatível com as versões anteriores; a capacidade de atendente é derivada de ProfessionalStaff ativo e da habilitação vigente do profissional.

## Equipe

Profissional → Minha equipe permite pesquisar usuários já cadastrados por nome, número sequencial ou e-mail exato. Resultados mostram nome/número e e-mail mascarado, sem dados clínicos. O convite exige e-mail confirmado, veda o próprio usuário e duplicidade de vínculo/convite ativo. Limite explícito: 50 vínculos/convites ativos por profissional. O atendente aceita ou recusa usando seu próprio login em Acessos e confirmações → Atendente / secretária. Pode atuar para vários profissionais e deve escolher explicitamente o contexto. O profissional pode ter vários atendentes.

Ambos podem revogar. Revogar não apaga compromissos ou solicitações já enviados; encerra novos acessos do atendente. Mudança de status é versionada. Vínculo é revalidado no servidor em cada acesso e novamente sob trava na transação de gravação, para serializar com revogações. Profissional suspenso/inativo ou que desmarcou seu cadastro de saúde não permite atuação delegada.

Rotas delegáveis, exclusivamente:

- GET/POST /professional/agenda: consulta, inclusão, edição e cancelamento de compromissos e situação dos retornos na agenda. Retorno clínico mantém data/descrição no atendimento de origem.
- GET /professional/agenda/patients: busca administrativa de paciente, sem autorização prévia, com documento mascarado e número de prontuário.
- GET /professional/locations: locais/horários para preenchimento da agenda, sem edição do cadastro.
- GET/POST /professional/access-requests: consulta e solicitação de autorização em nome do profissional.

X-MyDoctor-Professional é apenas o contexto solicitado, nunca uma prova de acesso. Todas as outras rotas continuam autenticando a pessoa real e ignoram esse cabeçalho; não herdam privilégios do médico. Nenhuma rota clínica, de documentos pessoais, Meu HD, tutoria, aprovação administrativa ou edição de locais foi delegada. A secretária não escreve diagnósticos/prescrições/evoluções e não aprova autorizações em nome do paciente.

AccessRequest.requesterUserId/practitionerId continuam sendo do médico. submittedByUserId identifica quem enviou; a tela do paciente mostra o atendente quando aplicável. O médico recebe a autorização, segundo as seções, validade e decisão do paciente/tutor. Duplicidade de pedido pendente e autorização já vigente seguem o controle existente. ProfessionalStaffAudit registra convite, aceite, recusa, revogação, alteração de agenda e solicitação de acesso, com ator real. O médico consulta as 100 ações mais recentes na equipe.

## Meu HD

Árvore de diretórios, caminho clicável, pastas/subpastas, ícones por tipo, modos lista/ícones e barra de ações fixa durante rolagem. Upload sempre aparece, sujeito à franquia/permissão; download depende de arquivo selecionado. Excluir exige confirmação explícita e identifica arquivo/pasta. Pasta com arquivo ou subpasta não pode ser excluída; não existe remoção recursiva. Arrastar arquivos para a área do diretório abre a fila de upload na pasta atual. Os limites atuais de arquivo/cota continuam válidos.

Nomes de pastas são metadados. Chaves R2 dos arquivos pessoais permanecem em storage/contas/{conta}/arquivos/{uuid}; pastas médicas/identificação não são apresentadas ou alteradas. Cada pasta pai usa FK composta com a conta, impedindo árvore entre contas. Novas pastas aceitam até dez níveis; nomes são únicos por conta e pasta pai, inclusive na raiz (índice PostgreSQL NULLS NOT DISTINCT). A API não move pastas existentes, evitando ciclos. Arquivos podem mudar de pasta pela edição habitual.

Download usa o mesmo fluxo autenticado de visualização e URL assinada, com download=1 forçando Content-Disposition attachment, inclusive PDFs/imagens. Visualização continua disponível pelo fluxo seguro já existente. A migração não move nem copia objetos, não altera cotas nem muda a propriedade dos documentos.
