# Piloto MyDoctor — Memed em homologação

Ambiente local isolado. Não utiliza banco, sessão, arquivos ou pacientes do MyDoctor.
O servidor nunca chama a API de produção. Os eventos do navegador são apenas
sinais do teste; não comprovam assinatura, dispensação ou existência de uma receita válida.

## Como executar

1. Em [Primeiros passos da Memed](https://doc.memed.com.br/docs/primeiros-passos/),
   obtenha as chaves públicas de homologação e siga a etapa de cadastro de
   prescritor usando dados de teste permitidos pelo fornecedor. Use um
   identificador externo exclusivo com prefixo `mydoctor-test-` e pelo menos
   oito caracteres depois dele. Não reutilize o identificador de um profissional real.
2. Configure as variáveis locais `MEMED_TEST_API_KEY`, `MEMED_TEST_SECRET_KEY` e
   `MEMED_TEST_PRESCRIBER` (o identificador do passo anterior). Não inclua
   chaves no código, URLs do navegador ou capturas de tela.
3. Execute `node experiments/memed/server.mjs` e acesse
   `http://127.0.0.1:8792` na mesma máquina.
4. Clique em conectar e abra o módulo. O piloto recupera o token do prescritor
   pelo servidor e carrega um paciente fictício fixo, sem buscar cadastro no MyDoctor.
   Emissão/exclusão no módulo, quando disponíveis, mostram apenas a notificação
   na página. O piloto não envia SMS ou e-mails por conta própria.
5. O ambiente do fornecedor tem janelas de disponibilidade. Use somente dados
   sintéticos e não configure certificado real no piloto.

## Critérios para disponibilizar receita real no MyDoctor

- Concluir homologação e solicitar [credenciais de produção](https://doc.memed.com.br/docs/obter-credenciais/).
- Vincular sessão de emissão a médico, CRM/UF regular, paciente autorizado e
  atendimento. Proteger o token, isolar o módulo do restante do prontuário e
  enviar somente dados exigidos no contrato do provedor.
- Confirmar a prescrição no servidor pelo identificador de origem, vinculando
  prescritor e paciente. Eventos do navegador não são prova de emissão.
  Tratar exclusões, cancelamentos, reenvios e revisões sem duplicar documentos.
- Preservar o documento digital original, verificar assinatura do prescritor
  e conferir integridade; distinguir emitida, assinada, cancelada e dispensada.
  Homologar a consulta e a dispensação com farmácia parceira.
- Iniciar por receitas simples. Habilitar categorias com retenção/controle
  somente após verificar a cobertura do provedor e as exigências vigentes da
  Anvisa e do SNCR por categoria. Receita importada por FHIR continua sendo
  registro clínico importado, sem marca automática de assinatura verificada.
- A integração com operadoras no padrão TISS é um fluxo separado de troca
  assistencial/administrativa; não confere validade à receita para dispensação.

Referências: [Memed](https://doc.memed.com.br/),
[SNCR / Anvisa](https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/controlados/sncr),
[Validador ITI](https://validar.iti.gov.br/),
[TISS / ANS](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss).
