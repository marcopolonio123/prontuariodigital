# Integrações clínicas MyDoctor — contrato de entrada v1

Implementação de entrada autorizada de documentos em **HL7 FHIR R4 (4.0.1)**. Este é um contrato restrito do MyDoctor, não um servidor FHIR completo, nem uma declaração de homologação RNDS. Nenhuma empresa ou laboratório é conectado automaticamente ao ser cadastrado.

## Configurações → Integrações

- Administrador cadastra empresa e recebe uma chave de integração exibida uma única vez. Banco guarda somente SHA-256; a chave é aleatória de 256 bits. Desativar empresa invalida a credencial. Para substituir uma chave comprometida, desativar e recadastrar a empresa (novas autorizações necessárias).
- Paciente ou tutor atual autoriza empresa, assuntos e prazo (até 365 dias), revogável. Não pode haver duas autorizações vigentes do mesmo parceiro para o mesmo paciente.
- Código da autorização vincula o envio ao prontuário. Não é CPF, número de usuário ou número de prontuário; não deve ser usado para busca pública.
- Empresa envia um Bundle por documento/item. Chave de parceiro **não permite leitura** de dados clínicos, nem alteração de cadastro ou de registros existentes.
- Recebimento cria pendência. Paciente/tutor confere e confirma ou recusa em Integrações. Apenas a confirmação cria evento no prontuário. Mesmo depois da confirmação, edição manual do documento integrado é bloqueada.
- Revogação, expiração, troca de tutor ou desativação da empresa impedem novos recebimentos e incorporações. Documentos já confirmados continuam no prontuário e com origem preservada. Recusa não apaga a evidência recebida.

## Autenticação e envio

`POST /api/v1/integrations/fhir/r4/Bundle`

Headers:

```http
Authorization: Bearer <chave mdi_... fornecida ao parceiro>
X-MyDoctor-Consent: <código da autorização>
Content-Type: application/json
```

`Bundle.type=collection`, até 50 recursos e 512 KB; um único recurso principal Encounter, DiagnosticReport ou MedicationRequest. Todos os recursos clínicos precisam de `subject.reference="Patient/<código da autorização>"`. Esse identificador é um alias exclusivo daquela autorização; nunca utilizar uma busca aproximada ou um nome para escolher paciente.

`id` obrigatório em todos os recursos. Referências auxiliares devem resolver no mesmo Bundle por `Tipo/id` ou `fullUrl=urn:uuid:...`. Não são consultadas URLs arbitrárias. Patient não é recebido nesse endpoint: seus dados cadastrais permanecem no cadastro do MyDoctor.

Recurso principal exige `identifier[0].system` URI da origem, `identifier[0].value` identificador estável e `meta.versionId`. Data/hora exige fuso (`Z` ou `-03:00`), evitando alteração silenciosa de horário.

| Assunto | Recurso principal | Conteúdo complementar |
|---|---|---|
| Atendimento | Encounter finished com class e period.start | Practitioner/Role, Organization, Location, Condition, Procedure e Composition final referenciando o Encounter |
| Laboratório | DiagnosticReport final/amended/corrected/appended com category LAB | Observations referenciadas em result, códigos, valores, unidades, intervalos de referência e interpretação |
| Imagem | DiagnosticReport final/amended/corrected/appended com category RAD | ImagingStudy: identificadores DICOM, séries/instâncias e referências ao PACS |
| Receita | MedicationRequest active/completed/stopped/cancelled, intent de prescrição, authoredOn | Medication ou medicationCodeableConcept, dosagem, via, frequência, quantidade, prescritor |

`LAB`/`RAD` utilizam `http://terminology.hl7.org/CodeSystem/v2-0074`. Códigos como LOINC e unidades UCUM são preservados. Terminologias não são convertidas ou licenciadas automaticamente.

Recursos auxiliares permitidos: Composition, Observation, ImagingStudy, Practitioner, PractitionerRole, Organization, Location, Medication, Condition, Procedure, Endpoint, DocumentReference e Specimen. Recusamos recursos contidos, implicitRules, modifierExtension e anexos binários/base64. Suporte a componentes/painéis laboratoriais complexos exige adaptação do contrato: o resultado de cada Observation diretamente referenciada deve ter valor ou dataAbsentReason.

