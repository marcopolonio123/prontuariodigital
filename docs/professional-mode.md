# MyDoctor — Modo Profissional / Clinicar

## Princípio do produto

O MyDoctor possui um único cadastro, um único login e uma única identidade de usuário.

Uma mesma pessoa pode ser simultaneamente:

- paciente, com seu próprio prontuário;
- responsável por dependentes;
- profissional de saúde verificado;
- profissional associado a uma ou mais organizações de saúde.

A condição de profissional não substitui a condição de paciente. Ela adiciona capacidades à mesma conta.

## Habilitação da função Clinicar

A função `Clinicar` só deve aparecer para uma conta cujo perfil profissional esteja com status `verified` e registro profissional ativo/verificado.

Fluxo sugerido de verificação:

1. Usuário escolhe `Quero usar o MyDoctor como profissional`.
2. Informa profissão e entidade de classe (CRM, CREFITO, CRN, COREN, CRO ou outra suportada).
3. Informa número do registro e UF/região.
4. MyDoctor procura primeiro no cadastro mestre de profissionais.
5. Usuário comprova identidade por documentos/evidências adequadas.
6. MyDoctor compara identidade civil com o titular do registro profissional.
7. Registro profissional é verificado em fonte confiável/oficial quando disponível.
8. Perfil passa para `verified` somente após aprovação das verificações necessárias.

Estados previstos:

- `unverified`
- `pending`
- `verified`
- `rejected`
- `suspended`

## Evidências de verificação profissional

A verificação pode utilizar, conforme necessidade e disponibilidade:

- documento da entidade de classe;
- fotografia/selfie ou prova de vida;
- documento oficial de identidade;
- CPF ou outro identificador necessário para conferência;
- confirmação em fonte oficial/conselho profissional;
- revisão manual em casos de exceção.

Imagens e documentos sensíveis não devem ser armazenados diretamente como texto/base64 no PostgreSQL. O arquivo deve ficar em Object Storage seguro e o banco deve guardar somente metadados, chave do objeto, hash, tipo, status de verificação, datas e auditoria.

A aplicação deve aplicar minimização de dados: guardar apenas os dados pessoais estritamente necessários ao processo de verificação.

## Cadastro mestre de profissionais

O cadastro mestre usa:

- `RegistryAuthority`: entidade/conselho (CRM, CREFITO, CRN, COREN, CRO etc.);
- `Practitioner`: pessoa/profissional;
- `ProfessionalRegistration`: vínculo entre profissional, conselho, número e região.

Regra de identidade profissional de negócio:

`authorityId + registration + region`

Ao cadastrar manualmente um atendimento, o usuário não deve digitar livremente nome do médico quando houver correspondência na base. Deve selecionar o profissional encontrado pelo conselho + número + UF. O evento clínico mantém também snapshots históricos do nome, conselho, número, UF e especialidade.

## Cadastro mestre de organizações

Hospitais, clínicas, laboratórios e consultórios devem usar `Organization` e `OrganizationIdentifier`.

Identificadores possíveis:

- CNES;
- CNPJ;
- identificador interno MyDoctor;
- identificador de parceiro/integrador.

Regra de identidade externa de organização já prevista:

`system + value`

A seleção da instituição deve priorizar busca na base mestre, evitando texto livre quando houver correspondência confiável.

## Fluxo Clinicar

### 1. Solicitação de acesso

O profissional verificado entra em `Clinicar` e solicita acesso ao prontuário de um paciente MyDoctor.

A solicitação deve informar claramente:

- identidade do profissional;
- profissão;
- conselho, número e UF;
- organização associada ao atendimento, quando aplicável;
- escopo solicitado;
- finalidade;
- duração/validade do acesso.

### 2. Autorização do paciente

O paciente/responsável recebe a solicitação dentro do MyDoctor.

O acesso nunca é automático.

O paciente escolhe se autoriza e qual escopo libera, por exemplo:

- histórico clínico;
- documentos/exames;
- sinais vitais;
- medicamentos/prescrições;
- convênio;
- leitura completa permitida pelo produto.

A autorização de acesso é independente da autorização para incorporar um novo registro profissional ao prontuário.

### 3. Atendimento profissional

Com acesso válido, o profissional pode consultar somente o conteúdo autorizado e registrar o atendimento.

O novo atendimento deve conter obrigatoriamente autoria e proveniência:

- paciente;
- profissional (`practitionerId`);
- usuário autenticado que escreveu (`authoredByUserId`);
- organização, quando aplicável;
- autorização usada (`accessGrantId`);
- data/hora;
- origem MyDoctor profissional;
- snapshots históricos do profissional e da organização.

### 4. Registro pendente de confirmação

O atendimento criado pelo profissional não entra imediatamente como evento definitivo do prontuário longitudinal.

Estados recomendados para atendimento profissional:

- `draft`
- `submitted`
- `patient_confirmed`
- `final`
- `patient_disputed`
- `amended`
- `cancelled`

Após `submitted`, o paciente recebe a notificação de que o profissional deseja incorporar aquele atendimento ao seu prontuário.

### 5. Confirmação do paciente

O paciente pode:

- `Confirmar e anexar ao prontuário`;
- `Contestar / solicitar revisão`.

O paciente não edita diretamente o texto clínico escrito pelo profissional. Se houver discordância, registra contestação/observação própria. O profissional pode emitir retificação/adendo preservando a versão anterior.

Depois da confirmação, o evento passa a compor o prontuário longitudinal definitivo.

## Auditoria

Toda ação profissional deve ser auditável:

- quem solicitou acesso;
- quem autorizou;
- data/hora da autorização;
- escopo concedido;
- validade;
- revogação;
- quem consultou;
- quem escreveu;
- qual organização estava associada;
- quando o atendimento foi enviado;
- quando o paciente confirmou/contestou;
- retificações posteriores.

Revogar um acesso impede novas consultas/escritas, mas não remove eventos clínicos já incorporados nem a trilha de auditoria.

## Associação profissional x organização

Uma clínica/hospital não deve ser dona da identidade do profissional.

O profissional mantém uma identidade MyDoctor verificada e pode possuir vínculos com várias organizações.

O vínculo deve guardar, entre outros:

- practitionerId;
- organizationId;
- função/cargo;
- especialidade local, se aplicável;
- status;
- início e fim do vínculo;
- fonte/forma de confirmação.

## Modelo comercial inicial

Diretriz de produto:

- paciente final é o centro do MyDoctor;
- profissional verificado pode usar o fluxo básico `Clinicar` gratuitamente;
- a gratuidade do profissional favorece adoção e enriquecimento do prontuário do paciente;
- monetização profissional/institucional pode ocorrer em capacidades adicionais de clínicas/hospitais: equipes, unidades, agenda, integrações, interoperabilidade, analytics, gestão administrativa, identidade institucional e recursos empresariais.

Uma pessoa profissional continua podendo contratar/utilizar funcionalidades de paciente normalmente para o próprio prontuário e família.

## Próximos passos técnicos

1. Criar persistência de evidências de verificação profissional em Object Storage + metadados no banco.
2. Criar vínculo Practitioner ↔ Organization.
3. Criar API de solicitação, aprovação, revogação e consulta de acesso.
4. Criar API de atendimento profissional em estado `submitted`.
5. Criar consentimento separado de incorporação do evento pelo paciente.
6. Criar UX `Perfil profissional` e `Clinicar` sem login separado.
7. Criar UX de `Solicitações` para o paciente.
8. Revisar em etapa separada todas as chaves UNIQUE/regras anti-duplicidade do modelo, sem confundir com chaves primárias.
