# MyDoctor — Arquitetura-alvo

## Objetivo

Construir um prontuário longitudinal de vida/saúde, preparado para milhões de usuários, aplicativos Android/iOS/Web, documentos clínicos, OCR/IA e interoperabilidade futura com hospitais, clínicas, laboratórios, consultórios e ecossistemas públicos como a RNDS/SUS.

## Princípios

1. PostgreSQL é a fonte transacional da verdade.
2. Arquivos clínicos nunca são armazenados como blobs no banco relacional; ficam em Object Storage privado e criptografado.
3. Todo fato clínico relevante entra na linha do tempo como `HealthEvent`.
4. Todo evento preserva data/hora, tipo, origem, local/instituição e autoria profissional quando aplicável.
5. Dados importados carregam proveniência e nunca perdem a referência da fonte original.
6. OCR/IA produz dados derivados; o documento original é preservado e resultados de baixa confiança exigem revisão.
7. A modelagem deve ser mapeável para HL7 FHIR sem exigir que o banco replique literalmente o padrão.
8. Consentimento, autorização e auditoria são domínios de segurança, não detalhes de interface.
9. Começar como modular monolith com fronteiras claras e evoluir serviços de forma independente quando escala justificar.
10. Dados de saúde não são produto publicitário.

## Domínios

- Identity & Access
- Patients & Delegation
- Longitudinal Clinical Record
- Practitioners & Registries
- Organizations & Locations
- Documents & OCR
- Interoperability / FHIR
- Consent & Audit
- Notifications
- Subscriptions & Entitlements

## Registro clínico longitudinal

`HealthEvent` é a unidade central da timeline. Deve registrar no mínimo:

- paciente;
- data/hora e fuso;
- tipo do evento;
- status;
- profissional/agente de saúde quando aplicável;
- conselho, registro e região quando aplicável;
- organização e local;
- sistema de origem;
- conteúdo clínico;
- proveniência;
- documentos associados.

Snapshots de profissional, registro, organização e local são mantidos no evento para preservar a verdade histórica caso os cadastros mestres mudem posteriormente.

## Cadastros mestres

### Practitioner

Profissional/agente de saúde, associado a uma ou mais inscrições profissionais.

### RegistryAuthority

Autoridades/conselhos como CRM, CREFITO, COREN e CRO. Integrações oficiais de validação devem ser implementadas por adaptadores quando houver API, convênio ou mecanismo autorizado disponível.

### Organization

Hospitais, clínicas, laboratórios, consultórios, unidades públicas e demais organizações de saúde. Identificadores externos (por exemplo CNES/CNPJ quando aplicável) ficam separados da entidade principal.

### Location

Local físico do atendimento, associado opcionalmente a uma organização.

## Documentos

Fluxo-alvo:

`Upload -> Object Storage -> fila -> classificação -> extração de texto/OCR -> extração estruturada -> validação/revisão -> indexação -> timeline`

O PostgreSQL armazena metadados, hash SHA-256, proveniência, status e extrações. PDFs e imagens permanecem no Object Storage.

## Interoperabilidade

Criar uma camada `Interoperability Hub` desacoplada do modelo de persistência. Adaptadores externos convertem formatos de parceiros para um modelo canônico mapeável a FHIR.

Recursos FHIR prioritários:

- Patient
- Practitioner / PractitionerRole
- Organization / Location
- Encounter
- Observation
- DiagnosticReport
- MedicationRequest
- AllergyIntolerance
- Procedure
- Immunization
- DocumentReference
- Provenance
- Consent

Integrações com RNDS/SUS ou outros órgãos somente serão ativadas após validação dos requisitos oficiais vigentes, credenciamento, autenticação, certificados e bases legais/consentimentos necessários.

## Escala

Arquitetura evolutiva:

`Android/iOS/Web -> API Gateway -> Identity/API -> módulos clínicos -> PostgreSQL`

Processamento assíncrono:

`Upload/Integração -> Object Storage/Event Bus -> Workers OCR/IA -> PostgreSQL + Search Index`

Componentes previstos conforme necessidade de escala:

- PostgreSQL gerenciado com réplicas e estratégia futura de particionamento;
- Object Storage compatível com S3;
- Redis para cache, rate limiting e dados efêmeros;
- fila/event bus para tarefas assíncronas;
- mecanismo de busca textual;
- índice vetorial somente para recursos de IA/busca semântica;
- observabilidade centralizada;
- backups e disaster recovery.

## Autenticação

Três opções de acesso ao app:

1. biometria digital nativa do dispositivo;
2. reconhecimento facial nativo do dispositivo;
3. login + senha + segundo fator enviado ao e-mail ou celular previamente cadastrado/validado.

O MyDoctor não armazena templates biométricos do sistema operacional.

## Monetização

Planos são representados por `Plan`, `PlanEntitlement` e `Subscription`. Recursos nunca devem depender de uma flag global `premium`.

Planos iniciais previstos:

- Free
- Individual
- Family
- Professional
- Enterprise

Preços e limites são decisões comerciais configuráveis e não devem ser hardcoded no aplicativo.

## Migração do protótipo

O campo JSON legado de `Patient` permanece temporariamente para compatibilidade. Novos domínios clínicos devem ser criados nas estruturas normalizadas. A migração deve ocorrer incrementalmente para evitar quebrar o protótipo enquanto a plataforma é reconstruída.