O original completo é preservado (inclusive detalhes que ainda não tenham coluna visual específica), com SHA-256 canônico, origem, versão e auditoria. Resumo textual não executa XHTML recebido. O contrato não substitui um validador FHIR completo/perfil de cada parceiro; validar os exemplos no validador oficial e realizar homologação bilateral antes de dados reais.

### Retornos

- 202: recebido aguardando conferência; receiptId, status, duplicate=false.
- 200: reenvio idêntico da mesma chave origem/paciente/identificador/versão; duplicate=true.
- 409: versão existente com conteúdo diferente, limite de pendências/cota, autorização duplicada ou conflito de conferência.
- 401: chave inválida/desativada.
- 403: autorização inválida, escopo não permitido ou paciente/tutor sem permissão.
- 422: documento fora do contrato (inclui paciente divergente).
- 429: acima de 30 envios/minuto por processo/parceiro.

Não há endpoint de consulta de histórico para o parceiro. A confirmação devolve recibo; uma chave de parceiro não autoriza consulta ao recibo clínico. Credenciais de usuário não substituem a chave do parceiro no recebimento.

### Versões e correções

Reenvio idêntico não duplica. Uma nova versão é guardada separadamente, nunca sobrescreve silenciosamente a anterior. **Se já houver versão confirmada desse documento, a incorporação da correção fica bloqueada para conciliação assistida**. O fluxo de conciliação ainda não está implementado. Não rebatizar o identificador para contornar esse controle.

### Arquivos e assinatura

PDFs/imagens e objetos DICOM não são copiados por este endpoint. DocumentReference/ImagingStudy podem descrever referências da origem; o sistema não faz download automático e não oferece links externos clicáveis nessa primeira versão. O upload manual existente continua no R2 privado. Vincular importação automática de arquivos com autenticação do repositório, inspeção e contabilização é etapa específica do conector.

Receita importada **não significa assinatura ICP-Brasil validada**, não substitui receituário legal e não cria agenda de medicamentos automaticamente. Não é prescrição emitida pelo MyDoctor. Status original e instruções são preservados para conferência.

Os Bundles recebidos contam no armazenamento da conta proprietária e têm limite de 100 pendências por paciente. PK, UK e FKs preservadas: além das relações simples, FKs compostas impedem receipt/consent/event de atravessar paciente ou empresa. Auditoria registra recebimento, decisão, autorização/revogação e gestão do parceiro, sem registrar chaves.

## SUS / RNDS — preparação institucional

Tela separada dentro de Integrações, visível aos usuários, configuração institucional restrita ao administrador: ambiente, CNES e identificador do solicitante. Salvar esses campos **não estabelece conexão** e mantém connected=false. Nenhuma chamada clínica RNDS é disparada por esta versão. Nenhum certificado ou senha gov.br é solicitado na tela.

Para conexão real faltam credenciamento institucional, certificado ICP-Brasil autorizado, implementação de mTLS/EHR Auth, conformidade dos perfis específicos (RAC/REL etc.), evidências de homologação e liberação DATASUS. FHIR genérico não equivale aos perfis RNDS. A API RNDS não deve ser apresentada como autorização irrestrita de baixar o histórico do Meu SUS Digital. A disponibilidade de leitura/envio depende do acesso concedido ao estabelecimento e do serviço autorizado.

Referências oficiais:

- https://hl7.org/fhir/R4/
- https://hl7.org/fhir/R4/diagnosticreport.html
- https://hl7.org/fhir/R4/medicationrequest.html
- https://fhir.saude.gov.br/
- https://fhir.saude.gov.br/pt-BR/credenciamento.html
- https://fhir.saude.gov.br/pt-BR/integracao.html
- https://fhir.saude.gov.br/rel/

## Validação

`npm --prefix server run prisma:generate`, `npm --prefix server run build`, `node server/scripts/fhir-contract-smoke.mjs`.

O CI aplica a migração duas vezes em PostgreSQL descartável e executa `server/scripts/integrations-smoke.mjs` com NODE_ENV=test, cobrindo autorização, isolamento, duplicatas, concorrência, versões, revogação/expiração e preparação RNDS. Não executar fixtures em produção.
